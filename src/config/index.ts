import { config as loadEnv } from 'dotenv';
import path from 'node:path';

const env = process.env.NODE_ENV?.trim() || 'development';
if (!['development', 'test', 'production'].includes(env)) throw new Error(`Unsupported NODE_ENV: ${env}`);
loadEnv({ path: path.resolve(`.env.${env}`), override: false, quiet: true });

const SNOWFLAKE = /^\d{17,20}$/;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// A Discord id is checked at startup, so a typo fails the start rather than a command.
function id(name: string): string {
  const value = required(name);
  if (!SNOWFLAKE.test(value)) throw new Error(`${name} is not a Discord id: ${value}`);
  return value;
}

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

export const config = {
  env,
  backend: {
    baseUrl: required('BACKEND_BASE_URL').replace(/\/+$/, ''),
    serviceToken: required('LJ_SERVICE_TOKEN'),
    timeoutMs: positiveInt('REQUEST_TIMEOUT_MS', 10_000),
  },
  discord: {
    token: required('BOT_TOKEN'),
    guildId: id('DISCORD_GUILD_ID'),
  },
  channels: {
    suspended: id('CHANNEL_SUSPENDED_ID'),
    // Where /lookup may also be run.
    botCommands: id('CHANNEL_BOT_COMMANDS_ID'),
  },
  roles: {
    moderator: id('ROLE_MODERATOR'),
    backend: id('ROLE_BACKEND'),
    suspended: id('ROLE_SUSPENDED'),
    // Three lagger strikes give the first and take the second.
    lagger: id('ROLE_LAGGER'),
    host: id('ROLE_HOST'),
  },
  // The roles a suspension takes away and its end gives back.
  movedRoles: [
    id('ROLE_CIV6'),
    id('ROLE_CIV7'),
    id('ROLE_CIV6_NOVICE'),
    id('ROLE_CPL_TOURNAMENT'),
    id('ROLE_CPL_CLOUD'),
    id('ROLE_CPL_NOVICE_MANAGER'),
    id('ROLE_CPL_COACH'),
  ],
} as const;

// A role both taken and given, or listed twice, would move the wrong way.
const given = [config.roles.suspended, config.roles.lagger, config.roles.host];
if (new Set([...config.movedRoles, ...given]).size !== config.movedRoles.length + given.length) {
  throw new Error('ROLE_SUSPENDED, ROLE_LAGGER, ROLE_HOST and the moved roles must be distinct');
}
