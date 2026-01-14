import type { PlayerPosition } from '../types/card.js';

/**
 * Player positions in clockwise order
 */
export const PLAYER_POSITIONS: readonly PlayerPosition[] = [
  'north',
  'east',
  'south',
  'west',
] as const;

/**
 * Display names for positions
 */
export const POSITION_NAMES: Record<PlayerPosition, string> = {
  north: 'North',
  east: 'East',
  south: 'South',
  west: 'West',
};

/**
 * Old lady names for bots
 */
export const OLD_LADY_NAMES = [
  'Ethel', 'Mildred', 'Gertrude', 'Edna', 'Beatrice',
  'Agnes', 'Blanche', 'Gladys', 'Edith', 'Harriet',
  'Myrtle', 'Bertha', 'Doris', 'Hazel', 'Irene',
  'Opal', 'Pearl', 'Viola', 'Eunice', 'Erma',
  'Lucille', 'Esther', 'Wilma', 'Loretta', 'Norma',
  'Dolores', 'Phyllis', 'Vivian', 'Thelma', 'Wanda',
] as const;

/**
 * Get a random bot name from the old lady names
 */
export function getRandomBotName(): string {
  const index = Math.floor(Math.random() * OLD_LADY_NAMES.length);
  return OLD_LADY_NAMES[index] ?? 'Ethel';
}

/**
 * Time limits in milliseconds
 */
export const TIME_LIMITS = {
  /** Time to play a card */
  turnTimeout: 60_000,
  /** Time to create a rule */
  ruleCreationTimeout: 120_000,
  /** Time to show trick result before clearing */
  trickResultDelay: 2_000,
  /** Time to show hand result before next hand */
  handResultDelay: 5_000,
  /** Reconnection grace period */
  reconnectionTimeout: 30_000,
} as const;

/**
 * Game configuration defaults
 */
export const GAME_DEFAULTS = {
  /** Maximum number of custom rules allowed */
  maxRules: 50,
  /** Whether to use random trump or fixed */
  randomTrump: true,
  /** Default fixed trump suit if not random */
  fixedTrumpSuit: 'spades' as const,
} as const;
