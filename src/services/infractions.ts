import type { Api } from '../api/client.js';
import type { FlatType, PendingApplied, SuspensionCleared, TierCategory } from '../api/types.js';
import { config } from '../config/index.js';
import { refuse } from '../ui/failure.js';
import { daysLabel, dms, flatLabel, kindLabel, strikeLabel, strikesLabel, tierLabel, type Post } from '../ui/posts.js';
import { log } from '../utils/log.js';
import { serial } from '../utils/serial.js';
import { byHand, isHost, isSuspended, isTagged, move, movedRolesOf, release, suspend, type Member, type Read, type Todo } from './roles.js';

// What the flows reach outside themselves, so a test can stand each one in.
export type Ports = Readonly<{
  api: Pick<Api, 'tier' | 'flat' | 'days' | 'removeTier' | 'unsuspend' | 'expire' | 'setPending' | 'applyPending' | 'record' | 'laggers'>;
  // The member, null when they are not in the server; throws when Discord cannot say.
  member(id: string): Promise<Member | null>;
  canGive(roleId: string): boolean;
  // False when the post could not be made.
  post(post: Post): Promise<boolean>;
  // Whether the DM reached the member.
  dm(id: string, text: string): Promise<boolean>;
  // Display names for the ids still in the server.
  names(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
  retryMs?: number;
}>;

// A command, a join and an expiry for one member take turns, so none acts on
// a record another is changing.
const inMemberTurn = serial();
const open = new Set<Promise<unknown>>();
let closing = false;

function turn<T>(id: string, work: () => Promise<T>): Promise<T> {
  if (closing) return Promise.resolve().then(() => refuse('Lady Justice is restarting. Try again in a minute.'));
  const running = inMemberTurn(id, work);
  open.add(running);
  const done = (): void => void open.delete(running);
  running.then(done, done);
  return running;
}

// Takes no new turn and waits for those in hand, so a shutdown does not cut one off midway.
export async function drained(): Promise<void> {
  closing = true;
  while (open.size) await Promise.allSettled([...open]);
}

type Dm = Readonly<{ id: string; text: string }>;

// Once core-api has recorded a change, what follows can only add to the answer:
// a failure here is reported, never thrown, so staff do not record it twice.
async function announce(ports: Ports, post: Post, done: string, dm: Dm | undefined, todo: Todo): Promise<string> {
  const problems: string[] = [];
  if (todo) problems.push('staff must finish it by hand (see the post)');
  if (!(await ports.post(post))) problems.push('the post in the suspended channel failed');
  if (dm && !(await ports.dm(dm.id, dm.text))) problems.push('the DM did not reach them, so tell them in the server');
  return problems.length ? `⚠️ ${done}, but ${problems.join(' and ')}.` : `✅ ${done}.`;
}

const audit = (what: string, staffId: string | null): string => `Lady Justice: ${what}${staffId ? ` by ${staffId}` : ''}`;
const withTodo = (todo: Todo): Readonly<{ todo?: string }> => (todo ? { todo } : {});

// The moved roles a member holds, all kept on the record, split into those the bot
// may take and those left for staff.
function rolesToTake(ports: Ports, member: Member | null): Readonly<{ kept: string[]; take: string[]; left: string[] }> {
  const kept = member ? movedRolesOf(member) : [];
  return { kept, take: kept.filter((id) => ports.canGive(id)), left: kept.filter((id) => !ports.canGive(id)) };
}

// Each role write reads the member afresh, falling back to the copy in hand.
const reader =
  (ports: Ports, member: Member): Read =>
  async () =>
    (await ports.member(member.id).catch(() => null)) ?? member;

// The pending entry only carries the reason to the join, which applies the suspension
// with or without it, so a failure to write it is logged rather than reported.
async function pend(ports: Ports, id: string, punishment: TierCategory | FlatType, staffId: string, reason: string | null): Promise<void> {
  await ports.api.setPending(id, punishment, staffId, reason).catch((error: unknown) => log.warn(`pending entry not written for ${id}`, error));
}

type Punishment = Readonly<{ kind: 'tier'; category: TierCategory } | { kind: 'flat'; type: FlatType }>;

const ABSENT = 'Not in the server: the suspension applies when they join.';

// Gives the lagger role and takes the host role; nothing is written when both are already so.
async function tag(ports: Ports, member: Member, what: string, staffId: string | null): Promise<Todo> {
  const remove = isHost(member) ? [config.roles.host] : [];
  const add = isTagged(member) ? [] : [config.roles.lagger];
  if (!remove.length && !add.length) return undefined;
  return move(member.id, reader(ports, member), remove, add, audit(what, staffId), ports.retryMs);
}

// A lagger strike: recorded like a tier, with the tag at the third instead of a suspension.
function strike(ports: Ports, staffId: string, targetId: string, reason: string | null): Promise<string> {
  return turn(targetId, async () => {
    const member = await ports.member(targetId);
    const r = await ports.api.tier(targetId, 'lagger', staffId, reason, []);
    const infraction = strikeLabel(r.tier);
    const facts = { member: targetId, infraction, reason };
    if (!r.is_ban_threshold) {
      const post: Post = { tone: 'warning', title: 'Lagger strike', facts: { ...facts, result: 'Strike recorded', ...(member ? {} : { todo: 'Not in the server.' }) } };
      return announce(ports, post, `Recorded ${infraction.toLowerCase()} for <@${targetId}>`, member ? { id: targetId, text: dms.strike(r.tier, reason) } : undefined, undefined);
    }
    const already = member !== null && isTagged(member);
    const hosted = member !== null && isHost(member);
    const todo = member ? await tag(ports, member, 'tagged as a lagger', staffId) : 'Not in the server: the tag is given when they join.';
    const result = already ? 'Already tagged as a lagger' : `Tagged as a lagger${hosted ? '; the host role removed' : ''}`;
    const post: Post = { tone: 'suspended', title: already ? 'Lagger strike' : 'Tagged as a lagger', facts: { ...facts, result, ...withTodo(todo) } };
    const dm = member && !already ? { id: targetId, text: dms.tagged(reason) } : undefined;
    return announce(ports, post, already ? `<@${targetId}> is already tagged as a lagger` : `Tagged <@${targetId}> as a lagger`, dm, member ? todo : undefined);
  });
}

export function recordInfraction(ports: Ports, staffId: string, targetId: string, punishment: Punishment, reason: string | null): Promise<string> {
  if (punishment.kind === 'tier' && punishment.category === 'lagger') return strike(ports, staffId, targetId, reason);
  return turn(targetId, async () => {
    const member = await ports.member(targetId);
    const { kept, take, left } = rolesToTake(ports, member);
    const move = async (what: string): Promise<Todo> => (member ? suspend(member.id, reader(ports, member), take, left, audit(what, staffId), ports.retryMs) : ABSENT);
    const facts = { member: targetId, reason };

    if (punishment.kind === 'flat') {
      const r = await ports.api.flat(targetId, punishment.type, staffId, reason, kept);
      const infraction = flatLabel(r.type);
      if (!member) await pend(ports, targetId, r.type, staffId, reason);
      const todo = await move(infraction);
      const post: Post = { tone: 'suspended', title: 'Suspended', facts: { ...facts, infraction, result: daysLabel(r.days_added), ends: r.ends, ...withTodo(todo) } };
      const dm = member ? { id: targetId, text: dms.suspended(infraction, r.days_added, r.ends, reason) } : undefined;
      return announce(ports, post, `Suspended <@${targetId}> for ${daysLabel(r.days_added)}`, dm, member ? todo : undefined);
    }

    const r = await ports.api.tier(targetId, punishment.category, staffId, reason, kept);
    const infraction = tierLabel(r.category, r.tier);
    if (r.is_warning_only) {
      const result = r.held ? 'Warning; still held at the ban threshold' : r.suspended ? 'Warning; their running suspension is unchanged' : 'Warning';
      const post: Post = { tone: 'warning', title: 'Warning', facts: { ...facts, infraction, result, ...(member ? {} : { todo: 'Not in the server.' }) } };
      return announce(ports, post, `Warned <@${targetId}>`, member ? { id: targetId, text: dms.warning(infraction, reason) } : undefined, undefined);
    }

    if (!member) await pend(ports, targetId, r.category, staffId, reason);
    const todo = await move(infraction);
    const done = member ? todo : undefined;
    if (r.held || r.ends === null) {
      const reached = r.is_ban_threshold;
      const result = reached ? 'Ban threshold reached: suspended until staff ban them with Wick or run /admin unsuspend' : 'Recorded while held at the ban threshold';
      const post: Post = { tone: 'held', title: reached ? 'Held at the ban threshold' : 'Still held', facts: { ...facts, infraction, result, ends: null, ...withTodo(todo) }, pingModerators: reached };
      const dm = member && reached ? { id: targetId, text: dms.held(infraction, reason) } : undefined;
      return announce(ports, post, reached ? `<@${targetId}> reached the ban threshold and is held until staff act` : `Recorded; <@${targetId}> is still held`, dm, done);
    }
    const post: Post = { tone: 'suspended', title: 'Suspended', facts: { ...facts, infraction, result: daysLabel(r.days_added), ends: r.ends, ...withTodo(todo) } };
    const dm = member ? { id: targetId, text: dms.suspended(infraction, r.days_added, r.ends, reason) } : undefined;
    return announce(ports, post, `Suspended <@${targetId}> for ${daysLabel(r.days_added)}`, dm, done);
  });
}

export function changeDays(ports: Ports, staffId: string, targetId: string, days: number): Promise<string> {
  return turn(targetId, async () => {
    const r = await ports.api.days(targetId, days, staffId);
    const change = `${days > 0 ? '+' : '−'}${daysLabel(Math.abs(days))}`;
    const result = r.suspended ? change : `${change}: the suspension has ended and their roles come back within a minute`;
    const post: Post = { tone: 'changed', title: 'Suspension changed', facts: { member: targetId, result, ...(r.suspended ? { ends: r.ends } : {}) } };
    // A change that ends the suspension is told to the member by its expiry; one
    // Discord cannot say is in the server is still sent the DM, so a miss is reported.
    const member = r.suspended ? await ports.member(targetId).catch(() => undefined) : null;
    return announce(ports, post, `Changed <@${targetId}>'s suspension by ${change}`, member !== null ? { id: targetId, text: dms.changed(change, r.ends) } : undefined, undefined);
  });
}

export function removeTier(ports: Ports, staffId: string, targetId: string, category: TierCategory): Promise<string> {
  return turn(targetId, async () => {
    const r = await ports.api.removeTier(targetId, category, staffId);
    if (!r.was_changed) return `ℹ️ <@${targetId}> has no ${category === 'lagger' ? 'lagger strike' : `${category} tier`} to remove.`;
    if (category !== 'lagger') {
      const post: Post = { tone: 'changed', title: 'Tier removed', facts: { member: targetId, infraction: kindLabel(r.category), result: `One tier removed, now tier ${r.tier}` } };
      return announce(ports, post, `Removed a ${category} tier from <@${targetId}>; it is now ${r.tier}`, undefined, undefined);
    }
    // Below three strikes the tag comes off, if they wear it; when Discord cannot say, staff check.
    const member = await ports.member(targetId).catch(() => undefined);
    const untag = member != null && isTagged(member);
    const todo =
      member === undefined
        ? `If they wear <@&${config.roles.lagger}>: ${byHand([config.roles.lagger], [])}`
        : untag
          ? await move(member.id, reader(ports, member), [config.roles.lagger], [], audit('lagger tag removed', staffId), ports.retryMs)
          : undefined;
    const result = `One strike removed, now ${strikesLabel(r.tier)}${untag ? '; the lagger tag removed' : ''}`;
    const post: Post = { tone: 'changed', title: 'Lagger strike removed', facts: { member: targetId, result, ...withTodo(todo) } };
    return announce(ports, post, `Removed a lagger strike from <@${targetId}>; now ${strikesLabel(r.tier)}`, untag ? { id: targetId, text: dms.untagged(r.tier) } : undefined, todo);
  });
}

type Ended = Readonly<{ member: Member | null; todo: Todo }>;

// Gives back the kept roles once the record is no longer suspended: when this call
// ended it, or an earlier one whose answer was lost did and the member still wears Suspended.
async function giveBack(ports: Ports, r: SuspensionCleared, id: string, what: string, staffId: string | null): Promise<Ended | null> {
  if (!r.cleared && r.suspended) return null;
  let member: Member | null;
  try {
    member = await ports.member(id);
  } catch (error) {
    log.warn(`member ${id} not read after the suspension ended`, error instanceof Error ? error.message : error);
    const todo = byHand([config.roles.suspended], r.suspended_roles);
    return { member: null, todo: r.cleared ? todo : `If they still wear <@&${config.roles.suspended}>: ${todo}` };
  }
  if (!r.cleared && !(member && isSuspended(member))) return null;
  return { member, todo: member ? await release(id, reader(ports, member), r.suspended_roles, ports.canGive, audit(what, staffId), ports.retryMs) : undefined };
}

export function unsuspend(ports: Ports, staffId: string, targetId: string, reason: string): Promise<string> {
  return turn(targetId, async () => {
    const ended = await giveBack(ports, await ports.api.unsuspend(targetId, staffId, reason), targetId, 'suspension lifted', staffId);
    if (!ended) return `ℹ️ <@${targetId}> is not suspended.`;
    const post: Post = { tone: 'lifted', title: 'Suspension lifted', facts: { member: targetId, reason, ...withTodo(ended.todo) } };
    return announce(ports, post, `Lifted <@${targetId}>'s suspension`, ended.member ? { id: targetId, text: dms.lifted(reason) } : undefined, ended.todo);
  });
}

// The expiry loop's step for one member: core-api ends only what is due.
export function expire(ports: Ports, targetId: string): Promise<void> {
  return turn(targetId, async () => {
    const ended = await giveBack(ports, await ports.api.expire(targetId), targetId, 'suspension ended', null);
    if (!ended) return;
    const result = ended.todo ? 'Served in full' : ended.member ? 'Served in full; roles given back' : 'Served in full; not in the server';
    const post: Post = { tone: 'lifted', title: 'Suspension ended', facts: { member: targetId, result, ...withTodo(ended.todo) } };
    log.info(`suspension ended for ${targetId}`);
    await announce(ports, post, 'ended', ended.member ? { id: targetId, text: dms.ended(!ended.todo) } : undefined, ended.todo);
  });
}

// A join no one could check is posted, so staff check it by hand.
async function notChecked(ports: Ports, id: string, why: string): Promise<void> {
  const todo = `${why}. Check their standing with /lookup and suspend them by hand if needed.`;
  await ports.post({ tone: 'warning', title: 'Join not checked', facts: { member: id, todo } });
}

// A member who joins while suspended is suspended again, keeping the roles they came back with.
export function joined(ports: Ports, member: Member): Promise<void> {
  if (closing) return notChecked(ports, member.id, 'Lady Justice was restarting when this member joined');
  return turn(member.id, async () => {
    // A fresh read, as onboarding or another bot may have given roles since the join.
    const fresh = (await ports.member(member.id).catch(() => null)) ?? member;
    const { kept, take, left } = rolesToTake(ports, fresh);
    let r: PendingApplied;
    try {
      r = await ports.api.applyPending(member.id, kept);
    } catch (error) {
      log.error(`join of ${member.id} not checked`, error);
      return notChecked(ports, member.id, 'core-api could not check this member on joining');
    }
    if (r.lagger_tagged && !isTagged(fresh)) {
      const todo = await tag(ports, fresh, 'lagger tag applied on joining', null);
      log.info(`lagger tag applied on joining for ${member.id}`);
      await announce(ports, { tone: 'warning', title: 'Lagger tag applied on joining', facts: { member: member.id, ...withTodo(todo) } }, 'applied', undefined, todo);
    }
    if (!r.applied) return;
    const infraction = kindLabel(r.punishment_type);
    const todo = await suspend(member.id, reader(ports, fresh), take, left, audit('suspension applied on joining', null), ports.retryMs);
    const post: Post = {
      tone: r.held ? 'held' : 'suspended',
      title: 'Suspension applied on joining',
      facts: { member: member.id, infraction, ends: r.held ? null : r.ends, reason: r.reason, ...withTodo(todo) },
    };
    log.info(`suspension applied on joining for ${member.id}`);
    await announce(ports, post, 'applied', { id: member.id, text: dms.rejoined(infraction, r.held ? null : r.ends) }, todo);
  });
}
