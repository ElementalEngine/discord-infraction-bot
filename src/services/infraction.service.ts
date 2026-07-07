import { GuildMember, type ChatInputCommandInteraction, type Client, type User } from 'discord.js';
import { api } from '../api/client.js';
import { isTierCategory, type FlatType, type ModifyDaysResponse, type TierCategory } from '../api/types.js';
import { config } from '../config/index.js';
import {
  buildAbsentUserMsg,
  buildExpiredSuspensionChannelMsg,
  buildFlatSuspensionChannelMsg,
  buildFlatSuspensionDM,
  buildModifyDaysChannelMsg,
  buildModifyDaysDM,
  buildPendingAppliedChannelMsg,
  buildPendingAppliedDM,
  buildRemoveTierChannelMsg,
  buildSuspensionChannelMsg,
  buildSuspensionDM,
  buildUnsuspendChannelMsg,
  buildUnsuspendDM,
  buildWarningChannelMsg,
  buildWarningDM,
} from '../messages/suspension.messages.js';
import { toUserErrorMessage } from '../utils/error-message.js';
import { safeEditReply } from '../utils/safe-reply.js';
import { applySuspension, getRolesToRemove, restoreRoles } from './role.service.js';
import { suspensionScheduler } from './suspension-scheduler.service.js';

async function postToChannel(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  if (interaction.channel?.isSendable()) {
    await interaction.channel.send(content);
  }
}

async function resolveExpiredSuspension(client: Client, discordId: string): Promise<void> {
  const record = await api.getRecord(discordId);
  if (!record.suspended) return;

  const guild = client.guilds.cache.get(config.discord.guildId);
  const member = guild ? await guild.members.fetch(discordId).catch(() => null) : null;

  if (member) {
    await restoreRoles(member, record.suspended_roles);
  }

  await api.unsuspend(discordId);

  const channel = guild?.channels.cache.get(config.discord.channels.suspendedChannel);
  if (channel && channel.isTextBased()) {
    await channel.send(buildExpiredSuspensionChannelMsg({ userId: discordId }));
  }
}

function buildOnExpiry(client: Client, discordId: string): () => Promise<void> {
  return () => resolveExpiredSuspension(client, discordId);
}

async function runHandler(
  label: string,
  interaction: ChatInputCommandInteraction,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error(`[LJ Bot] ${label} error:`, error);
    await safeEditReply(interaction, toUserErrorMessage(error));
  }
}

interface InfractionTarget {
  user: User;
  member: GuildMember | null;
  reason: string | null;
  reasonStr: string;
  rolesToRemove: string[];
}

function resolveInfractionTarget(interaction: ChatInputCommandInteraction): InfractionTarget {
  const user = interaction.options.getUser('target', true);
  const rawMember = interaction.options.getMember('target');
  const member = rawMember instanceof GuildMember ? rawMember : null;
  const reason = interaction.options.getString('reason');
  return {
    user,
    member,
    reason,
    reasonStr: reason ?? 'No reason provided',
    rolesToRemove: member ? getRolesToRemove(member) : [],
  };
}

function sendDM(member: GuildMember, content: string): void {
  member.send(content).catch((err: unknown) =>
    console.error(`[LJ Bot] Failed to DM ${member.id}:`, err),
  );
}

async function applySuspensionFlow(
  interaction: ChatInputCommandInteraction,
  member: GuildMember,
  rolesToRemove: string[],
  ends: Date,
  channelMsg: string,
  dmMsg: string,
): Promise<void> {
  await applySuspension(member, rolesToRemove);
  suspensionScheduler.schedule(member.id, ends, buildOnExpiry(interaction.client, member.id));
  await postToChannel(interaction, channelMsg);
  await interaction.editReply('Infraction recorded.');
  sendDM(member, dmMsg);
}

