import { GuildMember, type ChatInputCommandInteraction, type Client } from 'discord.js';
import { api } from '../api/client.js';
import type { FlatType, ModifyDaysResponse, TierCategory } from '../api/types.js';
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

function buildOnExpiry(client: Client, discordId: string): () => Promise<void> {
  return async () => {
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
  };
}

export async function handleTierInfraction(
  interaction: ChatInputCommandInteraction,
  category: TierCategory,
): Promise<void> {
  try {
    const targetUser = interaction.options.getUser('target', true);
    const rawMember = interaction.options.getMember('target');
    const targetMember = rawMember instanceof GuildMember ? rawMember : null;
    const reason = interaction.options.getString('reason');
    const reasonStr = reason ?? 'No reason provided';

    const rolesToRemove = targetMember ? getRolesToRemove(targetMember) : [];
    const response = await api.recordTierInfraction(targetUser.id, category, reason, rolesToRemove);

    if (response.is_warning_only) {
      await postToChannel(
        interaction,
        buildWarningChannelMsg({ userId: targetUser.id, reason: reasonStr }),
      );
      await interaction.editReply('Warning recorded.');
      if (targetMember) {
        targetMember.send(buildWarningDM({ reason: reasonStr })).catch((err: unknown) =>
          console.error(`[LJ Bot] Failed to DM ${targetUser.id}:`, err),
        );
      }
      return;
    }

    if (!response.ends) {
      await safeEditReply(interaction, 'Infraction recorded but end date is missing.');
      return;
    }

    const ends = new Date(response.ends);

    if (targetMember) {
      await applySuspension(targetMember, rolesToRemove);
      suspensionScheduler.schedule(
        targetUser.id,
        ends,
        buildOnExpiry(interaction.client, targetUser.id),
      );
      await postToChannel(
        interaction,
        buildSuspensionChannelMsg({
          userId: targetUser.id,
          category,
          tier: response.tier,
          days_added: response.days_added,
          ends,
          reason: reasonStr,
          is_ban_threshold: response.is_ban_threshold,
        }),
      );
      await interaction.editReply('Infraction recorded.');
      targetMember.send(
        buildSuspensionDM({
          category,
          tier: response.tier,
          days_added: response.days_added,
          ends,
          reason: reasonStr,
          is_ban_threshold: response.is_ban_threshold,
        }),
      ).catch((err: unknown) => console.error(`[LJ Bot] Failed to DM ${targetUser.id}:`, err));
    } else {
      if (response.suspended) {
        await api.createPendingSuspension(targetUser.id, category, reason);
      }
      await postToChannel(interaction, buildAbsentUserMsg({ userId: targetUser.id }));
      await interaction.editReply('Infraction recorded for absent user.');
    }
  } catch (error) {
    console.error('[LJ Bot] handleTierInfraction error:', error);
    await safeEditReply(interaction, toUserErrorMessage(error));
  }
}

export async function handleFlatSuspension(
  interaction: ChatInputCommandInteraction,
  type: FlatType,
): Promise<void> {
  try {
    const targetUser = interaction.options.getUser('target', true);
    const rawMember = interaction.options.getMember('target');
    const targetMember = rawMember instanceof GuildMember ? rawMember : null;
    const reason = interaction.options.getString('reason');
    const reasonStr = reason ?? 'No reason provided';

    const rolesToRemove = targetMember ? getRolesToRemove(targetMember) : [];
    const response = await api.recordFlatSuspension(targetUser.id, type, reason, rolesToRemove);
    const ends = new Date(response.ends);

    if (targetMember) {
      await applySuspension(targetMember, rolesToRemove);
      suspensionScheduler.schedule(
        targetUser.id,
        ends,
        buildOnExpiry(interaction.client, targetUser.id),
      );
      await postToChannel(
        interaction,
        buildFlatSuspensionChannelMsg({
          userId: targetUser.id,
          type,
          days_added: response.days_added,
          ends,
          reason: reasonStr,
        }),
      );
      await interaction.editReply('Infraction recorded.');
      targetMember.send(
        buildFlatSuspensionDM({ type, days_added: response.days_added, ends, reason: reasonStr }),
      ).catch((err: unknown) => console.error(`[LJ Bot] Failed to DM ${targetUser.id}:`, err));
    } else {
      await api.createPendingSuspension(targetUser.id, type, reason);
      await postToChannel(interaction, buildAbsentUserMsg({ userId: targetUser.id }));
      await interaction.editReply('Infraction recorded for absent user.');
    }
  } catch (error) {
    console.error('[LJ Bot] handleFlatSuspension error:', error);
    await safeEditReply(interaction, toUserErrorMessage(error));
  }
}

