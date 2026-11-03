import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ID } from './env.js';

const { render, when } = await import('../src/ui/posts.js');

const MEMBER = '123456789012345678';
const lines = (message: ReturnType<typeof render>): string[] => (message.content ?? '').split('\n');

test('every post is plain text with its facts in the same order, names the member, and never the staff member', () => {
  const message = render({
    tone: 'suspended',
    title: 'Suspended',
    facts: { member: MEMBER, infraction: 'Quit · tier 2', result: '3 days', ends: '2026-11-05T12:00:00Z', reason: 'left', todo: 'x' },
  });
  assert.deepEqual(lines(message), [
    '🟥 **Suspended**',
    `Member: <@${MEMBER}>`,
    `User Id: ${MEMBER}`,
    'Infraction: **Quit · tier 2**',
    'Result: 3 days',
    'Ends: <t:1793880000:f> (<t:1793880000:R>)',
    'Reason: left',
    'For staff: x',
  ]);
  assert.equal(message.embeds, undefined);
  assert.deepEqual(message.allowedMentions, { parse: [] });
});

test('only a hold pings, and it pings the moderators alone', () => {
  const message = render({ tone: 'held', title: 'Held', facts: { member: MEMBER, ends: null }, pingModerators: true });
  assert.deepEqual(message.allowedMentions, { parse: [], roles: [ID.ROLE_MODERATOR] });
  assert.match(message.content ?? '', new RegExp(`<@&${ID.ROLE_MODERATOR}>`));
});

test('an end shows the date and how long until it, and a hold has none', () => {
  assert.equal(when('2026-11-05T12:00:00Z'), '<t:1793880000:f> (<t:1793880000:R>)');
  assert.deepEqual(lines(render({ tone: 'held', title: 'Held', facts: { member: MEMBER, ends: null, reason: null } })).slice(3), ['Ends: when staff act', 'Reason: none given']);
});
