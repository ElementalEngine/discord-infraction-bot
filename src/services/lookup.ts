import type { TierCategory } from '../api/types.js';
import { strikesLabel, when } from '../ui/posts.js';
import type { Ports } from './infractions.js';

// Discord shows up to 2,000 characters in an answer.
const ANSWER_MAX = 1900;
const CATEGORIES: readonly TierCategory[] = ['quit', 'minor', 'moderate', 'major', 'extreme'];

const named = (names: ReadonlyMap<string, string>, id: string): string => `${names.get(id) ?? 'not in the server'} \`${id}\``;

// One member's record, read as core-api would see it for the next write.
export async function lookup(ports: Ports, targetId: string): Promise<string> {
  const [r, names] = await Promise.all([ports.api.record(targetId), ports.names([targetId])]);
  const suspension = r.held ? 'held at the ban threshold' : r.suspended && r.ends ? `until ${when(r.ends)} (${r.active_category ?? 'suspension'})` : 'none';
  const tier = (category: TierCategory): number => r.tiers[category] ?? 0;
  const tiers = CATEGORIES.filter((category) => tier(category) > 0).map((category) => `${category} ${tier(category)}`);
  return [
    `**${named(names, targetId)}**`,
    `Suspension: ${suspension}`,
    `Tiers: ${tiers.length ? tiers.join(', ') : 'none'}`,
    `Lagger: ${r.lagger_tagged ? `tagged (${strikesLabel(tier('lagger'))})` : tier('lagger') ? strikesLabel(tier('lagger')) : 'no strikes'}`,
  ].join('\n');
}

// Everyone with a lagger strike: the tagged first, then the rest with their count.
export async function laggers(ports: Ports): Promise<string> {
  const { members } = await ports.api.laggers();
  if (!members.length) return 'No member has a lagger strike.';
  const names = await ports.names(members.map((m) => m.discord_id));
  const tagged = members.filter((m) => m.tagged);
  const rest = members.filter((m) => !m.tagged);
  const lines = [
    `**Tagged (${tagged.length})**`,
    ...tagged.map((m) => named(names, m.discord_id)),
    `**With strikes (${rest.length})**`,
    ...rest.map((m) => `${named(names, m.discord_id)}: ${strikesLabel(m.strikes)}`),
  ];
  let text = '';
  for (const [i, line] of lines.entries()) {
    if (text.length + line.length + 1 > ANSWER_MAX) return `${text}\n… and ${lines.length - i} more`;
    text += (text ? '\n' : '') + line;
  }
  return text;
}
