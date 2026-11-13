import type { components } from './contract.js';

type Schemas = components['schemas'];

export type TierCategory = Schemas['TierCategory'];
// The suspension ladders; laggers have their own list.
export type Ladder = Exclude<TierCategory, 'lagger'>;
export type FlatType = Schemas['FlatType'];
export const FLAT_TYPES: readonly FlatType[] = ['smurf', 'oversub', 'comp'];
export type TierResult = Schemas['TierResult'];
export type FlatResult = Schemas['FlatResult'];
export type DaysResult = Schemas['DaysResult'];
export type TierRemoved = Schemas['TierRemoved'];
export type SuspensionCleared = Schemas['SuspensionCleared'];
export type DueSuspensions = Schemas['DueSuspensions'];
export type PendingApplied = Schemas['PendingApplied'];
export type SuspensionRecord = Schemas['SuspensionRecord'];
export type Laggers = Schemas['Laggers'];
export type TierMembers = Schemas['TierMembers'];
export type Suspended = Schemas['Suspended'];
export type ErrorDetail = Schemas['ErrorDetail'];