async function recordAbsentInfraction(
  interaction: ChatInputCommandInteraction,
  userId: string,
  pending: { punishmentType: string; reason: string | null } | null,
): Promise<void> {
  if (pending) {
    await api.createPendingSuspension(userId, pending.punishmentType, pending.reason);
  }
  await postToChannel(interaction, buildAbsentUserMsg({ userId }));
  await interaction.editReply('Infraction recorded for absent user.');
}

export async function reconcileOverdueSuspensions(client: Client): Promise<void> {
  const overdue = await api.getOverdueSuspensions();
  if (!Array.isArray(overdue) || overdue.length === 0) return;

  console.log(`[LJ Bot] Reconciling ${overdue.length} overdue suspension(s).`);
  for (const { discord_id } of overdue) {
    try {
      await resolveExpiredSuspension(client, discord_id);
    } catch (err: unknown) {
      console.error(`[LJ Bot] Failed to reconcile overdue suspension for ${discord_id}:`, err);
    }
  }
  console.log('[LJ Bot] Overdue reconciliation complete.');
}

export async function handleTierInfraction(
  interaction: ChatInputCommandInteraction,
  category: TierCategory,
): Promise<void> {
  await runHandler('handleTierInfraction', interaction, async () => {
    const target = resolveInfractionTarget(interaction);
    const response = await api.recordTierInfraction(
      target.user.id,
      category,
      target.reason,
      target.rolesToRemove,
    );

    if (response.is_warning_only) {
      await postToChannel(
        interaction,
        buildWarningChannelMsg({ userId: target.user.id, reason: target.reasonStr }),
      );
      await interaction.editReply('Warning recorded.');
      if (target.member) {
        sendDM(target.member, buildWarningDM({ reason: target.reasonStr }));
      }
      return;
    }

    if (!response.ends) {
      await safeEditReply(interaction, 'Infraction recorded but end date is missing.');
      return;
    }

    const ends = new Date(response.ends);

    if (target.member) {
      const details = {
        category,
        tier: response.tier,
        days_added: response.days_added,
        ends,
        reason: target.reasonStr,
        is_ban_threshold: response.is_ban_threshold,
      };
      await applySuspensionFlow(
        interaction,
        target.member,
        target.rolesToRemove,
        ends,
        buildSuspensionChannelMsg({ userId: target.user.id, ...details }),
        buildSuspensionDM(details),
      );
    } else {
      await recordAbsentInfraction(
        interaction,
        target.user.id,
        response.suspended ? { punishmentType: category, reason: target.reason } : null,
      );
    }
  });
}

export async function handleFlatSuspension(
  interaction: ChatInputCommandInteraction,
  type: FlatType,
): Promise<void> {
  await runHandler('handleFlatSuspension', interaction, async () => {
    const target = resolveInfractionTarget(interaction);
    const response = await api.recordFlatSuspension(
      target.user.id,
      type,
      target.reason,
      target.rolesToRemove,
    );
    const ends = new Date(response.ends);

    if (target.member) {
      const details = { type, days_added: response.days_added, ends, reason: target.reasonStr };
      await applySuspensionFlow(
        interaction,
        target.member,
        target.rolesToRemove,
        ends,
        buildFlatSuspensionChannelMsg({ userId: target.user.id, ...details }),
        buildFlatSuspensionDM(details),
      );
    } else {
      await recordAbsentInfraction(interaction, target.user.id, {
        punishmentType: type,
        reason: target.reason,
      });
    }
  });
}

export async function handleUnsuspend(interaction: ChatInputCommandInteraction): Promise<void> {
  await runHandler('handleUnsuspend', interaction, async () => {
    const target = resolveInfractionTarget(interaction);
    const reason = interaction.options.getString('reason', true);

    const record = await api.getRecord(target.user.id);
    if (!record.suspended) {
      await interaction.editReply(`<@${target.user.id}> is not currently suspended.`);
      return;
    }

    if (target.member) {
      await restoreRoles(target.member, record.suspended_roles);
    }

    await api.unsuspend(target.user.id);
    suspensionScheduler.cancel(target.user.id);

    await postToChannel(
      interaction,
      buildUnsuspendChannelMsg({ userId: target.user.id, reason }),
    );
    await interaction.editReply('Unsuspended.');
    if (target.member) {
      sendDM(target.member, buildUnsuspendDM({ reason }));
    }
  });
}

