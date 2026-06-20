import type { FlatType, TierCategory } from '../api/types.js';
import { config } from '../config/index.js';

export function buildSuspensionDM(params: {
  category: TierCategory;
  tier: number;
  days_added: number;
  ends: Date;
  reason: string;
  is_ban_threshold: boolean;
}): string {
  const endStr = params.ends.toUTCString();
  const infractionLine = `Infraction: **[ TIER ${params.tier} ${params.category.toUpperCase()} ]**`;
  if (params.is_ban_threshold) {
    return (
      `Suspension Notice:\n` +
      `${infractionLine}\n` +
      `Result: cpl server ban.\n` +
      `Suspension ends on: **${endStr}**\n` +
      `Reason: ${params.reason}\n` +
      `You have reached tier **${params.tier}**. You now have **24 hours** to appeal your permaban.`
    );
  }
  const days = params.days_added === 1 ? '**1** day suspension.' : `**${params.days_added}** days suspension.`;
  return (
    `Suspension Notice:\n` +
    `${infractionLine}\n` +
    `Result: ${days}\n` +
    `Suspension ends on: **${endStr}**\n` +
    `Reason: ${params.reason}`
  );
}

export function buildSuspensionChannelMsg(params: {
  userId: string;
  category: TierCategory;
  tier: number;
  days_added: number;
  ends: Date;
  reason: string;
  is_ban_threshold: boolean;
}): string {
  const endStr = params.ends.toUTCString();
  const infractionLine = `Infraction: **[ TIER ${params.tier} ${params.category.toUpperCase()} ]**`;
  if (params.is_ban_threshold) {
    return (
      `Suspension Notice:\n` +
      `Member: <@${params.userId}>\n` +
      `User Id: ${params.userId}\n` +
      `${infractionLine}\n` +
      `Result: User banned from server.\n` +
      `Suspension ends on: **${endStr}**\n` +
      `Reason: ${params.reason}\n` +
      `<@&${config.discord.roles.moderator}> - Target user is due to be banned via Wick.`
    );
  }
  const days = params.days_added === 1 ? '**1** day suspension.' : `**${params.days_added}** days suspension.`;
  return (
    `Suspension Notice:\n` +
    `Member: <@${params.userId}>\n` +
    `User Id: ${params.userId}\n` +
    `${infractionLine}\n` +
    `Result: ${days}\n` +
    `Suspension ends on: **${endStr}**\n` +
    `Reason: ${params.reason}`
  );
}

export function buildWarningDM(params: { reason: string }): string {
  return (
    `Warning Notice:\n` +
    `Infraction: **[ TIER 1 MINOR ]**\n` +
    `Result: **Warning**\n` +
    `Reason: ${params.reason}`
  );
}

export function buildWarningChannelMsg(params: { userId: string; reason: string }): string {
  return (
    `Warning Notice:\n` +
    `Member: <@${params.userId}>\n` +
    `User Id: ${params.userId}\n` +
    `Infraction: **[ TIER 1 MINOR ]**\n` +
    `Result: **Warning**\n` +
    `Reason: ${params.reason}`
  );
}

export function buildAbsentUserMsg(params: { userId: string }): string {
  return `<@${params.userId}> is not in the server. Their infraction has been recorded and will be applied when they rejoin.`;
}

export function buildFlatSuspensionDM(params: {
  type: FlatType;
  days_added: number;
  ends: Date;
  reason: string;
}): string {
  const endStr = params.ends.toUTCString();
  const days = params.days_added === 1 ? '**1** day suspension.' : `**${params.days_added}** days suspension.`;
  return (
    `Suspension Notice:\n` +
    `Infraction: **[ ${params.type.toUpperCase()} ]**\n` +
    `Result: ${days}\n` +
    `Suspension ends on: **${endStr}**\n` +
    `Reason: ${params.reason}`
  );
}

export function buildFlatSuspensionChannelMsg(params: {
  userId: string;
  type: FlatType;
  days_added: number;
  ends: Date;
  reason: string;
}): string {
  const endStr = params.ends.toUTCString();
  const days = params.days_added === 1 ? '**1** day suspension.' : `**${params.days_added}** days suspension.`;
  return (
    `Suspension Notice:\n` +
    `Member: <@${params.userId}>\n` +
    `User Id: ${params.userId}\n` +
    `Infraction: **[ ${params.type.toUpperCase()} ]**\n` +
    `Result: ${days}\n` +
    `Suspension ends on: **${endStr}**\n` +
    `Reason: ${params.reason}`
  );
}

export function buildUnsuspendDM(params: { reason: string }): string {
  return (
    `Unsuspension Notice:\n` +
    `**Your suspension has been lifted.**\n` +
    `Reason: ${params.reason}`
  );
}

export function buildUnsuspendChannelMsg(params: { userId: string; reason: string }): string {
  return (
    `Unsuspension Notice:\n` +
    `Member: <@${params.userId}>\n` +
    `User Id: ${params.userId}\n` +
    `**The suspension has been lifted.**\n` +
    `Reason: ${params.reason}`
  );
}

export function buildModifyDaysDM(params: { days: number; newEnds: Date }): string {
  const endStr = params.newEnds.toUTCString();
  const verb = params.days > 0 ? `+${params.days}` : `${params.days}`;
  return (
    `Suspension Modified:\n` +
    `Days adjusted: **${verb}**\n` +
    `New suspension end: **${endStr}**`
  );
}

export function buildModifyDaysChannelMsg(params: {
  userId: string;
  days: number;
  newEnds: Date;
}): string {
  const endStr = params.newEnds.toUTCString();
  const verb = params.days > 0 ? `+${params.days}` : `${params.days}`;
  return (
    `Suspension Modified:\n` +
    `Member: <@${params.userId}>\n` +
    `User Id: ${params.userId}\n` +
    `Days adjusted: **${verb}**\n` +
    `New suspension end: **${endStr}**`
  );
}

export function buildRemoveTierChannelMsg(params: {
  userId: string;
  category: TierCategory;
  newTier: number;
  wasChanged: boolean;
}): string {
  if (!params.wasChanged) {
    return `<@${params.userId}> already has tier 0 for **${params.category}** — no change made.`;
  }
  return (
    `Tier Removed:\n` +
    `Member: <@${params.userId}>\n` +
    `Category: **${params.category}**\n` +
    `New tier: **${params.newTier}**`
  );
}

export function buildPendingAppliedDM(params: {
  punishmentType: string;
  ends: Date;
  reason: string | null;
}): string {
  const endStr = params.ends.toUTCString();
  return (
    `Suspension Notice:\n` +
    `Infraction: **[ ${params.punishmentType.toUpperCase()} ]**\n` +
    `Suspension ends on: **${endStr}**\n` +
    `Reason: ${params.reason ?? 'No reason provided'}`
  );
}

export function buildPendingAppliedChannelMsg(params: {
  userId: string;
  punishmentType: string;
  ends: Date;
}): string {
  const endStr = params.ends.toUTCString();
  return (
    `Suspension Applied on Rejoin:\n` +
    `Member: <@${params.userId}>\n` +
    `User Id: ${params.userId}\n` +
    `Infraction: **[ ${params.punishmentType.toUpperCase()} ]**\n` +
    `Suspension ends on: **${endStr}**`
  );
}

export function buildExpiredSuspensionChannelMsg(params: { userId: string }): string {
  return (
    `Suspension Expired:\n` +
    `Member: <@${params.userId}>\n` +
    `User Id: ${params.userId}\n` +
    `Suspension has expired and been automatically lifted.`
  );
}
