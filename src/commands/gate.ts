import type { ChatInputCommandInteraction, SlashCommandStringOption, SlashCommandUserOption, User } from 'discord.js';

import { refusalFor } from '../config/access.js';
import { refuse } from '../ui/failure.js';

// core-api keeps a reason up to this length, so Discord stops a longer one.
const REASON_MAX = 1000;

export const targetOption = (option: SlashCommandUserOption): SlashCommandUserOption =>
  option.setName('target').setDescription('The member.').setRequired(true);

export const reasonOption =
  (required: boolean) =>
  (option: SlashCommandStringOption): SlashCommandStringOption =>
    option.setName('reason').setDescription('Why.').setMaxLength(REASON_MAX).setRequired(required);

// Stops a command before any work when this member may not run it here.
export function gate(interaction: ChatInputCommandInteraction<'cached'>): void {
  const reason = refusalFor(interaction.commandName, interaction.channelId, interaction.member.roles.cache);
  if (reason) refuse(reason);
}

// The member a command acts on: never a bot, and never the staff member themselves.
export function targetOf(interaction: ChatInputCommandInteraction<'cached'>): User {
  const target = interaction.options.getUser('target', true);
  if (target.bot) refuse('A bot cannot be given an infraction.');
  if (target.id === interaction.user.id) refuse('Ask another member of staff to act on your own record.');
  return target;
}
