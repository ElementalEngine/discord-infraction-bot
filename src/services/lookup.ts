import type { Ladder, TierCategory } from '../api/types.js';
import { refuse, unreachable } from '../ui/failure.js';
import { strikesLabel, when } from '../ui/posts.js';
import type { Ports } from './infractions.js';

export const LADDERS: readonly Ladder[] = ['quit', 'minor', 'moderate', 'major', 'extreme'];

// An unanswered read changed nothing, so staff need only try again.
const read = <T>(answer: Promise<T>): Promise<T> =>
  answer.catch((error: unknown) => (unreachable(error) ? refuse("core-api didn't answer. Try again in a moment.") : Promise.reject(error)));

const named = (names: ReadonlyMap<string, string>, id: string): string => `${names.get(id) ?? 'not in the server'} \`${id}\``;

// One member's record, read as core-api would see it for the next write.
export async function lookup(ports: Ports, targetId: string): Promise<string> {
  const [r, names] = await Promise.all([read(ports.api.record(targetId)), ports.names([targetId])]);
  const suspension = r.held ? 'held at the ban threshold' : r.suspended && r.ends ? `until ${when(r.ends)} (${r.active_category ?? 'suspension'})` : 'none';
  const tier = (category: TierCategory): number => r.tiers[category] ?? 0;
  const tiers = LADDERS.filter((category) => tier(category) > 0).map((category) => `${category} ${tier(category)}`);
  return [
    `**${named(names, targetId)}**`,
    `Suspension: ${suspension}`,
    `Tiers: ${tiers.length ? tiers.join(', ') : 'none'}`,
    `Lagger: ${r.lagger_tagged ? `tagged (${strikesLabel(tier('lagger'))})` : tier('lagger') ? strikesLabel(tier('lagger')) : 'no strikes'}`,
  ].join('\n');
}

// Everyone at a tier in one ladder, the highest first; one held at the ban threshold says so.
// The whole list, like the laggers'.
export async function tierMembers(ports: Ports, category: Ladder): Promise<string> {
  const { members } = await read(ports.api.tierMembers(category));
  if (!members.length) return `No member has a ${category} tier.`;
  const names = await ports.names(members.map((m) => m.discord_id));
  return [
    `**${category.charAt(0).toUpperCase()}${category.slice(1)} (${members.length})**`,
    ...members.map((m) => `${named(names, m.discord_id)}: ${category} ${m.tier}${m.held ? ', held at the ban threshold' : ''}`),
  ].join('\n');
}

// Everyone with a lagger strike: the tagged first, then the rest with their count.
// The whole list, however long: the answer goes out in as many messages as it takes.
export async function laggers(ports: Ports): Promise<string> {
  const { members } = await read(ports.api.laggers());
  if (!members.length) return 'No member has a lagger strike.';
  const tagged = members.filter((m) => m.tagged);
  const rest = members.filter((m) => !m.tagged);
  const names = await ports.names(members.map((m) => m.discord_id));
  return [
    `**Tagged (${tagged.length})**`,
    ...tagged.map((m) => named(names, m.discord_id)),
    `**With strikes (${rest.length})**`,
    ...rest.map((m) => `${named(names, m.discord_id)}: ${strikesLabel(m.strikes)}`),
  ].join('\n');
}
