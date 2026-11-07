import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';

import type { TierCategory } from '../api/types.js';
import { changeDays, removeTier, unsuspend, type Ports } from '../services/infractions.js';
import { refuse } from '../ui/failure.js';
import { gate, reasonOption, targetOf, targetOption } from './gate.js';

const CATEGORIES: readonly TierCategory[] = ['quit', 'minor', 'moderate', 'major', 'extreme', 'lagger'];

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Admin infraction management.')
  .setDefaultMemberPermissions(0n)
  .addSubcommand((sub) =>
    sub.setName('unsuspend').setDescription("Remove a member's suspension.").addUserOption(targetOption).addStringOption(reasonOption(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('modify-days')
      .setDescription('Add or remove days from a suspension (positive = add, negative = remove).')
      .addUserOption(targetOption)
      .addIntegerOption((option) =>
        option.setName('days').setDescription('Days to add or remove, -365 to 365, not 0.').setMinValue(-365).setMaxValue(365).setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove-tier')
      .setDescription("Remove one tier, or one lagger strike, from a member's record.")
      .addUserOption(targetOption)
      .addStringOption((option) =>
        option
          .setName('category')
          .setDescription('The infraction category.')
          .setRequired(true)
          .addChoices(...CATEGORIES.map((value) => ({ name: value.charAt(0).toUpperCase() + value.slice(1), value }))),
      ),
  );

export async function run(interaction: ChatInputCommandInteraction<'cached'>, ports: Ports): Promise<string> {
  gate(interaction);
  const target = targetOf(interaction);
  const staffId = interaction.user.id;
  switch (interaction.options.getSubcommand(true)) {
    case 'unsuspend':
      return unsuspend(ports, staffId, target.id, interaction.options.getString('reason', true));
    case 'modify-days': {
      const days = interaction.options.getInteger('days', true);
      if (days === 0) refuse('Give a number of days other than 0.');
      return changeDays(ports, staffId, target.id, days);
    }
    case 'remove-tier': {
      const category = CATEGORIES.find((value) => value === interaction.options.getString('category', true));
      return category ? removeTier(ports, staffId, target.id, category) : refuse('Pick a category from the list.');
    }
    default:
      return refuse('That subcommand is gone.');
  }
}
