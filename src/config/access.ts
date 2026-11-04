import { ApplicationCommandPermissionType, type ApplicationCommandPermissions } from 'discord.js';

import { config } from './index.js';

// Who may run the staff commands, and where: an admin sets Discord's Integrations
// to match, startup logs any difference, and the bot checks it again on every use.
const STAFF = [config.roles.moderator, config.roles.backend].sort();
const CHANNELS = [config.channels.suspended];

type Roles = Readonly<{ has(id: string): boolean }>;

// Why a member may not run a staff command here, or null when they may.
export function refusalFor(channelId: string | null, held: Roles): string | null {
  if (!channelId || !CHANNELS.includes(channelId)) return `Use this command in <#${config.channels.suspended}>.`;
  if (!STAFF.some((id) => held.has(id))) return 'Only staff can use this command.';
  return null;
}

const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const names = (ids: readonly string[]): string => (ids.length ? ids.join(', ') : 'none');

// What a command's Integrations overrides allow beside the table, read as Discord
// does: a command's own entries over the app's, one role or channel at a time.
export function driftOf(own: readonly ApplicationCommandPermissions[], app: readonly ApplicationCommandPermissions[], guildId: string): string[] {
  const have = [...own, ...app.filter((a) => !own.some((o) => o.id === a.id && o.type === a.type))];
  const allChannels = String(BigInt(guildId) - 1n);
  const roles = have.filter((e) => e.type === ApplicationCommandPermissionType.Role && e.permission && e.id !== guildId).map((e) => e.id).sort();
  const everyone = have.some((e) => e.type === ApplicationCommandPermissionType.Role && e.permission && e.id === guildId);
  const channelEntries = have.filter((e) => e.type === ApplicationCommandPermissionType.Channel);
  const closed = channelEntries.some((e) => e.id === allChannels && !e.permission);
  const channels = channelEntries.filter((e) => e.permission && e.id !== allChannels).map((e) => e.id).sort();
  const users = have.filter((e) => e.type === ApplicationCommandPermissionType.User);
  return [
    ...(same(roles, STAFF) ? [] : [`roles: want ${names(STAFF)}; Discord allows ${names(roles)}`]),
    ...(everyone ? ['roles: Discord allows @everyone'] : []),
    ...(closed && same(channels, CHANNELS) ? [] : [`channels: want ${names(CHANNELS)}; Discord allows ${closed ? names(channels) : 'every channel'}`]),
    ...(users.length ? [`users: ${users.length} member overrides`] : []),
  ];
}
