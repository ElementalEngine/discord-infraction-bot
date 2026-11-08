import { config } from '../config/index.js';
import { ApiError, NoAnswer } from './errors.js';
import type { DaysResult, DueSuspensions, FlatResult, FlatType, Laggers, PendingApplied, Suspended, SuspensionCleared, SuspensionRecord, TierCategory, TierRemoved, TierResult } from './types.js';

// The retry policy lives here and nowhere else: no call site chooses.
const ATTEMPTS = 2;
const BACKOFF_MS = 250;

type Call = Readonly<{
  method: 'GET' | 'POST' | 'PUT';
  parts: readonly string[];
  body?: unknown;
  actor?: string;
  // A repeat changes nothing, so an answer lost on the way may be asked for again.
  idempotent?: boolean;
}>;

// core-api's retryable flag decides a second attempt on any method. No answer
// may hide a write that landed, so then only a read or a repeatable write goes again.
function shouldRetry(error: unknown, call: Call): boolean {
  if (error instanceof ApiError && error.error) return error.error.retryable === true;
  if (error instanceof ApiError && error.status < 500) return false;
  return call.method === 'GET' || call.idempotent === true;
}

// A body that is not JSON, such as a proxy's error page, is undefined; no body is null.
function parseJson(text: string): unknown {
  try {
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return undefined;
  }
}

export function createApi(
  base: string = config.backend.baseUrl,
  token: string = config.backend.serviceToken,
  fetcher: typeof fetch = fetch,
  timeoutMs: number = config.backend.timeoutMs,
) {
  async function call<T>(c: Call): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json', authorization: `Bearer ${token}` };
    if (c.actor) headers['x-actor-discord-id'] = c.actor;
    if (c.body !== undefined) headers['content-type'] = 'application/json';
    const url = `${base}/api/v2/infractions/${c.parts.map(encodeURIComponent).join('/')}`;
    for (let attempt = 1; ; attempt++) {
      try {
        return await once<T>(url, c, headers);
      } catch (error) {
        if (attempt >= ATTEMPTS || !shouldRetry(error, c)) throw error;
        await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS * (1 + Math.random())));
      }
    }
  }

  async function once<T>(url: string, c: Call, headers: Record<string, string>): Promise<T> {
    let res: Response;
    let text: string;
    try {
      // The signal covers reading the body too.
      res = await fetcher(url, { method: c.method, headers, ...(c.body === undefined ? {} : { body: JSON.stringify(c.body) }), signal: AbortSignal.timeout(timeoutMs) });
      text = await res.text();
    } catch (error) {
      throw new NoAnswer(error);
    }
    const parsed = parseJson(text);
    if (res.status === 204 && res.ok) return undefined as T;
    if (!res.ok) throw new ApiError(res.status, parsed);
    // A success with no readable body may still have been applied.
    if (parsed === undefined || parsed === null) throw new NoAnswer(new Error(`HTTP ${res.status} with no readable body`));
    return parsed as T;
  }

  return {
    due: () => call<DueSuspensions>({ method: 'GET', parts: ['due'] }),
    record: (id: string) => call<SuspensionRecord>({ method: 'GET', parts: [id] }),
    laggers: () => call<Laggers>({ method: 'GET', parts: ['laggers'] }),
    suspended: () => call<Suspended>({ method: 'GET', parts: ['suspended'] }),
    tier: (id: string, category: TierCategory, actor: string, reason: string | null, roles: readonly string[]) =>
      call<TierResult>({ method: 'POST', parts: [id, 'tier', category], actor, body: { reason, suspended_roles: roles } }),
    flat: (id: string, type: FlatType, actor: string, reason: string | null, roles: readonly string[]) =>
      call<FlatResult>({ method: 'POST', parts: [id, 'flat', type], actor, body: { reason, suspended_roles: roles } }),
    days: (id: string, days: number, actor: string) => call<DaysResult>({ method: 'POST', parts: [id, 'days'], actor, body: { days } }),
    removeTier: (id: string, category: TierCategory, actor: string) =>
      call<TierRemoved>({ method: 'POST', parts: [id, 'remove-tier'], actor, body: { category } }),
    unsuspend: (id: string, actor: string, reason: string) =>
      call<SuspensionCleared>({ method: 'POST', parts: [id, 'unsuspend'], actor, body: { reason }, idempotent: true }),
    expire: (id: string) => call<SuspensionCleared>({ method: 'POST', parts: [id, 'expire'], idempotent: true }),
    setPending: (id: string, punishment: TierCategory | FlatType, actor: string, reason: string | null) =>
      call<void>({ method: 'PUT', parts: [id, 'pending'], actor, body: { punishment_type: punishment, reason }, idempotent: true }),
    applyPending: (id: string, roles: readonly string[]) =>
      call<PendingApplied>({ method: 'POST', parts: [id, 'pending', 'apply'], body: { suspended_roles: roles }, idempotent: true }),
  } as const;
}

export type Api = ReturnType<typeof createApi>;

export const api = createApi();
