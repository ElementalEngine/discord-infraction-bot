import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { APIEmbed } from 'discord.js';

import { ID } from './env.js';

const { render, when } = await import('../src/ui/posts.js');

const MEMBER = '123456789012345678';
const fieldsOf = (message: ReturnType<typeof render>) => ((message.embeds?.[0] as { toJSON(): APIEmbed }).toJSON().fields ?? []).map((field) => field.name);

test('every post shows its facts in the same order, and names the member in the text', () => {
  const message = render({
    tone: 'suspended',
    title: 'Suspended',
    facts: { member: MEMBER, infraction: 'Quit · tier 2', result: '3 days', ends: '2026-11-05T12:00:00Z', reason: 'left', moderator: '223456789012345678', todo: 'x' },
  });
  assert.deepEqual(fieldsOf(message), ['Member', 'Infraction', 'Result', 'Ends', 'Reason', 'Moderator', 'For staff']);
  assert.equal(message.content, `<@${MEMBER}> \`${MEMBER}\``);
  assert.deepEqual(message.allowedMentions, { parse: [] });
});

test('only a hold pings, and it pings the moderators alone', () => {
  const message = render({ tone: 'held', title: 'Held', facts: { member: MEMBER, ends: null }, pingModerators: true });
  assert.deepEqual(message.allowedMentions, { parse: [], roles: [ID.ROLE_MODERATOR] });
  assert.match(message.content ?? '', new RegExp(`<@&${ID.ROLE_MODERATOR}>`));
});

test('an end shows the date and how long until it, and a hold has none', () => {
  assert.equal(when('2026-11-05T12:00:00Z'), '<t:1793880000:f> (<t:1793880000:R>)');
  const embed = (render({ tone: 'held', title: 'Held', facts: { member: MEMBER, ends: null, reason: null, moderator: null } }).embeds?.[0] as { toJSON(): APIEmbed }).toJSON();
  assert.deepEqual(embed.fields?.slice(1).map((field) => field.value), ['When staff act', 'None given', 'Lady Justice, on its own']);
});
