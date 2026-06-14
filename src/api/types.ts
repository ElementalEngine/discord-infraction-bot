export type TierCategory = 'quit' | 'minor' | 'moderate' | 'major' | 'extreme';
export type FlatType = 'smurf' | 'oversub' | 'comp';

export interface TierInfractionResponse {
  discord_id: string;
  category: TierCategory;
  tier: number;
  days_added: number;
  ends: string | null;
  suspended: boolean;
  is_ban_threshold: boolean;
  is_warning_only: boolean;
  active_category: TierCategory | null;
}

export interface FlatSuspensionResponse {
  discord_id: string;
  type: FlatType;
  days_added: number;
  ends: string;
  suspended: boolean;
}

export interface ModifyDaysResponse {
  discord_id: string;
  days_delta: number;
  new_ends: string;
}

export interface RemoveTierResponse {
  discord_id: string;
  category: TierCategory;
  new_tier: number;
  new_decays: string | null;
  was_changed: boolean;
}

export interface SuspensionRecordResponse {
  discord_id: string;
  suspended: boolean;
  ends: string | null;
  suspended_roles: string[];
  active_category: TierCategory | null;
}

export interface ActiveSuspension {
  discord_id: string;
  ends: string;
}

export interface PendingSuspensionResponse {
  discord_id: string;
  punishment_type: string;
  reason: string | null;
}
