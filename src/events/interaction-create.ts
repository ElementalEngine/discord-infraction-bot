import { Events, type Interaction } from 'discord.js';

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);
  if (!command) {
    console.error(`[InteractionCreate] No command: ${interaction.commandName}`);
    return;
  }

  await command.execute(interaction).catch((err: unknown) => {
    console.error(`[InteractionCreate] Error in ${interaction.commandName}:`, err);
  });
}
