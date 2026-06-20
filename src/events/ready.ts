import { Events, type Client } from 'discord.js';
import { reconcileOverdueSuspensions, recoverScheduler } from '../services/infraction.service.js';

const OVERDUE_SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export const name = Events.ClientReady;
export const once = true;
export async function execute(client: Client): Promise<void> {
  console.log(`[LJ Bot] Ready! Logged in as ${client.user?.tag}`);

  try {
    await reconcileOverdueSuspensions(client);
  } catch (err: unknown) {
    console.error('[LJ Bot] Overdue reconciliation failed on boot:', err);
  }

  try {
    await recoverScheduler(client);
  } catch (err: unknown) {
    console.error('[LJ Bot] Scheduler recovery failed — active suspensions will not be re-scheduled:', err);
  }

  setInterval(() => {
    reconcileOverdueSuspensions(client).catch((err: unknown) =>
      console.error('[LJ Bot] Periodic overdue reconciliation failed:', err),
    );
  }, OVERDUE_SWEEP_INTERVAL_MS);
}
