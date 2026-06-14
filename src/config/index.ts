import { config as loadDotenv } from 'dotenv';
import type { LJBotConfig } from './types.js';

loadDotenv();
const nodeEnvForFile = process.env['NODE_ENV'];
if (nodeEnvForFile) {
  loadDotenv({ path: `.env.${nodeEnvForFile}`, override: true });
}

function required(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config: LJBotConfig = {
  nodeEnv:        required('NODE_ENV'),
  discord: {
    token:    required('BOT_TOKEN'),
    clientId: required('BOT_CLIENT_ID'),
    guildId:  required('DISCORD_GUILD_ID'),
    channels: {
      suspendedChannel: required('CHANNEL_SUSPENDED_ID'),
    },
    roles: {
      moderator:       required('ROLE_MODERATOR'),
      cplBackend:      required('ROLE_BACKEND'),
      civ6Rank:        required('ROLE_CIV6'),
      civ7Rank:        required('ROLE_CIV7'),
      civ6Novice:      required('ROLE_CIV6_NOVICE'),
      cplTournament:   required('ROLE_CPL_TOURNAMENT'),
      cplCloud:        required('ROLE_CPL_CLOUD'),
      cplNoviceManager: required('ROLE_CPL_NOVICE_MANAGER'),
      cplCoach:        required('ROLE_CPL_COACH'),
      suspended:       required('ROLE_SUSPENDED'),
    },
  },
  backendBaseUrl:   required('BACKEND_BASE_URL'),
  ljServiceToken:   required('LJ_SERVICE_TOKEN'),
  requestTimeoutMs: Number(optional('REQUEST_TIMEOUT_MS', '10000')),
};
