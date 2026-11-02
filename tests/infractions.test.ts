import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TierResult } from '../src/api/types.js';
import type { Ports } from '../src/services/infractions.js';
import type { Post } from '../src/ui/posts.js';

import { ID } from './env.js';

const flows = await import('../src/services/infractions.js');
const { ApiError } = await import('../src/api/errors.js');

const MEMBER = '123456789012345678';
const STAFF = '223456789012345678';
const ENDS = '2026-11-05T12:00:00Z';
const CIV6 = ID.ROLE_CIV6!;
const SUSPENDED = ID.ROLE_SUSPENDED!;
const OTHER = '999999999999999990';

type Answers = Partial<Record<keyof Ports['api'], unknown>>;

// A member whose role writes fail a set number of times.
function member(held: string[], failures = 0) {
  const roles = new Map(held.map((id) => [id, true]));
  const writes: string[][] = [];
  return {
    id: MEMBER,
    writes,
    roles: {
      cache: roles,
      set: async (next: readonly string[]) => {
        writes.push([...next]);
        if (failures-- > 0) throw new Error('Missing Permissions');
        roles.clear();
        for (const id of next) roles.set(id, true);
      },
    },
  };
}

// Ports that answer from a script and record what the flows did.
function ports(answers: Answers, present: ReturnType<typeof member> | null) {
  const calls: { name: string; args: unknown[] }[] = [];
  const posts: Post[] = [];
  const dms: string[] = [];
  const api = new Proxy({} as Ports['api'], {
    get: (_target, name: string) => async (...args: unknown[]) => {
      calls.push({ name, args });
      const answer = answers[name as keyof Ports['api']];
      if (answer instanceof Error) throw answer;
      return answer;
    },
  });
  const p: Ports = {
    api,
    member: async () => present,
    canGive: (id) => id !== OTHER,
    post: async (post) => (posts.push(post), true),
    dm: async (_id, text) => {
      dms.push(text);
    },
    retryMs: 0,
  };
  return { p, calls, posts, dms };
}

const tier = (over: Partial<TierResult>): TierResult => ({ discord_id: MEMBER, category: 'quit', tier: 2, days_added: 3, ends: ENDS, suspended: true, held: false, is_ban_threshold: false, is_warning_only: false, ...over });

test('a suspension saves the moved roles the member holds, then swaps them for Suspended', async () => {
  const m = member([CIV6, OTHER]);
  const h = ports({ tier: tier({}) }, m);
  const text = await flows.recordInfraction(h.p, STAFF, MEMBER, { kind: 'tier', category: 'quit' }, 'left early');
  assert.deepEqual(h.calls[0]!.args, [MEMBER, 'quit', STAFF, 'left early', [CIV6]]);
  assert.deepEqual(m.writes, [[OTHER, SUSPENDED]]);
  assert.equal(h.posts[0]!.facts.ends, ENDS);
  assert.equal(h.dms.length, 1);
  assert.match(text, /^✅ Suspended/);
});

test('a role write that fails twice is reported as recorded, never as a failure', async () => {
  // v1 answered "unexpected error" here, after the infraction had landed.
  const m = member([CIV6], 2);
  const h = ports({ tier: tier({}) }, m);
  const text = await flows.recordInfraction(h.p, STAFF, MEMBER, { kind: 'tier', category: 'quit' }, null);
  assert.equal(m.writes.length, 2);
  assert.match(text, /^⚠️ Suspended .* but staff must finish it by hand/);
  assert.match(h.posts[0]!.facts.todo ?? '', /Set by hand: remove <@&\d+> and add <@&\d+>/);
});

test('a failed post is reported as recorded, never as a failure', async () => {
  const h = ports({ tier: tier({}) }, member([]));
  h.p = { ...h.p, post: async () => false };
  assert.match(await flows.recordInfraction(h.p, STAFF, MEMBER, { kind: 'tier', category: 'quit' }, null), /^⚠️ Suspended .* but the post/);
});

test('a member not in the server gets a pending entry and no DM', async () => {
  const h = ports({ tier: tier({}) }, null);
  const text = await flows.recordInfraction(h.p, STAFF, MEMBER, { kind: 'tier', category: 'quit' }, 'gone');
  assert.deepEqual(h.calls.map((call) => call.name), ['tier', 'setPending']);
  assert.deepEqual(h.calls[0]!.args[4], []);
  assert.match(h.posts[0]!.facts.todo ?? '', /applies when they join/);
  assert.equal(h.dms.length, 0);
  assert.match(text, /^✅ Suspended/);
});

