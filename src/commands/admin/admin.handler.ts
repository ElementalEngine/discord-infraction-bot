import type { ChatInputCommandInteraction } from 'discord.js';
import {
  handleModifyDays,
  handleRemoveTier,
  handleUnsuspend,
} from '../../services/infraction.service.js';
import { assertInfractionChannel, assertInfractionPermission } from '../../utils/guards.js';

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: false });
  if (!(await assertInfractionChannel(interaction))) return;
  if (!(await assertInfractionPermission(interaction))) return;

  const sub = interaction.options.getSubcommand(true);
  if (sub === 'unsuspend') await handleUnsuspend(interaction);
  else if (sub === 'modify-days') await handleModifyDays(interaction);
  else if (sub === 'remove-tier') await handleRemoveTier(interaction);
  else {
    console.error(`[Admin] Unknown subcommand: ${sub}`);
    await interaction.editReply('Unknown subcommand.');
  }
}
