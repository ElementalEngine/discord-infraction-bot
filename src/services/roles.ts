import { config } from '../config/index.js';
import { log } from '../utils/log.js';

// The parts of a GuildMember a role change needs, so a test can stand one in.
export type Member = Readonly<{
  id: string;
  roles: Readonly<{
    cache: Readonly<{ keys(): IterableIterator<string> }>;
    set(roles: readonly string[], reason: string): Promise<unknown>;
  }>;
}>;

const RETRY_MS = 1000;
// Discord's code for a member who is not in the server.
const UNKNOWN_MEMBER = 10007;

// The member, or null only when Discord says they are not in the server; any
// other failure is thrown, so it is never mistaken for an absent member.
export async function memberOrNull<T>(fetch: () => Promise<T>): Promise<T | null> {
  try {
    return await fetch();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === UNKNOWN_MEMBER) return null;
    throw error;
  }
}

const rolesOf = (member: Member): string[] => [...member.roles.cache.keys()];

export const isSuspended = (member: Member): boolean => rolesOf(member).includes(config.roles.suspended);

// The moved roles a member holds, which a suspension takes and keeps on the record.
export const movedRolesOf = (member: Member): string[] => rolesOf(member).filter((id) => config.movedRoles.includes(id));

export function nextRoles(held: readonly string[], remove: readonly string[], add: readonly string[]): string[] {
  return [...new Set([...held.filter((id) => !remove.includes(id)), ...add])];
}

// The member as Discord has them now, read just before each write.
export type Read = () => Promise<Member>;

// One write with the member's whole role list from a fresh read, tried once more on a failure.
async function setRoles(id: string, read: Read, remove: readonly string[], add: readonly string[], reason: string, retryMs: number): Promise<boolean> {
  for (let attempt = 1; ; attempt++) {
    try {
      const member = await read();
      await member.roles.set(nextRoles(rolesOf(member), remove, add), reason);
      return true;
    } catch (error) {
      log.warn(`roles not set for ${id} (attempt ${attempt})`, error instanceof Error ? error.message : error);
      if (attempt >= 2) return false;
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }
}

// What staff must do by hand when a change did not land, or undefined when it did.
export type Todo = string | undefined;

const mentions = (ids: readonly string[]): string => ids.map((id) => `<@&${id}>`).join(', ');

export const byHand = (remove: readonly string[], add: readonly string[]): string =>
  `Set by hand: ${[...(remove.length ? [`remove ${mentions(remove)}`] : []), ...(add.length ? [`add ${mentions(add)}`] : [])].join(' and ')}.`;

// Takes the roles the bot may move; one it may not is left for staff rather than failing the rest.
export async function suspend(id: string, read: Read, take: readonly string[], left: readonly string[], reason: string, retryMs = RETRY_MS): Promise<Todo> {
  const add = [config.roles.suspended];
  if (!(await setRoles(id, read, take, add, reason, retryMs))) return byHand([...take, ...left], add);
  return left.length ? `Remove by hand: ${mentions(left)}.` : undefined;
}

// Gives back what the record kept, leaving to staff a role deleted since or one the bot may not give.
export async function release(id: string, read: Read, kept: readonly string[], canGive: (role: string) => boolean, reason: string, retryMs = RETRY_MS): Promise<Todo> {
  const give = kept.filter(canGive);
  const skipped = kept.filter((role) => !canGive(role));
  const remove = [config.roles.suspended];
  if (!(await setRoles(id, read, remove, give, reason, retryMs))) return byHand(remove, kept);
  return skipped.length ? `Give back by hand: ${mentions(skipped)}.` : undefined;
}