test('a pending entry that fails to write still answers that the suspension was recorded', async () => {
  const h = ports({ tier: tier({}), setPending: new TypeError('fetch failed') }, null);
  assert.match(await flows.recordInfraction(h.p, STAFF, MEMBER, { kind: 'tier', category: 'quit' }, null), /^✅ Suspended/);
});

test('a warning to a member not in the server writes no pending entry', async () => {
  // v1 told staff a suspension would apply when they rejoined.
  const h = ports({ tier: tier({ category: 'minor', tier: 1, days_added: 0, ends: null, suspended: false, is_warning_only: true }) }, null);
  await flows.recordInfraction(h.p, STAFF, MEMBER, { kind: 'tier', category: 'minor' }, 'rude');
  assert.deepEqual(h.calls.map((call) => call.name), ['tier']);
  assert.equal(h.posts[0]!.tone, 'warning');
  assert.equal(h.posts[0]!.facts.todo, 'Not in the server.');
});

test('a warning moves no roles', async () => {
  const m = member([CIV6]);
  const h = ports({ tier: tier({ category: 'minor', tier: 1, days_added: 0, ends: null, suspended: false, is_warning_only: true }) }, m);
  await flows.recordInfraction(h.p, STAFF, MEMBER, { kind: 'tier', category: 'minor' }, 'rude');
  assert.deepEqual(m.writes, []);
});

test('the ban threshold holds the member until staff act and pings the moderators', async () => {
  const h = ports({ tier: tier({ category: 'extreme', tier: 2, days_added: 0, ends: null, held: true, is_ban_threshold: true }) }, member([CIV6]));
  const text = await flows.recordInfraction(h.p, STAFF, MEMBER, { kind: 'tier', category: 'extreme' }, 'cheating');
  const post = h.posts[0]!;
  assert.equal(post.tone, 'held');
  assert.equal(post.pingModerators, true);
  assert.equal(post.facts.ends, null);
  assert.match(post.facts.result ?? '', /until staff ban them with Wick or run \/admin unsuspend/);
  assert.match(h.dms[0] ?? '', /24 hours to appeal/);
  assert.match(text, /held until staff act/);
});

test('a tier during a hold says the member is still held and pings no one', async () => {
  const h = ports({ tier: tier({ tier: 1, days_added: 0, ends: null, held: true }) }, member([]));
  await flows.recordInfraction(h.p, STAFF, MEMBER, { kind: 'tier', category: 'quit' }, null);
  assert.equal(h.posts[0]!.title, 'Still held');
  assert.notEqual(h.posts[0]!.pingModerators, true);
});

test('a refusal before anything is recorded is thrown for the router to show', async () => {
  const held = new ApiError(409, { detail: { error: { code: 'SUSPENSION_HELD', message: 'held', retryable: false } } });
  const h = ports({ flat: held }, member([CIV6]));
  await assert.rejects(flows.recordInfraction(h.p, STAFF, MEMBER, { kind: 'flat', type: 'smurf' }, null), ApiError);
  assert.equal(h.posts.length, 0);
});

test('unsuspending gives back the kept roles a step after core-api agrees', async () => {
  // v1 gave the roles back first, so a failed call left a suspended member with them.
  const m = member([SUSPENDED]);
  const h = ports({ unsuspend: { discord_id: MEMBER, cleared: true, suspended: false, suspended_roles: [CIV6] } }, m);
  await flows.unsuspend(h.p, STAFF, MEMBER, 'appeal upheld');
  assert.deepEqual(m.writes, [[CIV6]]);
  assert.equal(h.posts[0]!.title, 'Suspension lifted');
});

test('a role the bot may not give is left for staff, and the rest come back', async () => {
  const m = member([SUSPENDED]);
  const h = ports({ unsuspend: { discord_id: MEMBER, cleared: true, suspended: false, suspended_roles: [CIV6, OTHER] } }, m);
  const text = await flows.unsuspend(h.p, STAFF, MEMBER, 'appeal');
  assert.deepEqual(m.writes, [[CIV6]]);
  assert.match(h.posts[0]!.facts.todo ?? '', /Give back by hand: <@&999999999999999990>/);
  assert.match(text, /^⚠️/);
});

