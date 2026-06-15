import { Events, type Client } from 'discord.js';
import { recoverScheduler } from '../services/infraction.service.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client: Client): Promise<void> {
  console.log(`[LJ Bot] Ready! Logged in as ${client.user?.tag}`);
  try {
    await recoverScheduler(client);
  } catch (err: unknown) {
    console.error('[LJ Bot] Scheduler recovery failed — active suspensions will not be re-scheduled:', err);
  }
}
