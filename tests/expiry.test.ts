import assert from 'node:assert/strict';
import { test } from 'node:test';

import './env.js';

const { nextWaitMs, startExpiry } = await import('../src/services/expiry.js');
const { NoAnswer } = await import('../src/api/errors.js');

const NOW = Date.parse('2026-11-02T12:00:00Z');
const at = (ms: number): string => new Date(NOW + ms).toISOString();
type Due = { discord_ids: string[]; next_ends: string | null };

// A fake API and clock: each due() answers the next script entry, and each
// sleep is recorded and ends at once, until the script runs out and stops the loop.
function harness(script: (Due | Error)[]) {
  const expired: string[] = [];
  const sleeps: number[] = [];
  let calls = 0;
  let done!: () => void;
  const finished = new Promise<void>((resolve) => (done = resolve));
  void startExpiry({
    due: async () => {
      const answer = script[calls++];
      if (answer === undefined) {
        done();
        return new Promise<Due>(() => undefined);
      }
      if (answer instanceof Error) throw answer;
      return answer;
    },
    expire: async (id) => {
      expired.push(id);
    },
    now: () => NOW,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { expired, sleeps, finished };
}

test('each due member is expired, then the loop sleeps until the next end', async () => {
  const h = harness([{ discord_ids: ['a', 'b'], next_ends: at(30_000) }]);
  await h.finished;
  assert.deepEqual(h.expired, ['a', 'b']);
  assert.deepEqual(h.sleeps, [31_000]);
});

test('the wait is never longer than a minute, nor shorter than a second', () => {
  assert.equal(nextWaitMs({ discord_ids: [], next_ends: null }, NOW), 60_000);
  assert.equal(nextWaitMs({ discord_ids: [], next_ends: 'not a time' }, NOW), 60_000);
  assert.equal(nextWaitMs({ discord_ids: [], next_ends: at(3_600_000) }, NOW), 60_000);
  assert.equal(nextWaitMs({ discord_ids: [], next_ends: at(-5_000) }, NOW), 1_000);
});

test('a full page goes again at once', () => {
  const page = Array.from({ length: 100 }, (_, i) => String(i));
  assert.equal(nextWaitMs({ discord_ids: page, next_ends: at(30_000) }, NOW), 0);
});

test('an outage is retried every minute, logged once, and the loop carries on after it', async () => {
  const writes: string[] = [];
  const write = process.stderr.write.bind(process.stderr);
  const out = process.stdout.write.bind(process.stdout);
  process.stderr.write = ((chunk: string) => (writes.push(String(chunk)), true)) as typeof process.stderr.write;
  process.stdout.write = ((chunk: string) => (writes.push(String(chunk)), true)) as typeof process.stdout.write;
  try {
    const h = harness([new TypeError('fetch failed'), new TypeError('fetch failed'), new TypeError('fetch failed'), { discord_ids: ['a'], next_ends: null }]);
    await h.finished;
    assert.deepEqual(h.sleeps, [60_000, 60_000, 60_000, 60_000]);
    assert.deepEqual(h.expired, ['a']);
  } finally {
    process.stderr.write = write;
    process.stdout.write = out;
  }
  assert.equal(writes.filter((line) => line.includes('not answering')).length, 1);
  assert.equal(writes.filter((line) => line.includes('answers again')).length, 1);
});

test('one member that fails does not stop the others', async () => {
  const expired: string[] = [];
  let done!: () => void;
  const finished = new Promise<void>((resolve) => (done = resolve));
  let calls = 0;
  void startExpiry({
    due: async () => {
      if (calls++ > 0) {
        done();
        return new Promise<Due>(() => undefined);
      }
      return { discord_ids: ['bad', 'good'], next_ends: null };
    },
    expire: async (id) => {
      if (id === 'bad') throw new Error('Missing Permissions');
      expired.push(id);
    },
    sleep: async () => undefined,
  });
  await finished;
  assert.deepEqual(expired, ['good']);
});

test('stopping ends the sleep and lets the loop finish', async () => {
  let calls = 0;
  const stop = startExpiry({
    due: async () => {
      calls++;
      return { discord_ids: [], next_ends: null };
    },
    expire: async () => undefined,
  });
  await new Promise((resolve) => setImmediate(resolve));
  const started = Date.now();
  await stop();
  assert.ok(Date.now() - started < 1_000);
  assert.equal(calls, 1);
});

test('a page that fails waits a minute, and no answer ends the page', async () => {
  const tried: string[] = [];
  const sleeps: number[] = [];
  let calls = 0;
  let done!: () => void;
  const finished = new Promise<void>((resolve) => (done = resolve));
  const page = Array.from({ length: 100 }, (_, i) => String(i));
  void startExpiry({
    due: async () => {
      if (calls++ > 0) {
        done();
        return new Promise<Due>(() => undefined);
      }
      return { discord_ids: page, next_ends: null };
    },
    expire: async (id) => {
      tried.push(id);
      throw new NoAnswer(new TypeError('fetch failed'));
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  await finished;
  assert.deepEqual([tried, sleeps], [['0'], [60_000]]);
});
