import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApplicationCommandPermissionType } from 'discord.js';

import { ID } from './env.js';

const { driftOf, refusalFor } = await import('../src/config/access.js');

const roles = (...ids: string[]) => new Set(ids);
const GUILD = ID.DISCORD_GUILD_ID!;
const ALL_CHANNELS = String(BigInt(GUILD) - 1n);
const entry = (type: ApplicationCommandPermissionType, id: string, permission: boolean) => ({ type, id, permission });

test('staff run the commands only in the suspended channel', () => {
  assert.equal(refusalFor(ID.CHANNEL_SUSPENDED_ID!, roles(ID.ROLE_MODERATOR!)), null);
  assert.equal(refusalFor(ID.CHANNEL_SUSPENDED_ID!, roles(ID.ROLE_BACKEND!)), null);
  assert.match(refusalFor('100000000000000099', roles(ID.ROLE_MODERATOR!)) ?? '', /Use this command in <#100000000000000010>/);
  assert.equal(refusalFor(ID.CHANNEL_SUSPENDED_ID!, roles(ID.ROLE_CIV6!)), 'Only staff can use this command.');
});

test('Integrations set as the table wants show no difference', () => {
  const own = [
    entry(ApplicationCommandPermissionType.Role, ID.ROLE_MODERATOR!, true),
    entry(ApplicationCommandPermissionType.Role, ID.ROLE_BACKEND!, true),
    entry(ApplicationCommandPermissionType.Channel, ALL_CHANNELS, false),
    entry(ApplicationCommandPermissionType.Channel, ID.CHANNEL_SUSPENDED_ID!, true),
  ];
  assert.deepEqual(driftOf(own, [], GUILD), []);
});

test('a missing staff role, an open channel and a member override are each named', () => {
  const app = [entry(ApplicationCommandPermissionType.Role, ID.ROLE_MODERATOR!, true), entry(ApplicationCommandPermissionType.User, '123456789012345678', true)];
  const drift = driftOf([], app, GUILD);
  assert.equal(drift.length, 3);
  assert.match(drift[0]!, /^roles: want .*; Discord allows 100000000000000020$/);
  assert.match(drift[1]!, /every channel$/);
  assert.equal(drift[2], 'users: 1 member overrides');
});

test("a command's own entry overrides the app's for the same role", () => {
  const app = [entry(ApplicationCommandPermissionType.Role, ID.ROLE_BACKEND!, true)];
  const own = [entry(ApplicationCommandPermissionType.Role, ID.ROLE_BACKEND!, false), entry(ApplicationCommandPermissionType.Role, ID.ROLE_MODERATOR!, true)];
  assert.match(driftOf(own, app, GUILD)[0]!, /Discord allows 100000000000000020$/);
});
