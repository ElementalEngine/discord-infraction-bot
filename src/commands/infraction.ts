import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';

import type { FlatType, TierCategory } from '../api/types.js';
import { recordInfraction, type Ports } from '../services/infractions.js';
import { refuse } from '../ui/failure.js';
import { gate, reasonOption, targetOf, targetOption } from './gate.js';

// Each tier category, and whether staff must give a reason for it.
const TIERS: readonly (readonly [TierCategory, string, boolean])[] = [
  ['quit', 'Record a quit infraction.', false],
  ['minor', 'Record a minor infraction.', true],
  ['moderate', 'Record a moderate infraction.', false],
  ['major', 'Record a major infraction.', true],
  ['extreme', 'Record an extreme infraction.', true],
];

const FLATS: readonly (readonly [FlatType, string])[] = [
  ['smurf', 'Apply a smurf suspension.'],
  ['oversub', 'Apply an over-sub suspension.'],
  ['comp', 'Apply a competition suspension.'],
];

export const data = new SlashCommandBuilder()
  .setName('infraction')
  .setDescription('Record an infraction for a member.')
  .setDefaultMemberPermissions(0n)
  .addSubcommandGroup((group) => {
    group.setName('tier').setDescription('Record a tier-based infraction.');
    for (const [name, description, required] of TIERS) {
      group.addSubcommand((sub) => sub.setName(name).setDescription(description).addUserOption(targetOption).addStringOption(reasonOption(required)));
    }
    return group;
  })
  .addSubcommandGroup((group) => {
    group.setName('flat').setDescription('Apply a flat suspension.');
    for (const [name, description] of FLATS) {
      group.addSubcommand((sub) => sub.setName(name).setDescription(description).addUserOption(targetOption).addStringOption(reasonOption(false)));
    }
    return group;
  });

export async function run(interaction: ChatInputCommandInteraction<'cached'>, ports: Ports): Promise<string> {
  gate(interaction);
  const target = targetOf(interaction);
  const reason = interaction.options.getString('reason');
  const group = interaction.options.getSubcommandGroup(true);
  const sub = interaction.options.getSubcommand(true);
  const tier = TIERS.find(([name]) => name === sub);
  const flat = FLATS.find(([name]) => name === sub);
  if (group === 'tier' && tier) return recordInfraction(ports, interaction.user.id, target.id, { kind: 'tier', category: tier[0] }, reason);
  if (group === 'flat' && flat) return recordInfraction(ports, interaction.user.id, target.id, { kind: 'flat', type: flat[0] }, reason);
  return refuse('That subcommand is gone.');
}
