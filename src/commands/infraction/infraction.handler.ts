import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { isFlatType, isTierCategory } from '../../api/types.js';
import { handleFlatSuspension, handleTierInfraction } from '../../services/infraction.service.js';
import { assertInfractionChannel, assertInfractionPermission } from '../../utils/guards.js';

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!(await assertInfractionChannel(interaction))) return;
  if (!(await assertInfractionPermission(interaction))) return;
  const group = interaction.options.getSubcommandGroup(true);
  const sub = interaction.options.getSubcommand(true);
  if (group === 'tier' && isTierCategory(sub)) {
    await handleTierInfraction(interaction, sub);
  } else if (group === 'flat' && isFlatType(sub)) {
    await handleFlatSuspension(interaction, sub);
  } else {
    console.error(`[Infraction] Unknown subcommand: ${group}/${sub}`);
    await interaction.editReply('Unknown subcommand.');
  }
}