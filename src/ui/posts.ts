import type { MessageCreateOptions } from 'discord.js';

import { FLAT_TYPES, type FlatType, type TierCategory } from '../api/types.js';
import { config } from '../config/index.js';

// One mark per outcome, so staff can tell posts apart at a glance.
const TONES = {
  suspended: '🟥',
  held: '⛔',
  warning: '🟨',
  lifted: '🟩',
  changed: '🟦',
} as const;

export type Tone = keyof typeof TONES;

export const when = (iso: string): string => {
  const at = Math.floor(Date.parse(iso) / 1000);
  return `<t:${at}:f> (<t:${at}:R>)`;
};

const title = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);
export const tierLabel = (category: TierCategory, tier: number): string => `${title(category)} · tier ${tier}`;
export const flatLabel = (type: FlatType): string => `${title(type)} (flat)`;
// A pending entry names a tier category or a flat type; a record names a category or "flat".
export const kindLabel = (kind: string | null): string =>
  !kind ? 'Suspension' : kind === 'flat' ? 'Flat suspension' : (FLAT_TYPES as readonly string[]).includes(kind) ? `${title(kind)} (flat)` : title(kind);
export const daysLabel = (days: number): string => `${days} day${days === 1 ? '' : 's'}`;
// Three strikes tag a lagger; core-api's ladder has the same cap.
export const STRIKES = 3;
export const strikesLabel = (strikes: number): string => `strike ${strikes} of ${STRIKES}`;
export const strikeLabel = (strikes: number): string => `Lagger · ${strikesLabel(strikes)}`;

// The facts a post can carry; each is shown in the same place on every post.
export type Facts = Readonly<{
  member: string;
  infraction?: string;
  result?: string;
  // An end; null is a hold, which has none.
  ends?: string | null;
  reason?: string | null;
  todo?: string;
}>;

export type Post = Readonly<{ tone: Tone; title: string; facts: Facts; pingModerators?: boolean }>;

// A post in the suspended channel, in the plain layout staff know. The member is
// named in the text, so search finds them; staff are never named, and only a hold pings.
export function render(post: Post): MessageCreateOptions {
  const { facts } = post;
  const lines = [`${TONES[post.tone]} **${post.title}**`, `Member: <@${facts.member}>`, `User Id: ${facts.member}`];
  if (facts.infraction) lines.push(`Infraction: **${facts.infraction}**`);
  if (facts.result) lines.push(`Result: ${facts.result}`);
  if (facts.ends !== undefined) lines.push(`Ends: ${facts.ends === null ? 'when staff act' : when(facts.ends)}`);
  if (facts.reason !== undefined) lines.push(`Reason: ${facts.reason?.trim() || 'none given'}`);
  if (facts.todo) lines.push(`For staff: ${facts.todo}`);
  if (post.pingModerators) lines.push(`<@&${config.roles.moderator}>`);
  return {
    content: lines.join('\n'),
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
  strike: (strikes: number, reason: string | null): string =>
    [`You have received a lagger report in CPL: strike ${strikes} of ${STRIKES}. At ${STRIKES} you are tagged as a lagger.`, reasonLine(reason)].join('\n'),
  tagged: (reason: string | null): string =>
    ['You have been tagged as a lagger in CPL after three reports, and may no longer host. Only staff can remove the tag.', reasonLine(reason)].join('\n'),
  untagged: (strikes: number): string => `A lagger report against you in CPL was removed: ${strikes} of ${STRIKES} strikes remain, and the lagger tag is off.`,
  rejoined: (infraction: string, ends: string | null): string =>
    ends ? `Your CPL suspension still applies: ${infraction}, until ${when(ends)}.` : `Your CPL suspension still applies: ${infraction}, until staff review your case.`,
} as const;
