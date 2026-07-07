import { GuildMember, type ChatInputCommandInteraction } from 'discord.js';
import { config } from '../config/index.js';

export async function assertInfractionChannel(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  if (interaction.channelId !== config.discord.channels.suspendedChannel) {
    await interaction.editReply('This command can only be used in the infraction channel.');
    return false;
  }
  return true;
}

export async function assertInfractionPermission(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  const member = interaction.member;
  if (!(member instanceof GuildMember)) {
    await interaction.editReply('This command can only be used from within the server.');
    return false;
  }
  if (
    !member.roles.cache.has(config.discord.roles.moderator) &&
    !member.roles.cache.has(config.discord.roles.cplBackend)
  ) {
    await interaction.editReply('You do not have permission to use this command.');
    return false;
  }
  return true;
}
