import { PermissionFlagsBits, type Client, type Guild } from 'discord.js';

import { driftOf } from '../config/access.js';
import { config } from '../config/index.js';
import { log } from '../utils/log.js';

// What stops the bot doing its job, checked before it takes a command: the
// channel it posts in, each role it moves or reads, and its place above them.
export async function setupProblems(guild: Guild): Promise<string[]> {
  const problems: string[] = [];
  const me = await guild.members.fetchMe();
  await guild.roles.fetch();
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) problems.push('the bot lacks Manage Roles');
  for (const id of [...config.movedRoles, config.roles.suspended, config.roles.lagger, config.roles.host]) {
    const role = guild.roles.cache.get(id);
    if (!role) problems.push(`role ${id} does not exist`);
    else if (role.managed || role.comparePositionTo(me.roles.highest) >= 0) problems.push(`@${role.name} is not below the bot's highest role`);
  }
  for (const id of [config.roles.moderator, config.roles.backend]) {
    if (!guild.roles.cache.has(id)) problems.push(`staff role ${id} does not exist`);
  }
  const channel = await guild.channels.fetch(config.channels.suspended).catch(() => null);
  if (!channel?.isTextBased()) problems.push(`channel ${config.channels.suspended} is not a text channel the bot can see`);
  else {
    const can = channel.permissionsFor(me);
    for (const [name, flag] of [
      ['View Channel', PermissionFlagsBits.ViewChannel],
      ['Send Messages', PermissionFlagsBits.SendMessages],
    ] as const) {
      if (!can.has(flag)) problems.push(`the bot lacks ${name} in #${channel.name}`);
    }
    // A hold pings the moderators, which Discord allows only for a mentionable role or Mention Everyone.
    const moderator = guild.roles.cache.get(config.roles.moderator);
    if (moderator && !moderator.mentionable && !can.has(PermissionFlagsBits.MentionEveryone)) {
      problems.push(`@${moderator.name} is not mentionable, so a hold could not ping the moderators`);
    }
  }
  return problems;
}

// Compares the access table with the server's Integrations and logs what differs.
// A bot can read the overrides but not write them, so an admin sets them.
export async function checkAccess(client: Client<true>, guild: Guild): Promise<void> {
  const [commands, overrides] = await Promise.all([guild.commands.fetch(), guild.commands.permissions.fetch({})]);
  const app = overrides.get(client.application.id) ?? [];
  const lines = [...commands.values()].flatMap((command) => driftOf(overrides.get(command.id) ?? [], app, guild.id).map((line) => `/${command.name} ${line}`));
  if (lines.length) log.warn(`Command access differs from Integrations in ${lines.length} places:\n  ${lines.join('\n  ')}`);
  else log.info(`Command access matches Integrations for all ${commands.size} commands`);
}
