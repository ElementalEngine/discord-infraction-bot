import { randomBytes } from 'node:crypto';

import { ApiError, NoAnswer } from '../api/errors.js';

// A rule the staff member broke, said back to them.
export class Refusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Refusal';
  }
}

export function refuse(message: string): never {
  throw new Refusal(message);
}

export const unreachable = (error: unknown): boolean => error instanceof NoAnswer;

// A write whose answer never came may have landed, so staff check before repeating it.
const UNKNOWN = "⚠️ core-api didn't answer, so this may or may not be recorded. Check the member's standing with /lookup before running it again.";

export type Failure = Readonly<{ text: string; ours: boolean }>;

// What staff read when a command did not finish. core-api's refusals are written
// for staff and shown as they are; a fault of ours is logged too.
export function failureOf(error: unknown): Failure {
  if (error instanceof Refusal) return { text: `‼️ ${error.message}`, ours: false };
  if (unreachable(error) || (error instanceof ApiError && !error.error && error.status >= 500)) return { text: UNKNOWN, ours: false };
  if (error instanceof ApiError) {
    const detail = error.error;
    const ref = detail?.correlation_id ? ` (ref ${detail.correlation_id})` : '';
    // 401, 403, 422 and 503 come from core-api's gates, before any write.
    if (!detail || error.status === 401 || error.status === 403 || error.status === 422 || error.status === 503) {
      return { text: `⚠️ core-api refused Lady Justice's request (${detail?.code ?? `HTTP ${error.status}`})${ref}. Tell a developer.`, ours: true };
    }
    if (error.status < 500) return { text: `‼️ ${detail.message}`, ours: false };
    // A database error can follow a write that landed, so this is not known either.
    return { text: `${UNKNOWN}${ref}`, ours: !detail.retryable };
  }
  return { text: `⚠️ Something went wrong before anything was recorded. (ref ${randomBytes(3).toString('hex')})`, ours: true };
}
