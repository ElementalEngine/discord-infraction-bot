import type { TierCategory } from '../api/types.js';
import { refuse, unreachable } from '../ui/failure.js';
import { strikesLabel, when } from '../ui/posts.js';
import type { Ports } from './infractions.js';

// Discord shows up to 2,000 characters in an answer, so under 100 members, the
// most one name fetch reads; room is kept for a cut list's tail and the next header.
const ANSWER_MAX = 1900;
const TAIL = 80;
const SHOWN_MAX = 100;
const CATEGORIES: readonly TierCategory[] = ['quit', 'minor', 'moderate', 'major', 'extreme'];

// An unanswered read changed nothing, so staff need only try again.
const read = <T>(answer: Promise<T>): Promise<T> =>
  answer.catch((error: unknown) => (unreachable(error) ? refuse("core-api didn't answer. Try again in a moment.") : Promise.reject(error)));

const named = (names: ReadonlyMap<string, string>, id: string): string => `${names.get(id) ?? 'not in the server'} \`${id}\``;

// One member's record, read as core-api would see it for the next write.
export async function lookup(ports: Ports, targetId: string): Promise<string> {
  const [r, names] = await Promise.all([read(ports.api.record(targetId)), ports.names([targetId])]);
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

// Everyone with a lagger strike: the tagged first, then the rest with their count;
// a section cut short says how many of it are left.
export async function laggers(ports: Ports): Promise<string> {
  const { members } = await read(ports.api.laggers());
  if (!members.length) return 'No member has a lagger strike.';
  const tagged = members.filter((m) => m.tagged);
  const rest = members.filter((m) => !m.tagged);
  const names = await ports.names([...tagged, ...rest].slice(0, SHOWN_MAX).map((m) => m.discord_id));
  const sections = [
    { header: `**Tagged (${tagged.length})**`, lines: tagged.map((m) => named(names, m.discord_id)) },
    { header: `**With strikes (${rest.length})**`, lines: rest.map((m) => `${named(names, m.discord_id)}: ${strikesLabel(m.strikes)}`) },
  ];
  let text = '';
  const put = (line: string): void => void (text += (text ? '\n' : '') + line);
  for (const { header, lines } of sections) {
    put(header);
    for (const [i, line] of lines.entries()) {
      if (text.length + line.length + 1 > ANSWER_MAX - TAIL) {
        put(`… and ${lines.length - i} more`);
        break;
      }
      put(line);
    }
  }
  return text;
}
