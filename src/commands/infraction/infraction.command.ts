import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import { execute as handlerExecute } from './infraction.handler.js';

export const data = new SlashCommandBuilder()
  .setName('infraction')
  .setDescription('Record an infraction for a member.')
  .addSubcommandGroup((group) =>
    group
      .setName('tier')
      .setDescription('Record a tier-based infraction.')
      .addSubcommand((sub) =>
        sub
          .setName('quit')
          .setDescription('Record a quit infraction.')
          .addUserOption((opt) =>
            opt.setName('target').setDescription('Target member.').setRequired(true),
          )
          .addStringOption((opt) =>
            opt.setName('reason').setDescription('Reason for the infraction.').setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('minor')
          .setDescription('Record a minor infraction.')
          .addUserOption((opt) =>
            opt.setName('target').setDescription('Target member.').setRequired(true),
          )
          .addStringOption((opt) =>
            opt.setName('reason').setDescription('Reason for the infraction.').setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('moderate')
          .setDescription('Record a moderate infraction.')
          .addUserOption((opt) =>
            opt.setName('target').setDescription('Target member.').setRequired(true),
          )
          .addStringOption((opt) =>
            opt.setName('reason').setDescription('Reason for the infraction.').setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('major')
          .setDescription('Record a major infraction.')
          .addUserOption((opt) =>
            opt.setName('target').setDescription('Target member.').setRequired(true),
          )
          .addStringOption((opt) =>
            opt.setName('reason').setDescription('Reason for the infraction.').setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('extreme')
          .setDescription('Record an extreme infraction.')
          .addUserOption((opt) =>
            opt.setName('target').setDescription('Target member.').setRequired(true),
          )
          .addStringOption((opt) =>
            opt.setName('reason').setDescription('Reason for the infraction.').setRequired(true),
          ),
      ),
  )
  .addSubcommandGroup((group) =>
    group
      .setName('flat')
      .setDescription('Apply a flat suspension.')
      .addSubcommand((sub) =>
        sub
          .setName('smurf')
          .setDescription('Apply a smurf suspension (30 days).')
          .addUserOption((opt) =>
            opt.setName('target').setDescription('Target member.').setRequired(true),
          )
          .addStringOption((opt) =>
            opt.setName('reason').setDescription('Reason for the suspension.').setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('oversub')
          .setDescription('Apply an over-sub suspension (3 days).')
          .addUserOption((opt) =>
            opt.setName('target').setDescription('Target member.').setRequired(true),
          )
          .addStringOption((opt) =>
            opt.setName('reason').setDescription('Reason for the suspension.').setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('comp')
          .setDescription('Apply a competition suspension (7 days).')
          .addUserOption((opt) =>
            opt.setName('target').setDescription('Target member.').setRequired(true),
          )
          .addStringOption((opt) =>
            opt.setName('reason').setDescription('Reason for the suspension.').setRequired(false),
          ),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await handlerExecute(interaction);
}
