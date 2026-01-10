import { describe, it, expect } from 'vitest';
import { shuffle } from './shuffle.js';
import { createStandardDeck } from '@fkthepope/shared';

describe('shuffle', () => {
  it('should return all 52 cards', () => {
    const deck = createStandardDeck();
    const shuffled = shuffle(deck);
    expect(shuffled.length).toBe(52);
  });

  it('should not mutate the original deck', () => {
    const deck = createStandardDeck();
    const original = [...deck];
    shuffle(deck);
    expect(deck).toEqual(original);
  });

  it('should contain all original cards', () => {
    const deck = createStandardDeck();
    const shuffled = shuffle(deck);

    // Check each card appears exactly once
    const cardSet = new Set(shuffled.map((c) => `${c.rank}_${c.suit}`));
    expect(cardSet.size).toBe(52);
  });

  it('should produce deterministic results with seed', () => {
    const deck = createStandardDeck();
    const shuffled1 = shuffle(deck, 12345);
    const shuffled2 = shuffle(deck, 12345);
    expect(shuffled1).toEqual(shuffled2);
  });

  it('should produce different results with different seeds', () => {
    const deck = createStandardDeck();
    const shuffled1 = shuffle(deck, 12345);
    const shuffled2 = shuffle(deck, 54321);
    expect(shuffled1).not.toEqual(shuffled2);
  });

  it('should produce different results without seed (statistical)', () => {
    const deck = createStandardDeck();
    const shuffled1 = shuffle(deck);
    const shuffled2 = shuffle(deck);
    // Very unlikely to be identical
    const matches = shuffled1.filter(
      (c, i) => c.suit === shuffled2[i]?.suit && c.rank === shuffled2[i]?.rank
    );
    expect(matches.length).toBeLessThan(52);
  });
});
