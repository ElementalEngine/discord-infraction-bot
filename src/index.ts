import { initClient } from './client.js';
import { config } from './config/index.js';

process.on('unhandledRejection', (reason) => {
  console.error('[LJ Bot] Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[LJ Bot] Uncaught exception:', error);
});

const client = await initClient();
await client.login(config.discord.token);

const shutdown = (): void => {
  console.log('[LJ Bot] Shutting down...');
  void client
    .destroy()
    .catch((err: unknown) => console.error('[LJ Bot] Error during shutdown:', err))
    .finally(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
