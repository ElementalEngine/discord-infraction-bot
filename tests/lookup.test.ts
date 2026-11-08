import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Ports } from '../src/services/infractions.js';

import './env.js';

const { laggers, lookup } = await import('../src/services/lookup.js');

const MEMBER = '123456789012345678';
const GONE = '323456789012345678';

function ports(record: unknown, list: unknown): Ports {
  return {
    api: { record: async () => record, laggers: async () => list } as unknown as Ports['api'],
    member: async () => null,
    canGive: () => true,
    post: async () => true,
    dm: async () => true,
    names: async (ids) => new Map(ids.filter((id) => id !== GONE).map((id) => [id, 'Cisco'])),
  };
}

test('a lookup shows the suspension, the tiers and the strikes', async () => {
  const text = await lookup(
    ports({ discord_id: MEMBER, suspended: true, ends: '2026-11-05T12:00:00Z', held: false, active_category: 'quit', tiers: { quit: 2, minor: 0, moderate: 0, major: 1, extreme: 0, lagger: 3 }, lagger_tagged: true }, null),
    MEMBER,
  );
  assert.equal(text, ['**Cisco `123456789012345678`**', 'Suspension: until <t:1793880000:f> (<t:1793880000:R>) (quit)', 'Tiers: quit 2, major 1', 'Lagger: tagged (strike 3 of 3)'].join('\n'));
  const clean = await lookup(ports({ discord_id: GONE, suspended: false, ends: null, held: false, active_category: null, tiers: { quit: 0, minor: 0, moderate: 0, major: 0, extreme: 0, lagger: 0 }, lagger_tagged: false }, null), GONE);
  assert.equal(clean, ['**not in the server `323456789012345678`**', 'Suspension: none', 'Tiers: none', 'Lagger: no strikes'].join('\n'));
});

test('the laggers list names the tagged first, then the strikes, and stays under the answer limit', async () => {
  const text = await laggers(ports(null, { members: [{ discord_id: MEMBER, strikes: 3, tagged: true }, { discord_id: GONE, strikes: 1, tagged: false }] }));
  assert.equal(text, ['**Tagged (1)**', 'Cisco `123456789012345678`', '**With strikes (1)**', 'not in the server `323456789012345678`: strike 1 of 3'].join('\n'));
  assert.equal(await laggers(ports(null, { members: [] })), 'No member has a lagger strike.');
  const many = Array.from({ length: 200 }, (_, i) => ({ discord_id: String(100000000000000000 + i), strikes: 1, tagged: false }));
  const long = await laggers(ports(null, { members: many }));
  assert.ok(long.length <= 2000);
  assert.match(long, /… and \d+ more$/);
});

test('a long laggers list counts what each section leaves out and names only who can show', async () => {
  const id = (n: number): string => String(100000000000000000n + BigInt(n));
  const members = [
    ...Array.from({ length: 100 }, (_, i) => ({ discord_id: id(i), strikes: 3, tagged: true })),
    ...Array.from({ length: 900 }, (_, i) => ({ discord_id: id(1000 + i), strikes: 1, tagged: false })),
  ];
  let asked = 0;
  const p = { ...ports(null, { members }), names: async (ids: readonly string[]) => ((asked = ids.length), new Map<string, string>()) };
  const text = await laggers(p);
  const shown = text.split('\n').filter((line) => /`\d+`/.test(line)).length;
  const more = [...text.matchAll(/… and (\d+) more/g)].reduce((sum, m) => sum + Number(m[1]), 0);
  assert.ok(text.length <= 2000);
  assert.equal(shown + more, 1000);
  assert.match(text, /\*\*With strikes \(900\)\*\*/);
  assert.ok(asked <= 100);
});

test('a lookup core-api does not answer asks for a retry, as nothing was written', async () => {
  const { NoAnswer } = await import('../src/api/errors.js');
  const { Refusal } = await import('../src/ui/failure.js');
  const lost = { ...ports(null, null), api: { record: async () => Promise.reject(new NoAnswer(new TypeError('terminated'))), laggers: async () => Promise.reject(new NoAnswer(new TypeError('terminated'))) } as unknown as Ports['api'] };
  await assert.rejects(lookup(lost, MEMBER), (error: unknown) => error instanceof Refusal && /Try again/.test(error.message));
  await assert.rejects(laggers(lost), Refusal);
});
