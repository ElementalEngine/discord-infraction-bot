import { inspect } from 'node:util';

type Level = 'info' | 'warn' | 'error';

// journald adds its own timestamp, so a line carries only its level and text.
function emit(level: Level, args: unknown[]): void {
  const text = args.map((arg) => (typeof arg === 'string' ? arg : arg instanceof Error ? (arg.stack ?? arg.message) : inspect(arg, { depth: 4, breakLength: Infinity })));
  (level === 'info' ? process.stdout : process.stderr).write(`${level.toUpperCase().padEnd(5)} ${text.join(' ')}\n`);
}

export const log = {
  info: (...args: unknown[]): void => emit('info', args),
  warn: (...args: unknown[]): void => emit('warn', args),
  error: (...args: unknown[]): void => emit('error', args),
} as const;
