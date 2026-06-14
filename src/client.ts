import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Command } from './types/global.js';

interface EventModule {
  name: string;
  once?: boolean;
  execute: (...args: unknown[]) => Promise<void>;
}

function isEventModule(mod: unknown): mod is EventModule {
  return (
    typeof mod === 'object' &&
    mod !== null &&
    typeof (mod as Record<string, unknown>)['name'] === 'string' &&
    typeof (mod as Record<string, unknown>)['execute'] === 'function'
  );
}

function isCommand(mod: unknown): mod is Command {
  return (
    typeof mod === 'object' &&
    mod !== null &&
    'data' in (mod as object) &&
    typeof (mod as Record<string, unknown>)['execute'] === 'function'
  );
}

async function loadCommands(client: Client): Promise<void> {
  const baseDir = fileURLToPath(new URL('./commands', import.meta.url));
  const isTsx = import.meta.url.endsWith('.ts');
  const ext = isTsx ? '.command.ts' : '.command.js';

  let files: string[];
  try {
    const entries = await readdir(baseDir, { recursive: true });
    files = entries.filter((f): f is string => typeof f === 'string' && f.endsWith(ext));
  } catch {
    return;
  }

  for (const file of files) {
    const filePath = join(baseDir, file);
    const mod = await import(pathToFileURL(filePath).href) as unknown;
    if (isCommand(mod)) {
      client.commands.set((mod as Command).data.name, mod as Command);
    }
  }
}

async function loadEvents(client: Client): Promise<void> {
  const baseDir = fileURLToPath(new URL('./events', import.meta.url));
  const isTsx = import.meta.url.endsWith('.ts');
  const ext = isTsx ? '.ts' : '.js';

  let files: string[];
  try {
    files = (await readdir(baseDir)).filter(
      (f) => f.endsWith(ext) && !f.endsWith('.d.ts'),
    );
  } catch {
    return;
  }

  for (const file of files) {
    const filePath = join(baseDir, file);
    const mod = await import(pathToFileURL(filePath).href) as unknown;
    if (isEventModule(mod)) {
      if (mod.once === true) {
        client.once(mod.name, (...args) => void mod.execute(...args));
      } else {
        client.on(mod.name, (...args) => void mod.execute(...args));
      }
    }
  }
}

export async function initClient(): Promise<Client> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  client.commands = new Collection<string, Command>();

  await loadCommands(client);
  await loadEvents(client);

  return client;
}
