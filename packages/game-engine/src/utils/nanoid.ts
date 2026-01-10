import { randomBytes } from 'node:crypto';

/**
 * Simple nanoid-like ID generator
 * Generates URL-safe unique IDs
 */
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function nanoid(size = 21): string {
  const bytes = randomBytes(size);
  let id = '';
  for (let i = 0; i < size; i++) {
    id += alphabet[bytes[i]! % alphabet.length];
  }
  return id;
}

/**
 * Generate a rule ID
 */
export function ruleId(): string {
  return `rule_${nanoid(12)}`;
}

/**
 * Generate a game ID
 */
export function gameId(): string {
  return `game_${nanoid(12)}`;
}

/**
 * Generate a player ID
 */
export function playerId(): string {
  return `player_${nanoid(12)}`;
}
