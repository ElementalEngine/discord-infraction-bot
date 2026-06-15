import type { GuildMember } from 'discord.js';
import { ROLES_REMOVED_ON_SUSPENSION } from '../config/constants.js';
import { config } from '../config/index.js';

export async function applySuspension(member: GuildMember): Promise<string[]> {
  const suspendedRoleId = config.discord.roles.suspended;
  const rolesToRemove = ROLES_REMOVED_ON_SUSPENSION.map((key) => config.discord.roles[key]).filter(
    (id) => member.roles.cache.has(id),
  );

  const keepRoles = member.roles.cache
    .filter((r) => !rolesToRemove.includes(r.id) && r.id !== suspendedRoleId)
    .map((r) => r.id);

  await member.roles.set([...keepRoles, suspendedRoleId]);
  return rolesToRemove;
}

export async function restoreRoles(member: GuildMember, rolesToRestore: string[]): Promise<void> {
  const suspendedRoleId = config.discord.roles.suspended;
  const currentRoles = member.roles.cache.filter((r) => r.id !== suspendedRoleId).map((r) => r.id);
  await member.roles.set([...new Set([...currentRoles, ...rolesToRestore])]);
}
