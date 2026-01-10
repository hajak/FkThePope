import type { Card } from '@fkthepope/shared';

/**
 * Simple seeded random number generator (Mulberry32)
 * Used for deterministic shuffling in tests
 */
function createSeededRandom(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle algorithm
 * @param cards - Array of cards to shuffle
 * @param seed - Optional seed for deterministic shuffling (useful for tests)
 * @returns New shuffled array (does not mutate input)
 */
export function shuffle(cards: Card[], seed?: number): Card[] {
  const result = [...cards];
  const random = seed !== undefined ? createSeededRandom(seed) : Math.random;

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }

  return result;
}
