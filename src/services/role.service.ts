import type { GuildMember } from 'discord.js';
import { ROLES_REMOVED_ON_SUSPENSION } from '../config/constants.js';
import { config } from '../config/index.js';

export function getRolesToRemove(member: GuildMember): string[] {
  return ROLES_REMOVED_ON_SUSPENSION.map((key) => config.discord.roles[key]).filter(
    (id) => member.roles.cache.has(id),
  );
}

export async function applySuspension(member: GuildMember, rolesToRemove: string[]): Promise<void> {
  const suspendedRoleId = config.discord.roles.suspended;
  const keepRoles = member.roles.cache
    .filter((r) => !rolesToRemove.includes(r.id) && r.id !== suspendedRoleId)
    .map((r) => r.id);
  await member.roles.set([...keepRoles, suspendedRoleId]);
}

export async function restoreRoles(member: GuildMember, rolesToRestore: string[]): Promise<void> {
  const suspendedRoleId = config.discord.roles.suspended;
  const currentRoles = member.roles.cache.filter((r) => r.id !== suspendedRoleId).map((r) => r.id);
  await member.roles.set([...new Set([...currentRoles, ...rolesToRestore])]);
}