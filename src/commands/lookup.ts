import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';

import type { Ports } from '../services/infractions.js';
import { laggers, lookup } from '../services/lookup.js';
import { gate, targetOption } from './gate.js';

export const data = new SlashCommandBuilder()
  .setName('lookup')
  .setDescription("A member's record, or every member with a lagger strike.")
  .setDefaultMemberPermissions(0n)
  .addUserOption((option) => targetOption(option).setRequired(false));

export async function run(interaction: ChatInputCommandInteraction<'cached'>, ports: Ports): Promise<string> {
  gate(interaction);
  const target = interaction.options.getUser('target');
  return target ? lookup(ports, target.id) : laggers(ports);
}
