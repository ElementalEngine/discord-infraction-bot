import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { execute as handlerExecute } from './admin.handler.js';

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Admin infraction management.')
  .addSubcommand((sub) =>
    sub
      .setName('unsuspend')
      .setDescription("Remove a member's suspension.")
      .addUserOption((opt) =>
        opt.setName('target').setDescription('Target member.').setRequired(true),
      )
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('Reason for unsuspending.').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('modify-days')
      .setDescription('Add or remove days from a suspension (positive = add, negative = remove).')
      .addUserOption((opt) =>
        opt.setName('target').setDescription('Target member.').setRequired(true),
      )
      .addIntegerOption((opt) =>
        opt
          .setName('days')
          .setDescription('Days to add (positive) or remove (negative). Range: -365 to 365.')
          .setMinValue(-365)
          .setMaxValue(365)
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove-tier')
      .setDescription("Remove one tier from a member's infraction category.")
      .addUserOption((opt) =>
        opt.setName('target').setDescription('Target member.').setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('category')
          .setDescription('The infraction category.')
          .setRequired(true)
          .addChoices(
            { name: 'Quit', value: 'quit' },
            { name: 'Minor', value: 'minor' },
            { name: 'Moderate', value: 'moderate' },
            { name: 'Major', value: 'major' },
            { name: 'Extreme', value: 'extreme' },
          ),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await handlerExecute(interaction);
}
