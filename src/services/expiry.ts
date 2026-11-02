import { setTimeout as wait } from 'node:timers/promises';

import type { DueSuspensions } from '../api/types.js';
import { unreachable } from '../ui/failure.js';
import { log } from '../utils/log.js';

const MINUTE_MS = 60_000;
// A floor, so a clock a little ahead of core-api's cannot spin the loop.
const FLOOR_MS = 1_000;
const PAGE = 100;

type ExpiryDeps = Readonly<{
  due(): Promise<DueSuspensions>;
  expire(id: string): Promise<void>;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}>;

const sleepUnlessStopped = (ms: number, signal: AbortSignal): Promise<void> => wait(ms, undefined, { signal }).catch(() => undefined);

// How long to wait: a full page goes again at once, else until the next end or a minute.
export function nextWaitMs(due: DueSuspensions, now: number): number {
  if (due.discord_ids.length >= PAGE) return 0;
  if (!due.next_ends) return MINUTE_MS;
  return Math.min(MINUTE_MS, Math.max(FLOOR_MS, Date.parse(due.next_ends) - now + FLOOR_MS));
}

// core-api says what is due and when the next end is, so nothing is held in memory:
// a restart, an outage or a changed end is picked up within a minute.
export function startExpiry(deps: ExpiryDeps): () => Promise<void> {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? sleepUnlessStopped;
  const stopping = new AbortController();
  let down = false;

  const run = async (): Promise<void> => {
    while (!stopping.signal.aborted) {
      let ms = MINUTE_MS;
      try {
        const due = await deps.due();
        if (down) log.info('core-api answers again: expiry resumed');
        down = false;
        let failed = false;
        for (const id of due.discord_ids) {
          if (stopping.signal.aborted) return;
          try {
            await deps.expire(id);
          } catch (error) {
            failed = true;
            log.error(`suspension of ${id} not ended`, error);
            if (unreachable(error)) break;
          }
        }
        // After a failure the page waits a minute, so a page that keeps failing cannot spin.
        ms = failed ? MINUTE_MS : nextWaitMs(due, now());
      } catch (error) {
        if (!down) log.warn('core-api not answering: expiry retries every minute', error instanceof Error ? error.message : error);
        down = true;
      }
      await sleep(ms, stopping.signal);
    }
  };

  const running = run();
  return async () => {
    stopping.abort();
    await running;
  };
}
