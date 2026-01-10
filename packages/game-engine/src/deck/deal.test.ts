import { describe, it, expect } from 'vitest';
import { deal, validateDeal } from './deal.js';
import { PLAYER_POSITIONS } from '@fkthepope/shared';

describe('deal', () => {
  it('should deal 13 cards to each player', () => {
    const result = deal();
    for (const pos of PLAYER_POSITIONS) {
      expect(result.hands[pos].length).toBe(13);
    }
  });

  it('should deal all 52 unique cards', () => {
    const result = deal();
    expect(validateDeal(result)).toBe(true);
  });

  it('should select a valid trump suit', () => {
    const result = deal();
    expect(['hearts', 'diamonds', 'clubs', 'spades']).toContain(result.trumpSuit);
  });

  it('should produce deterministic results with seed', () => {
    const result1 = deal(42);
    const result2 = deal(42);

    for (const pos of PLAYER_POSITIONS) {
      expect(result1.hands[pos]).toEqual(result2.hands[pos]);
    }
    expect(result1.trumpSuit).toBe(result2.trumpSuit);
  });

  it('should use forced trump when provided', () => {
    const result = deal(undefined, 'hearts');
    expect(result.trumpSuit).toBe('hearts');
  });

  it('should produce different hands with different seeds', () => {
    const result1 = deal(1);
    const result2 = deal(2);
    expect(result1.hands.north).not.toEqual(result2.hands.north);
  });
});

describe('validateDeal', () => {
  it('should return true for valid deals', () => {
    const result = deal(12345);
    expect(validateDeal(result)).toBe(true);
  });

  it('should return false for invalid card count', () => {
    const result = deal();
    result.hands.north.pop(); // Remove a card
    expect(validateDeal(result)).toBe(false);
  });

  it('should return false for duplicate cards', () => {
    const result = deal();
    result.hands.north[0] = result.hands.east[0]!; // Duplicate
    expect(validateDeal(result)).toBe(false);
  });
});