test('unsuspending a member who is not suspended answers privately and posts nothing', async () => {
  const h = ports({ unsuspend: { discord_id: MEMBER, cleared: false, suspended: false, suspended_roles: [] } }, member([]));
  assert.match(await flows.unsuspend(h.p, STAFF, MEMBER, 'x'), /is not suspended/);
  assert.equal(h.posts.length, 0);
});

test('a tier with nothing to remove answers privately and posts nothing', async () => {
  const h = ports({ removeTier: { discord_id: MEMBER, category: 'minor', tier: 0, was_changed: false } }, member([]));
  assert.match(await flows.removeTier(h.p, STAFF, MEMBER, 'minor'), /has no minor tier/);
  assert.equal(h.posts.length, 0);
});

test('days that end a suspension say the roles come back within a minute', async () => {
  const h = ports({ days: { discord_id: MEMBER, days: -5, ends: '2026-11-01T12:00:00Z', suspended: false } }, member([SUSPENDED]));
  await flows.changeDays(h.p, STAFF, MEMBER, -5);
  assert.match(h.posts[0]!.facts.result ?? '', /^−5 days: the suspension has ended and their roles come back within a minute/);
});

test('an expiry gives the roles back, posts, and DMs the member', async () => {
  const m = member([SUSPENDED]);
  const h = ports({ expire: { discord_id: MEMBER, cleared: true, suspended: false, suspended_roles: [CIV6] } }, m);
  await flows.expire(h.p, MEMBER);
  assert.deepEqual(m.writes, [[CIV6]]);
  assert.equal(h.posts[0]!.facts.moderator, null);
  assert.match(h.dms[0] ?? '', /has ended/);
});

test('an expiry that ended nothing does nothing', async () => {
  const m = member([SUSPENDED]);
  const h = ports({ expire: { discord_id: MEMBER, cleared: false, suspended: true, suspended_roles: [CIV6] } }, m);
  await flows.expire(h.p, MEMBER);
  assert.deepEqual([m.writes, h.posts], [[], []]);
});

test('joining while suspended saves the roles the member came back with, then suspends them', async () => {
  const m = member([CIV6]);
  const h = ports({ applyPending: { discord_id: MEMBER, applied: true, punishment_type: 'quit', reason: null, ends: ENDS, held: false } }, m);
  await flows.joined(h.p, m);
  assert.deepEqual(h.calls[0]!.args, [MEMBER, [CIV6]]);
  assert.deepEqual(m.writes, [[SUSPENDED]]);
  assert.equal(h.posts[0]!.title, 'Suspension applied on joining');
});

test('joining with nothing to apply changes nothing', async () => {
  const m = member([CIV6]);
  const h = ports({ applyPending: { discord_id: MEMBER, applied: false, punishment_type: null, reason: null, ends: null, held: false } }, m);
  await flows.joined(h.p, m);
  assert.deepEqual([m.writes, h.posts], [[], []]);
});

test('an expiry waits for a command on the same member to finish', async () => {
  // Without turns an expiry could give roles back over a suspension just applied.
  const order: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const h = ports({ expire: { discord_id: MEMBER, cleared: false, suspended: false, suspended_roles: [] } }, member([]));
  const slow: Ports = {
    ...h.p,
    api: {
      ...h.p.api,
      tier: async () => {
        order.push('tier starts');
        await gate;
        order.push('tier ends');
        return tier({});
      },
      expire: async () => {
        order.push('expire');
        return { discord_id: MEMBER, cleared: false, suspended: false, suspended_roles: [] };
      },
    },
  };
  const command = flows.recordInfraction(slow, STAFF, MEMBER, { kind: 'tier', category: 'quit' }, null);
  const expiry = flows.expire(slow, MEMBER);
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await Promise.all([command, expiry]);
  assert.deepEqual(order, ['tier starts', 'tier ends', 'expire']);
});

test('a record already ended gives roles back only to a member still wearing Suspended', async () => {
  // A first try whose answer was lost ended it; a first try that never arrived did not.
  const ended = { discord_id: MEMBER, cleared: false, suspended: false, suspended_roles: [CIV6] };
  const free = member([]);
  const a = ports({ unsuspend: ended }, free);
  assert.match(await flows.unsuspend(a.p, STAFF, MEMBER, 'x'), /is not suspended/);
  assert.deepEqual([free.writes, a.posts], [[], []]);
  const worn = member([SUSPENDED]);
  const b = ports({ expire: ended }, worn);
  await flows.expire(b.p, MEMBER);
  assert.deepEqual(worn.writes, [[CIV6]]);
});

