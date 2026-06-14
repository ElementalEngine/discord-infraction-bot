import type { LJBotConfig } from './types.js';

export const TIER_CAPS = {
  quit:     6,
  minor:    7,
  moderate: 6,
  major:    4,
  extreme:  2,
} as const;

export const TIER_DURATIONS: Readonly<Record<keyof typeof TIER_CAPS, readonly number[]>> = {
  quit:     [1, 3, 7, 14, 30],
  minor:    [0, 1, 2, 4, 7, 14],
  moderate: [1, 4, 7, 14, 30],
  major:    [7, 14, 30],
  extreme:  [30],
};

export const DECAY_DAYS: Readonly<Record<keyof typeof TIER_CAPS, number>> = {
  quit:     90,
  minor:    90,
  moderate: 90,
  major:    90,
  extreme:  1460,
};

export const FLAT_DAYS = {
  smurf:   30,
  oversub: 3,
  comp:    7,
} as const;

export const ROLES_REMOVED_ON_SUSPENSION: ReadonlyArray<keyof LJBotConfig['discord']['roles']> = [
  'civ6Rank',
  'civ7Rank',
  'civ6Novice',
  'cplTournament',
  'cplCloud',
  'cplNoviceManager',
  'cplCoach',
] as const;
