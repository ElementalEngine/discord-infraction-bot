import type { ErrorDetail } from './types.js';

// core-api's error envelope, `{detail:{error}}` or a bare `{error}`, or null.
// A half-envelope is null too: `retryable` decides a retry and is never guessed.
function parseApiError(body: unknown): ErrorDetail | null {
  if (typeof body !== 'object' || body === null) return null;
  const outer = body as { detail?: unknown; error?: unknown };
  const inner = typeof outer.detail === 'object' && outer.detail !== null ? (outer.detail as { error?: unknown }).error : undefined;
  const raw = inner ?? outer.error;
  if (typeof raw !== 'object' || raw === null) return null;
  const error = raw as Record<string, unknown>;
  if (typeof error.code !== 'string' || typeof error.retryable !== 'boolean') return null;
  return {
    code: error.code,
    message: typeof error.message === 'string' ? error.message : '',
    details: error.details,
    retryable: error.retryable,
    correlation_id: typeof error.correlation_id === 'string' ? error.correlation_id : null,
  };
}

export class ApiError extends Error {
  readonly status: number;
  // Present only when core-api answered in its envelope.
  readonly error: ErrorDetail | null;

  constructor(status: number, body: unknown) {
    const error = parseApiError(body);
    super(error ? `${error.code} (${status})` : `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.error = error;
  }

  get code(): string | undefined {
    return this.error?.code;
  }
}

// No usable answer: none came, it was cut off, or it could not be read. A write
// may have landed, so this is never reported as nothing recorded.
export class NoAnswer extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : 'no usable answer', { cause });
    this.name = 'NoAnswer';
  }
}
