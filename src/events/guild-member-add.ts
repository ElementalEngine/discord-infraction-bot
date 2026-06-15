import { Events, type GuildMember } from 'discord.js';
import { handlePendingSuspensionOnJoin } from '../services/infraction.service.js';

export const name = Events.GuildMemberAdd;
export const once = false;

export async function execute(member: GuildMember): Promise<void> {
  await handlePendingSuspensionOnJoin(member.client, member).catch((err: unknown) =>
    console.error(`[GuildMemberAdd] Failed for ${member.id}:`, err),
  );
}
