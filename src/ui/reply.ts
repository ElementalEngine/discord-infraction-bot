import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';

import { log } from '../utils/log.js';

// Every answer to staff is private and pings no one.
export async function defer(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
}

// Discord takes up to 2,000 characters in one message.
const MESSAGE_MAX = 2000;

// A long answer as the messages it takes: cut between lines, and inside a line
// only when that line alone is too long.
export function parts(text: string, max = MESSAGE_MAX): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const at = rest.lastIndexOf('\n', max);
    out.push(rest.slice(0, at > 0 ? at : max));
    rest = rest.slice(at > 0 ? at + 1 : max);
  }
  if (rest || out.length === 0) out.push(rest);
  return out;
}

// Answers the interaction, or rewrites its answer; what does not fit in one
// message follows in more, as private. Never throws: the interaction may have expired.
export async function answer(interaction: ChatInputCommandInteraction, text: string): Promise<void> {
  const [first = '', ...more] = parts(text);
  try {
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content: first, allowedMentions: { parse: [] } });
    else await interaction.reply({ content: first, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    for (const content of more) await interaction.followUp({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  } catch (error) {
    log.warn('reply not delivered', error instanceof Error ? error.message : error);
  }
}