export async function handleModifyDays(interaction: ChatInputCommandInteraction): Promise<void> {
  await runHandler('handleModifyDays', interaction, async () => {
    const target = resolveInfractionTarget(interaction);
    const days = interaction.options.getInteger('days', true);

    if (days === 0) {
      await interaction.editReply('Days must be non-zero.');
      return;
    }

    let response: ModifyDaysResponse;
    if (days > 0) {
      response = await api.addDays(target.user.id, days);
    } else {
      response = await api.removeDays(target.user.id, Math.abs(days));
    }

    const newEnds = new Date(response.new_ends);
    suspensionScheduler.reschedule(
      target.user.id,
      newEnds,
      buildOnExpiry(interaction.client, target.user.id),
    );

    await postToChannel(
      interaction,
      buildModifyDaysChannelMsg({ userId: target.user.id, days, newEnds }),
    );
    await interaction.editReply('Days modified.');

    if (target.member) {
      sendDM(target.member, buildModifyDaysDM({ days, newEnds }));
    }
  });
}

export async function handleRemoveTier(interaction: ChatInputCommandInteraction): Promise<void> {
  await runHandler('handleRemoveTier', interaction, async () => {
    const targetUser = interaction.options.getUser('target', true);
    const category = interaction.options.getString('category', true);
    if (!isTierCategory(category)) {
      console.error(`[LJ Bot] handleRemoveTier received unknown category: ${category}`);
      await interaction.editReply('Unknown infraction category.');
      return;
    }

    const record = await api.getRecord(targetUser.id);
    if (record.suspended) {
      await interaction.editReply(
        `<@${targetUser.id}> is currently suspended. Remove the suspension before modifying tiers.`,
      );
      return;
    }

    const result = await api.removeTier(targetUser.id, category);

    await postToChannel(
      interaction,
      buildRemoveTierChannelMsg({
        userId: targetUser.id,
        category,
        newTier: result.new_tier,
        wasChanged: result.was_changed,
      }),
    );
    await interaction.editReply('Tier updated.');
  });
}

export async function handlePendingSuspensionOnJoin(
  client: Client,
  member: GuildMember,
): Promise<void> {
  const pending = await api.getPendingSuspension(member.id);
  if (!pending) return;

  const record = await api.getRecord(member.id);
  const now = new Date();
  const isStillSuspended =
    record.suspended && (!record.ends || new Date(record.ends) > now);

  if (!isStillSuspended || !record.ends) {
    await api.deletePendingSuspension(member.id);
    return;
  }

  if (!member.guild.members.cache.has(member.id)) return;

  const ends = new Date(record.ends);

  const rolesToRemove = getRolesToRemove(member);
  await applySuspension(member, rolesToRemove);
  suspensionScheduler.schedule(member.id, ends, buildOnExpiry(client, member.id));

  sendDM(
    member,
    buildPendingAppliedDM({ punishmentType: pending.punishment_type, ends, reason: pending.reason }),
  );

  const guild = client.guilds.cache.get(config.discord.guildId);
  const channel = guild?.channels.cache.get(config.discord.channels.suspendedChannel);
  if (channel && channel.isTextBased()) {
    await channel.send(
      buildPendingAppliedChannelMsg({
        userId: member.id,
        punishmentType: pending.punishment_type,
        ends,
      }),
    );
  }

  await api.deletePendingSuspension(member.id);
}

export async function recoverScheduler(client: Client): Promise<void> {
  const activeSuspensions = await api.getActiveSuspensions();
  console.log(`[LJ Bot] Recovering ${activeSuspensions.length} active suspension(s).`);

  for (const { discord_id, ends } of activeSuspensions) {
    suspensionScheduler.schedule(discord_id, new Date(ends), buildOnExpiry(client, discord_id));
  }

  console.log('[LJ Bot] Scheduler recovery complete.');
}