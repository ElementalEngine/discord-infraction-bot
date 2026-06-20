import { REST, Routes } from 'discord.js';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config } from './config/index.js';
import type { Command } from './types/global.js';

function isCommand(mod: unknown): mod is Command {
  return (
    typeof mod === 'object' &&
    mod !== null &&
    'data' in (mod as object) &&
    typeof (mod as Record<string, unknown>)['execute'] === 'function'
  );
}

async function loadCommandData(): Promise<unknown[]> {
  const baseDir = fileURLToPath(new URL('./commands', import.meta.url));
  const isTsx = import.meta.url.endsWith('.ts');
  const ext = isTsx ? '.command.ts' : '.command.js';

  let files: string[];
  try {
    const entries = await readdir(baseDir, { recursive: true });
    files = entries.filter((f): f is string => typeof f === 'string' && f.endsWith(ext));
  } catch {
    return [];
  }

  const commands: unknown[] = [];
  for (const file of files) {
    const filePath = join(baseDir, file);
    const mod = await import(pathToFileURL(filePath).href) as unknown;
    if (isCommand(mod)) {
      commands.push((mod as Command).data.toJSON());
    }
  }
  return commands;
}

const commands = await loadCommandData();
const rest = new REST().setToken(config.discord.token);

console.log(`[Deploy] Registering ${commands.length} application command(s)...`);
await rest.put(
  Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
  { body: commands },
);
console.log(`[Deploy] Successfully registered ${commands.length} command(s).`);