export async function handleUnsuspend(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const targetUser = interaction.options.getUser('target', true);
    const rawMember = interaction.options.getMember('target');
    const targetMember = rawMember instanceof GuildMember ? rawMember : null;
    const reason = interaction.options.getString('reason', true);

    const record = await api.getRecord(targetUser.id);
    if (!record.suspended) {
      await interaction.editReply(`<@${targetUser.id}> is not currently suspended.`);
      return;
    }

    if (targetMember) {
      await restoreRoles(targetMember, record.suspended_roles);
    }

    await api.unsuspend(targetUser.id);
    suspensionScheduler.cancel(targetUser.id);

    await postToChannel(
      interaction,
      buildUnsuspendChannelMsg({ userId: targetUser.id, reason }),
    );
    await interaction.editReply('Unsuspended.');
    if (targetMember) {
      targetMember.send(buildUnsuspendDM({ reason })).catch((err: unknown) =>
        console.error(`[LJ Bot] Failed to DM ${targetUser.id}:`, err),
      );
    }
  } catch (error) {
    console.error('[LJ Bot] handleUnsuspend error:', error);
    await safeEditReply(interaction, toUserErrorMessage(error));
  }
}

export async function handleModifyDays(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const targetUser = interaction.options.getUser('target', true);
    const days = interaction.options.getInteger('days', true);

    if (days === 0) {
      await interaction.editReply('Days must be non-zero.');
      return;
    }

    let response: ModifyDaysResponse;
    if (days > 0) {
      response = await api.addDays(targetUser.id, days);
    } else {
      response = await api.removeDays(targetUser.id, Math.abs(days));
    }

    const newEnds = new Date(response.new_ends);
    suspensionScheduler.reschedule(
      targetUser.id,
      newEnds,
      buildOnExpiry(interaction.client, targetUser.id),
    );

    await postToChannel(
      interaction,
      buildModifyDaysChannelMsg({ userId: targetUser.id, days, newEnds }),
    );
    await interaction.editReply('Days modified.');

    const rawMember = interaction.options.getMember('target');
    const targetMember = rawMember instanceof GuildMember ? rawMember : null;
    if (targetMember) {
      targetMember.send(buildModifyDaysDM({ days, newEnds })).catch((err: unknown) =>
        console.error(`[LJ Bot] Failed to DM ${targetUser.id}:`, err),
      );
    }
  } catch (error) {
    console.error('[LJ Bot] handleModifyDays error:', error);
    await safeEditReply(interaction, toUserErrorMessage(error));
  }
}

export async function handleRemoveTier(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const targetUser = interaction.options.getUser('target', true);
    const category = interaction.options.getString('category', true) as TierCategory;

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
  } catch (error) {
    console.error('[LJ Bot] handleRemoveTier error:', error);
    await safeEditReply(interaction, toUserErrorMessage(error));
  }
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

  member
    .send(buildPendingAppliedDM({ punishmentType: pending.punishment_type, ends, reason: pending.reason }))
    .catch((err: unknown) => console.error(`[LJ Bot] Failed to DM ${member.id}:`, err));

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