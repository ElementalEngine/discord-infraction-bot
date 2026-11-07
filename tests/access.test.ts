import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApplicationCommandPermissionType } from 'discord.js';

import { ID } from './env.js';

const { driftOf, refusalFor } = await import('../src/config/access.js');

const roles = (...ids: string[]) => new Set(ids);
const GUILD = ID.DISCORD_GUILD_ID!;
const ALL_CHANNELS = String(BigInt(GUILD) - 1n);
const entry = (type: ApplicationCommandPermissionType, id: string, permission: boolean) => ({ type, id, permission });

test('staff run the commands only in the suspended channel, and /lookup in bot-commands too', () => {
  assert.equal(refusalFor('infraction', ID.CHANNEL_SUSPENDED_ID!, roles(ID.ROLE_MODERATOR!)), null);
  assert.equal(refusalFor('infraction', ID.CHANNEL_SUSPENDED_ID!, roles(ID.ROLE_BACKEND!)), null);
  assert.equal(refusalFor('infraction', ID.CHANNEL_BOT_COMMANDS_ID!, roles(ID.ROLE_MODERATOR!)), 'Use this command in <#100000000000000010>.');
  assert.equal(refusalFor('lookup', ID.CHANNEL_BOT_COMMANDS_ID!, roles(ID.ROLE_MODERATOR!)), null);
  assert.equal(refusalFor('lookup', '100000000000000099', roles(ID.ROLE_MODERATOR!)), 'Use this command in <#100000000000000010> or <#100000000000000011>.');
  assert.equal(refusalFor('lookup', ID.CHANNEL_BOT_COMMANDS_ID!, roles(ID.ROLE_CIV6!)), 'Only staff can use this command.');
});

test('Integrations set as the table wants show no difference', () => {
  const own = [
    entry(ApplicationCommandPermissionType.Role, ID.ROLE_MODERATOR!, true),
    entry(ApplicationCommandPermissionType.Role, ID.ROLE_BACKEND!, true),
    entry(ApplicationCommandPermissionType.Channel, ALL_CHANNELS, false),
    entry(ApplicationCommandPermissionType.Channel, ID.CHANNEL_SUSPENDED_ID!, true),
  ];
  assert.deepEqual(driftOf('infraction', own, [], GUILD), []);
  assert.match(driftOf('lookup', own, [], GUILD)[0]!, /^channels: want 100000000000000010, 100000000000000011; Discord allows 100000000000000010$/);
  assert.deepEqual(driftOf('lookup', [...own, entry(ApplicationCommandPermissionType.Channel, ID.CHANNEL_BOT_COMMANDS_ID!, true)], [], GUILD), []);
});

test('a missing staff role, an open channel and a member override are each named', () => {
  const app = [entry(ApplicationCommandPermissionType.Role, ID.ROLE_MODERATOR!, true), entry(ApplicationCommandPermissionType.User, '123456789012345678', true)];
  const drift = driftOf('admin', [], app, GUILD);
  assert.equal(drift.length, 3);
  assert.match(drift[0]!, /^roles: want .*; Discord allows 100000000000000020$/);
  assert.match(drift[1]!, /every channel$/);
  assert.equal(drift[2], 'users: 1 member overrides');
});

test('an @everyone override is named, as it opens the command to the whole server', () => {
  const own = [entry(ApplicationCommandPermissionType.Role, ID.ROLE_MODERATOR!, true), entry(ApplicationCommandPermissionType.Role, ID.ROLE_BACKEND!, true), entry(ApplicationCommandPermissionType.Role, GUILD, true)];
  assert.deepEqual(driftOf('admin', own, [], GUILD).filter((line) => line.startsWith('roles')), ['roles: Discord allows @everyone']);
});

test("a command's own entry overrides the app's for the same role", () => {
  const app = [entry(ApplicationCommandPermissionType.Role, ID.ROLE_BACKEND!, true)];
  const own = [entry(ApplicationCommandPermissionType.Role, ID.ROLE_BACKEND!, false), entry(ApplicationCommandPermissionType.Role, ID.ROLE_MODERATOR!, true)];
  assert.match(driftOf('admin', own, app, GUILD)[0]!, /Discord allows 100000000000000020$/);
});
