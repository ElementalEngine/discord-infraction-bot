import { config } from '../config/index.js';
import { ApiError } from './errors.js';
import type {
  ActiveSuspension,
  FlatSuspensionResponse,
  FlatType,
  ModifyDaysResponse,
  PendingSuspensionResponse,
  RemoveTierResponse,
  SuspensionRecordResponse,
  TierCategory,
  TierInfractionResponse,
} from './types.js';

const BASE = config.backendBaseUrl.replace(/\/$/, '');

interface ErrorBody {
  error?: {
    code?: string;
    retryable?: boolean;
  };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.ljServiceToken}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });

  if (!response.ok) {
    let detail: ErrorBody = {};
    try {
      detail = (await response.json()) as ErrorBody;
    } catch {
      // ignore parse failures on error bodies
    }
    throw new ApiError(
      response.status,
      detail.error?.code ?? 'UNKNOWN',
      detail.error?.retryable ?? false,
    );
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return (await response.json()) as unknown as T;
}

export const api = {
  recordTierInfraction(
    discordId: string,
    category: TierCategory,
    reason: string | null,
  ): Promise<TierInfractionResponse> {
    return request<TierInfractionResponse>(
      'POST',
      `/api/v1/infractions/${discordId}/tier/${category}`,
      { reason },
    );
  },

  recordFlatSuspension(
    discordId: string,
    type: FlatType,
    reason: string | null,
  ): Promise<FlatSuspensionResponse> {
    return request<FlatSuspensionResponse>(
      'POST',
      `/api/v1/infractions/${discordId}/flat/${type}`,
      { reason },
    );
  },

  addDays(discordId: string, days: number): Promise<ModifyDaysResponse> {
    return request<ModifyDaysResponse>(
      'POST',
      `/api/v1/infractions/${discordId}/add-days`,
      { days },
    );
  },

  removeDays(discordId: string, days: number): Promise<ModifyDaysResponse> {
    return request<ModifyDaysResponse>(
      'POST',
      `/api/v1/infractions/${discordId}/remove-days`,
      { days },
    );
  },

  removeTier(discordId: string, category: TierCategory): Promise<RemoveTierResponse> {
    return request<RemoveTierResponse>(
      'POST',
      `/api/v1/infractions/${discordId}/remove-tier`,
      { category },
    );
  },

  unsuspend(discordId: string): Promise<void> {
    return request<void>('POST', `/api/v1/infractions/${discordId}/unsuspend`);
  },

  getRecord(discordId: string): Promise<SuspensionRecordResponse> {
    return request<SuspensionRecordResponse>('GET', `/api/v1/infractions/${discordId}`);
  },

  getActiveSuspensions(): Promise<ActiveSuspension[]> {
    return request<ActiveSuspension[]>('GET', '/api/v1/infractions/active');
  },

  getPendingSuspension(discordId: string): Promise<PendingSuspensionResponse | null> {
    return request<PendingSuspensionResponse | null>(
      'GET',
      `/api/v1/infractions/${discordId}/pending`,
    );
  },

  createPendingSuspension(
    discordId: string,
    punishmentType: string,
    reason: string | null,
  ): Promise<void> {
    return request<void>('POST', `/api/v1/infractions/${discordId}/pending`, {
      punishment_type: punishmentType,
      reason,
    });
  },

  deletePendingSuspension(discordId: string): Promise<void> {
    return request<void>('DELETE', `/api/v1/infractions/${discordId}/pending`);
  },
};
