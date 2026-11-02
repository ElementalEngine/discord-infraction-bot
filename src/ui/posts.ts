import { EmbedBuilder, type MessageCreateOptions } from 'discord.js';

import type { FlatType, TierCategory } from '../api/types.js';
import { config } from '../config/index.js';

// Lady Justice's look: one colour per outcome and one mark in every title.
const TONES = {
  suspended: 0xc8443c,
  held: 0x7a1f1f,
  warning: 0xd9a12b,
  lifted: 0x3e9b6b,
  changed: 0x4f7cac,
} as const;

export type Tone = keyof typeof TONES;

const MARK = '⚖️';

export const when = (iso: string): string => {
  const at = Math.floor(Date.parse(iso) / 1000);
  return `<t:${at}:f> (<t:${at}:R>)`;
};

const title = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);
export const tierLabel = (category: TierCategory, tier: number): string => `${title(category)} · tier ${tier}`;
export const flatLabel = (type: FlatType): string => `${title(type)} (flat)`;
const FLATS: readonly string[] = ['smurf', 'oversub', 'comp'];
// A pending entry names a tier category or a flat type; a record names a category or "flat".
export const kindLabel = (kind: string | null): string =>
  !kind ? 'Suspension' : kind === 'flat' ? 'Flat suspension' : FLATS.includes(kind) ? `${title(kind)} (flat)` : title(kind);
export const daysLabel = (days: number): string => `${days} day${days === 1 ? '' : 's'}`;

// The facts a post can carry; each is shown in the same place on every post.
export type Facts = Readonly<{
  member: string;
  infraction?: string;
  result?: string;
  // An end; null is a hold, which has none.
  ends?: string | null;
  reason?: string | null;
  // The staff member who acted; null when Lady Justice acted on its own.
  moderator?: string | null;
  todo?: string;
}>;

export type Post = Readonly<{ tone: Tone; title: string; facts: Facts; pingModerators?: boolean }>;

// A post in the suspended channel. The member is named in the text, so search finds
// them, and no one is pinged but the moderators on a hold.
export function render(post: Post): MessageCreateOptions {
  const { facts } = post;
  const fields: [string, string][] = [['Member', `<@${facts.member}> \`${facts.member}\``]];
  if (facts.infraction) fields.push(['Infraction', facts.infraction]);
  if (facts.result) fields.push(['Result', facts.result]);
  if (facts.ends !== undefined) fields.push(['Ends', facts.ends === null ? 'When staff act' : when(facts.ends)]);
  if (facts.reason !== undefined) fields.push(['Reason', facts.reason?.trim() || 'None given']);
  if (facts.moderator !== undefined) fields.push(['Moderator', facts.moderator ? `<@${facts.moderator}>` : 'Lady Justice, on its own']);
  if (facts.todo) fields.push(['For staff', facts.todo]);
  const embed = new EmbedBuilder()
    .setColor(TONES[post.tone])
    .setTitle(`${MARK} ${post.title}`)
    .addFields(fields.map(([name, value]) => ({ name, value: value.slice(0, 1024) })));
  const moderators = `<@&${config.roles.moderator}>`;
  return {
    content: `<@${facts.member}> \`${facts.member}\`${post.pingModerators ? ` · ${moderators}` : ''}`,
    embeds: [embed],
    allowedMentions: post.pingModerators ? { parse: [], roles: [config.roles.moderator] } : { parse: [] },
  };
}

const reasonLine = (reason: string | null | undefined): string => `Reason: ${reason?.trim() || 'none given'}`;

// The member's DM: plain text, since it is read away from the server.
export const dms = {
  suspended: (infraction: string, days: number, ends: string, reason: string | null): string =>
    [`You have been suspended in CPL for ${daysLabel(days)}.`, `Infraction: ${infraction}`, `Ends: ${when(ends)}`, reasonLine(reason)].join('\n'),
  held: (infraction: string, reason: string | null): string =>
    [
      'You have reached the ban threshold in CPL and are suspended until staff review your case.',
      `Infraction: ${infraction}`,
      reasonLine(reason),
      'You have 24 hours to appeal.',
    ].join('\n'),
  warning: (infraction: string, reason: string | null): string =>
    ['You have received a warning in CPL.', `Infraction: ${infraction}`, reasonLine(reason)].join('\n'),
  changed: (change: string, ends: string): string => `Your CPL suspension has changed by ${change}. It now ends ${when(ends)}.`,
  lifted: (reason: string): string => ['Your CPL suspension has been lifted.', reasonLine(reason)].join('\n'),
  ended: (rolesBack: boolean): string => (rolesBack ? 'Your CPL suspension has ended and your roles are back.' : 'Your CPL suspension has ended. Staff will give your roles back.'),
  rejoined: (infraction: string, ends: string | null): string =>
    ends ? `Your CPL suspension still applies: ${infraction}, until ${when(ends)}.` : `Your CPL suspension still applies: ${infraction}, until staff review your case.`,
} as const;
