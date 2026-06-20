import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import type { FlatType, TierCategory } from '../../api/types.js';
import { handleFlatSuspension, handleTierInfraction } from '../../services/infraction.service.js';
import { assertInfractionChannel, assertInfractionPermission } from '../../utils/guards.js';

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!(await assertInfractionChannel(interaction))) return;
  if (!(await assertInfractionPermission(interaction))) return;
  const group = interaction.options.getSubcommandGroup(true);
  const sub = interaction.options.getSubcommand(true);
  if (group === 'tier') {
    await handleTierInfraction(interaction, sub as TierCategory);
  } else if (group === 'flat') {
    await handleFlatSuspension(interaction, sub as FlatType);
  } else {
    console.error(`[Infraction] Unknown subcommand group: ${group}`);
    await interaction.editReply('Unknown subcommand group.');
  }
}