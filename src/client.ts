import { setTimeout as wait } from 'node:timers/promises';

import { Client, Events, GatewayIntentBits, type ChatInputCommandInteraction, type Guild, type GuildMember } from 'discord.js';

import { api } from './api/client.js';
import * as admin from './commands/admin.js';
import * as infraction from './commands/infraction.js';
import * as lookup from './commands/lookup.js';
import { config } from './config/index.js';
import { startExpiry } from './services/expiry.js';
import { drained, expire, joined, rejoinedWhileAway, type Ports } from './services/infractions.js';
import { memberOrNull } from './services/roles.js';
import { checkAccess, setupProblems } from './services/setup.js';
import { failureOf } from './ui/failure.js';
import { render, type Post } from './ui/posts.js';
import { answer, defer } from './ui/reply.js';
import { log } from './utils/log.js';

const COMMANDS = new Map([infraction, admin, lookup].map((command) => [command.data.name, command]));

// Server Members brings the join event, which suspends a returning member again.
export const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

const memberOf = (guild: Guild, id: string): Promise<GuildMember | null> => memberOrNull(() => guild.members.fetch({ user: id, force: true }));

async function post(guild: Guild, message: Post): Promise<boolean> {
  try {
    const channel = await guild.channels.fetch(config.channels.suspended);
    if (!channel?.isSendable()) throw new Error('the suspended channel is not one the bot can post in');
    await channel.send(render(message));
    return true;
  } catch (error) {
    log.error(`post for ${message.facts.member} not made`, error);
    return false;
  }
}

// A DM is best effort: a member may close them.
async function dm(id: string, text: string): Promise<boolean> {
  try {
    await client.users.send(id, { content: text, allowedMentions: { parse: [] } });
    return true;
  } catch (error) {
    log.warn(`DM not delivered to ${id}`, error instanceof Error ? error.message : error);
    return false;
  }
}

// Discord answers up to 100 members a fetch; one who left is left out.
async function membersOf(guild: Guild, ids: readonly string[]): Promise<GuildMember[]> {
  const found: GuildMember[] = [];
  for (let i = 0; i < ids.length; i += 100) found.push(...(await guild.members.fetch({ user: [...ids.slice(i, i + 100)] })).values());
  return found;
}

const portsFor = (guild: Guild): Ports => ({
  api,
  member: (id) => memberOf(guild, id),
  canGive: (id) => guild.roles.cache.get(id)?.editable === true,
  post: (message) => post(guild, message),
  dm,
  names: async (ids) => new Map((await membersOf(guild, ids)).map((member) => [member.id, member.displayName] as const)),
});

// Every command ends in a private answer: what was done, or why not.
async function route(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild() || interaction.guildId !== config.discord.guildId) return answer(interaction, '‼️ Use this in the CPL server.');
  if (!accepting) return answer(interaction, stopping ? '⏳ Lady Justice is restarting. Try again in a minute.' : '⏳ Lady Justice is starting. Try again in a moment.');
  try {
    await defer(interaction);
    const command = COMMANDS.get(interaction.commandName);
    await answer(interaction, command ? await command.run(interaction, portsFor(interaction.guild)) : '‼️ That command is gone.');
  } catch (error) {
    const failure = failureOf(error);
    if (failure.ours) log.error(`/${interaction.commandName} by ${interaction.user.id} failed`, error);
    await answer(interaction, failure.text);
  }
}

let stopExpiry: (() => Promise<void>) | null = null;
// Commands wait until setup is checked, so none runs on a bot about to stop.
let accepting = false;
let stopping = false;

// Setup is checked before anything else, and a problem stops the bot with its reason.
async function ready(bot: Client<true>): Promise<void> {
  const guild = await bot.guilds.fetch(config.discord.guildId);
  const problems = await setupProblems(guild);
  if (problems.length) throw new Error(`setup is not right:\n  ${problems.join('\n  ')}`);
  await bot.application.commands.set([...COMMANDS.values()].map((command) => command.data.toJSON()), guild.id);
  await checkAccess(bot, guild).catch((error: unknown) => log.warn('command access not checked', error));
  const ports = portsFor(guild);
  stopExpiry = startExpiry({ due: () => api.due(), expire: (id) => expire(ports, id) });
  accepting = true;
  log.info(`Lady Justice ready as ${bot.user.tag}: ${COMMANDS.size} commands, expiry running`);
  rejoinedWhileAway(ports, (ids) => membersOf(guild, ids)).then(
    (back) => log.info(`startup check: ${back} serving member(s) back without the Suspended role`),
    (error: unknown) => log.warn('startup check of serving members not made', error),
  );
}

client.once(Events.ClientReady, (bot) => {
  ready(bot).catch((error: unknown) => {
    log.error('Lady Justice did not start', error);
    process.exit(1);
  });
});

client.on(Events.InteractionCreate, (interaction) => {
  if (interaction.isChatInputCommand()) void route(interaction);
});

client.on(Events.GuildMemberAdd, (member) => {
  if (member.guild.id !== config.discord.guildId) return;
  joined(portsFor(member.guild), member).catch((error: unknown) => log.error(`join of ${member.id} not checked`, error));
});

// A turn can wait out two core-api attempts, then write roles, post and DM.
const DRAIN_MS = 2 * config.backend.timeoutMs + 10_000;

// Takes no new command, lets the turns in hand finish, then leaves Discord.
export async function stop(): Promise<void> {
  accepting = false;
  stopping = true;
  const finish = async (): Promise<void> => {
    await stopExpiry?.();
    await drained();
  };
  await Promise.race([finish(), wait(DRAIN_MS, undefined, { ref: false })]);
  await client.destroy();
}
