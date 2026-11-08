import { setTimeout as wait } from 'node:timers/promises';

import type { Suspended } from '../api/types.js';
import { log } from '../utils/log.js';
import { isSuspended, type Member } from './roles.js';

// One member read every 15 seconds, and the list from core-api once a minute.
const TICK_MS = 15_000;
const REFRESH_TICKS = 4;
// A member still unmarked after a check is tried again only after an hour, so a failure cannot repeat its post.
const RETRY_MS = 60 * 60_000;

type WatchDeps = Readonly<{
  suspended(): Promise<Suspended>;
  // The member, null when they are not in the server.
  member(id: string): Promise<Member | null>;
  joined(member: Member): Promise<void>;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}>;

export type Watch = Readonly<{
  seen(member: Member): void;
  stop(): Promise<void>;
}>;

const sleepUnlessStopped = (ms: number, signal: AbortSignal): Promise<void> => wait(ms, undefined, { signal }).catch(() => undefined);

// A member serving a suspension without the Suspended role came back unseen, as
// Discord does not always post a join message: a message, a voice change or the round finds them.
export function startWatch(deps: WatchDeps): Watch {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? sleepUnlessStopped;
  const stopping = new AbortController();
  let serving = new Set<string>();
  let round: string[] = [];
  const tried = new Map<string, number>();
  let down = false;

  const seen = (member: Member): void => {
    if (stopping.signal.aborted || !serving.has(member.id)) return;
    if (isSuspended(member)) return void tried.delete(member.id);
    const last = tried.get(member.id);
    if (last !== undefined && now() - last < RETRY_MS) return;
    tried.set(member.id, now());
    log.info(`${member.id} is serving without the Suspended role: checked as a join`);
    deps.joined(member).catch((error: unknown) => log.error(`return of ${member.id} not checked`, error));
  };

  const run = async (): Promise<void> => {
    for (let tick = 0; !stopping.signal.aborted; tick++) {
      try {
        if (tick % REFRESH_TICKS === 0) {
          serving = new Set((await deps.suspended()).discord_ids);
          for (const id of tried.keys()) if (!serving.has(id)) tried.delete(id);
        }
        if (!round.length) round = [...serving];
        const id = round.shift();
        const member = id && serving.has(id) ? await deps.member(id) : null;
        if (member) seen(member);
        down = false;
      } catch (error) {
        if (!down) log.warn('watch for unseen returns paused: retrying every 15 seconds', error instanceof Error ? error.message : error);
        down = true;
      }
      await sleep(TICK_MS, stopping.signal);
    }
  };

  const running = run();
  return {
    seen,
    stop: async () => {
      stopping.abort();
      await running;
    },
  };
}
