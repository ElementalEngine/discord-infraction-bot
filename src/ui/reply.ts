import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';

import { log } from '../utils/log.js';

// Every answer to staff is private and pings no one.
export async function defer(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
}

// Answers the interaction, or rewrites its answer. Never throws: the
// interaction may have expired.
export async function answer(interaction: ChatInputCommandInteraction, text: string): Promise<void> {
  try {
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content: text, allowedMentions: { parse: [] } });
    else await interaction.reply({ content: text, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  } catch (error) {
    log.warn('reply not delivered', error instanceof Error ? error.message : error);
  }
}
