import type { components } from './contract.js';

type Schemas = components['schemas'];

export type TierCategory = Schemas['TierCategory'];
export type FlatType = Schemas['FlatType'];
export type TierResult = Schemas['TierResult'];
export type FlatResult = Schemas['FlatResult'];
export type DaysResult = Schemas['DaysResult'];
export type TierRemoved = Schemas['TierRemoved'];
export type SuspensionCleared = Schemas['SuspensionCleared'];
export type DueSuspensions = Schemas['DueSuspensions'];
export type PendingApplied = Schemas['PendingApplied'];
export type ErrorDetail = Schemas['ErrorDetail'];