test('a record suspended again restores nothing', async () => {
  const m = member([SUSPENDED]);
  const h = ports({ expire: { discord_id: MEMBER, cleared: false, suspended: true, suspended_roles: [CIV6] } }, m);
  await flows.expire(h.p, MEMBER);
  assert.deepEqual([m.writes, h.posts], [[], []]);
});

test('a member Discord cannot read after an expiry is left to staff, never taken as gone', async () => {
  const h = ports({ expire: { discord_id: MEMBER, cleared: true, suspended: false, suspended_roles: [CIV6] } }, null);
  h.p = { ...h.p, member: async () => Promise.reject(new Error('Service Unavailable')) };
  await flows.expire(h.p, MEMBER);
  assert.equal(h.posts[0]!.facts.todo, `Set by hand: remove <@&${SUSPENDED}> and add <@&${CIV6}>.`);
  assert.equal(h.posts[0]!.facts.result, 'Served in full');
  assert.equal(h.dms.length, 0);
  // Ended earlier, with the member unreadable: staff are asked to check.
  const g = ports({ unsuspend: { discord_id: MEMBER, cleared: false, suspended: false, suspended_roles: [CIV6] } }, null);
  g.p = { ...g.p, member: async () => Promise.reject(new Error('Service Unavailable')) };
  await flows.unsuspend(g.p, STAFF, MEMBER, 'x');
  assert.match(g.posts[0]!.facts.todo ?? '', /^If they still wear <@&\d+>: Set by hand/);
});

test('a role the bot may not take is left on the member and named for staff', async () => {
  const coach = ID.ROLE_CPL_COACH!;
  const m = member([CIV6, coach]);
  const h = ports({ tier: tier({}) }, m);
  h.p = { ...h.p, canGive: (id) => id !== coach };
  await flows.recordInfraction(h.p, STAFF, MEMBER, { kind: 'tier', category: 'quit' }, null);
  // Kept on the record all the same, so the end gives it back or names it.
  assert.deepEqual(h.calls[0]!.args[4], [CIV6, coach]);
  assert.deepEqual(m.writes, [[coach, SUSPENDED]]);
  assert.equal(h.posts[0]!.facts.todo, `Remove by hand: <@&${coach}>.`);
  const flat = ports({ flat: { discord_id: MEMBER, type: 'comp', days_added: 7, ends: ENDS } }, member([CIV6, coach]));
  flat.p = { ...flat.p, canGive: (id) => id !== coach };
  await flows.recordInfraction(flat.p, STAFF, MEMBER, { kind: 'flat', type: 'comp' }, null);
  assert.deepEqual(flat.calls[0]!.args[4], [CIV6, coach]);
});

test('a join core-api cannot check is posted for staff', async () => {
  const m = member([CIV6]);
  const h = ports({ applyPending: new TypeError('fetch failed') }, m);
  await flows.joined(h.p, m);
  assert.equal(h.posts[0]!.title, 'Join not checked');
  assert.deepEqual(m.writes, []);
});

test('a join reads the member afresh, so roles given since the join are kept too', async () => {
  const event = member([]);
  const fresh = member([CIV6]);
  const h = ports({ applyPending: { discord_id: MEMBER, applied: true, punishment_type: 'smurf', reason: 'alt', ends: ENDS, held: false } }, fresh);
  await flows.joined(h.p, event);
  assert.deepEqual(h.calls.find((call) => call.name === 'applyPending')!.args, [MEMBER, [CIV6]]);
  assert.deepEqual(fresh.writes, [[SUSPENDED]]);
  assert.equal(h.posts[0]!.facts.infraction, 'Smurf (flat)');
});

test('a role write starts from the member as Discord has them now', async () => {
  // A role given while core-api was answering is kept, not overwritten.
  const before = member([CIV6]);
  const now = member([CIV6, OTHER]);
  const h = ports({ tier: tier({}) }, before);
  let reads = 0;
  h.p = { ...h.p, member: async () => (reads++ === 0 ? before : now) };
  await flows.recordInfraction(h.p, STAFF, MEMBER, { kind: 'tier', category: 'quit' }, null);
  assert.deepEqual(now.writes, [[OTHER, SUSPENDED]]);
});
