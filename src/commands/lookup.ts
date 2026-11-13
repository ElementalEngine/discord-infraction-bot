import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';

import type { Ports } from '../services/infractions.js';
import { LADDERS, laggers, lookup, tierMembers } from '../services/lookup.js';
import { refuse } from '../ui/failure.js';
import { gate, targetOption } from './gate.js';

const TYPES = ['laggers', ...LADDERS, 'record'] as const;

export const data = new SlashCommandBuilder()
  .setName('lookup')
  .setDescription("Every member with lagger strikes or a tier, or one member's record.")
  .setDefaultMemberPermissions(0n)
  .addStringOption((option) =>
    option
      .setName('type')
      .setDescription('What to list, or record for one member.')
      .setRequired(true)
      .addChoices(...TYPES.map((value) => ({ name: value.charAt(0).toUpperCase() + value.slice(1), value }))),
  )
  .addUserOption((option) => targetOption(option).setDescription('The member, for record.').setRequired(false));

export async function run(interaction: ChatInputCommandInteraction<'cached'>, ports: Ports): Promise<string> {
  gate(interaction);
  const type = interaction.options.getString('type', true);
  const target = interaction.options.getUser('target');
  if (type === 'record') {
    if (!target) refuse('Pick the member whose record you want.');
    return lookup(ports, target.id);
  }
  if (target) refuse('Only record takes a member; the lists show everyone.');
  if (type === 'laggers') return laggers(ports);
  const ladder = LADDERS.find((category) => category === type);
  if (!ladder) refuse('Pick a type from the list.');
  return tierMembers(ports, ladder);
}
