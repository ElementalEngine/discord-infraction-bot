import { client, stop } from './client.js';
import { config } from './config/index.js';
import { log } from './utils/log.js';

async function shutdown(signal: string): Promise<void> {
  log.info(`${signal}: shutting down`);
  try {
    await stop();
  } finally {
    process.exit(0);
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => log.error('unhandled rejection', reason));

log.info(`Starting Lady Justice (${config.env})`);
client.login(config.discord.token).catch((error: unknown) => {
  log.error('Lady Justice failed to start', error);
  process.exit(1);
});
