import { Events, type Client } from 'discord.js';

export const name = Events.ClientReady;
export const once = true;

export async function execute(client: Client): Promise<void> {
  console.log(`[LJ Bot] Ready! Logged in as ${client.user?.tag}`);
}
