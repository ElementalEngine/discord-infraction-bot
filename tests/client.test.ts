import assert from 'node:assert/strict';
import { test } from 'node:test';

import './env.js';

const { createApi } = await import('../src/api/client.js');
const { ApiError, NoAnswer } = await import('../src/api/errors.js');

type Call = { url: string; method: string; headers: Headers; body: unknown };

const MEMBER = '123456789012345678';
const STAFF = '223456789012345678';

const envelope = (code: string, retryable: boolean, nested = true): unknown => {
  const error = { code, message: `${code} message`, retryable, correlation_id: 'abc123' };
  return nested ? { detail: { error } } : { error };
};

// A fetch that answers from a script and records each call.
function scripted(...answers: (Response | Error)[]): { fetcher: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetcher = (async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET', headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)]!;
    if (answer instanceof Error) throw answer;
    return answer.clone();
  }) as typeof fetch;
  return { fetcher, calls };
}

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status });
const cleared = (value: boolean) => ({ discord_id: MEMBER, cleared: value, suspended: false, suspended_roles: ['111111111111111111'] });
const api = (fetcher: typeof fetch) => createApi('http://core.test', 'token', fetcher, 1000);

test('a staff write goes to v2 with the token, the actor and its body', async () => {
  const { fetcher, calls } = scripted(json(200, { discord_id: MEMBER }));
  await api(fetcher).tier(MEMBER, 'minor', STAFF, 'late', ['111111111111111111']);
  assert.equal(calls[0]!.url, `http://core.test/api/v2/infractions/${MEMBER}/tier/minor`);
  assert.equal(calls[0]!.method, 'POST');
  assert.equal(calls[0]!.headers.get('authorization'), 'Bearer token');
  assert.equal(calls[0]!.headers.get('x-actor-discord-id'), STAFF);
  assert.deepEqual(calls[0]!.body, { reason: 'late', suspended_roles: ['111111111111111111'] });
});

test('the expiry loop and the join send no actor', async () => {
  const { fetcher, calls } = scripted(json(200, cleared(true)), json(200, { applied: false }));
  await api(fetcher).expire(MEMBER);
  await api(fetcher).applyPending(MEMBER, []);
  assert.deepEqual(calls.map((call) => call.headers.get('x-actor-discord-id')), [null, null]);
  assert.equal(calls[1]!.url, `http://core.test/api/v2/infractions/${MEMBER}/pending/apply`);
});

test('a conflict core-api calls retryable is sent once more, then the answer is used', async () => {
  const { fetcher, calls } = scripted(json(409, envelope('CONFLICT', true)), json(200, { discord_id: MEMBER, tier: 2 }));
  assert.equal((await api(fetcher).tier(MEMBER, 'quit', STAFF, null, [])).tier, 2);
  assert.equal(calls.length, 2);
});

test('a refusal is never retried, and both envelope shapes are read', async () => {
  for (const nested of [true, false]) {
    const { fetcher, calls } = scripted(json(409, envelope('SUSPENSION_HELD', false, nested)));
    await assert.rejects(api(fetcher).days(MEMBER, 3, STAFF), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, 'SUSPENSION_HELD');
      assert.equal(error.error?.correlation_id, 'abc123');
      return true;
    });
    assert.equal(calls.length, 1);
  }
});

test('no answer to a staff write is never sent again, since it may have landed', async () => {
  const writes = [
    (a: ReturnType<typeof api>) => a.tier(MEMBER, 'quit', STAFF, null, []),
    (a: ReturnType<typeof api>) => a.flat(MEMBER, 'smurf', STAFF, null, []),
    (a: ReturnType<typeof api>) => a.days(MEMBER, 2, STAFF),
    (a: ReturnType<typeof api>) => a.removeTier(MEMBER, 'quit', STAFF),
  ];
  for (const write of writes) {
    const { fetcher, calls } = scripted(new TypeError('fetch failed'));
    await assert.rejects(write(api(fetcher)), NoAnswer);
    assert.equal(calls.length, 1);
  }
});

test('no answer to a read, a pending entry or a join is asked again', async () => {
  const again = [
    [(a: ReturnType<typeof api>) => a.due(), json(200, { discord_ids: [], next_ends: null })],
    [(a: ReturnType<typeof api>) => a.setPending(MEMBER, 'smurf', STAFF, null), new Response(null, { status: 204 })],
    [(a: ReturnType<typeof api>) => a.applyPending(MEMBER, []), json(200, { applied: false })],
  ] as const;
  for (const [call, answer] of again) {
    const { fetcher, calls } = scripted(new TypeError('fetch failed'), answer);
    await call(api(fetcher));
    assert.equal(calls.length, 2);
  }
});

test('an answer cut off while it was read is no answer, not a failure before the write', async () => {
  const cut = new Response('{"discord_id":');
  Object.defineProperty(cut, 'text', { value: async () => Promise.reject(new TypeError('terminated')) });
  const fetcher = (async () => cut) as unknown as typeof fetch;
  await assert.rejects(api(fetcher).tier(MEMBER, 'quit', STAFF, null, []), NoAnswer);
});

test('an expiry or unsuspend whose answer was lost is asked again, as a repeat changes nothing', async () => {
  for (const call of [(a: ReturnType<typeof api>) => a.expire(MEMBER), (a: ReturnType<typeof api>) => a.unsuspend(MEMBER, STAFF, 'x')]) {
    const { fetcher, calls } = scripted(new TypeError('fetch failed'), json(200, cleared(false)));
    assert.equal((await call(api(fetcher))).suspended_roles.length, 1);
    assert.equal(calls.length, 2);
  }
});

test('a pending entry answers no content, and an empty success elsewhere is an error', async () => {
  const pending = scripted(new Response(null, { status: 204 }));
  assert.equal(await api(pending.fetcher).setPending(MEMBER, 'smurf', STAFF, null), undefined);
  assert.equal(pending.calls[0]!.method, 'PUT');
  const empty = scripted(new Response('', { status: 200 }));
  await assert.rejects(api(empty.fetcher).due(), NoAnswer);
});

test('the record and the laggers are plain reads', async () => {
  const { fetcher, calls } = scripted(json(200, { discord_id: MEMBER }), json(200, { members: [] }));
  await api(fetcher).record(MEMBER);
  await api(fetcher).laggers();
  assert.deepEqual(calls.map((call) => [call.method, call.url]), [['GET', `http://core.test/api/v2/infractions/${MEMBER}`], ['GET', 'http://core.test/api/v2/infractions/laggers']]);
});

test('each request carries a timeout', async () => {
  let signal: AbortSignal | null | undefined;
  const fetcher = (async (_input: string | URL, init?: RequestInit) => {
    signal = init?.signal;
    return json(200, { discord_ids: [], next_ends: null });
  }) as typeof fetch;
  await api(fetcher).due();
  assert.ok(signal instanceof AbortSignal);
});
