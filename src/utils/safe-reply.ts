import type { ChatInputCommandInteraction } from 'discord.js';

export async function safeEditReply(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  await interaction.editReply(content).catch((err: unknown) => {
    console.error('[LJ Bot] safeEditReply failed:', err);
  });
}
