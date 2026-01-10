import { describe, it, expect } from 'vitest';
import { resolveTrick, getTrickWinnerInfo } from './resolve-trick.js';
import type { PlayedCard } from '@fkthepope/shared';

describe('resolveTrick', () => {
  it('should select highest card of lead suit when no trump', () => {
    const trick: PlayedCard[] = [
      { card: { suit: 'hearts', rank: '7' }, playedBy: 'north', faceDown: false, playedAt: 0 },
      { card: { suit: 'hearts', rank: 'K' }, playedBy: 'east', faceDown: false, playedAt: 1 },
      { card: { suit: 'hearts', rank: '3' }, playedBy: 'south', faceDown: false, playedAt: 2 },
      { card: { suit: 'hearts', rank: '9' }, playedBy: 'west', faceDown: false, playedAt: 3 },
    ];

    expect(resolveTrick(trick, 'spades')).toBe('east');
  });

  it('should select highest trump over lead suit', () => {
    const trick: PlayedCard[] = [
      { card: { suit: 'hearts', rank: 'A' }, playedBy: 'north', faceDown: false, playedAt: 0 },
      { card: { suit: 'spades', rank: '2' }, playedBy: 'east', faceDown: false, playedAt: 1 },
      { card: { suit: 'hearts', rank: 'K' }, playedBy: 'south', faceDown: false, playedAt: 2 },
      { card: { suit: 'hearts', rank: 'Q' }, playedBy: 'west', faceDown: false, playedAt: 3 },
    ];

    expect(resolveTrick(trick, 'spades')).toBe('east');
  });

  it('should select highest trump among multiple trump plays', () => {
    const trick: PlayedCard[] = [
      { card: { suit: 'hearts', rank: 'A' }, playedBy: 'north', faceDown: false, playedAt: 0 },
      { card: { suit: 'spades', rank: '5' }, playedBy: 'east', faceDown: false, playedAt: 1 },
      { card: { suit: 'spades', rank: 'J' }, playedBy: 'south', faceDown: false, playedAt: 2 },
      { card: { suit: 'spades', rank: '3' }, playedBy: 'west', faceDown: false, playedAt: 3 },
    ];

    expect(resolveTrick(trick, 'spades')).toBe('south');
  });

  it('should ignore face-down cards (discards)', () => {
    const trick: PlayedCard[] = [
      { card: { suit: 'hearts', rank: '5' }, playedBy: 'north', faceDown: false, playedAt: 0 },
      { card: { suit: 'hearts', rank: 'A' }, playedBy: 'east', faceDown: true, playedAt: 1 }, // Discarded Ace!
      { card: { suit: 'hearts', rank: '7' }, playedBy: 'south', faceDown: false, playedAt: 2 },
      { card: { suit: 'hearts', rank: '6' }, playedBy: 'west', faceDown: false, playedAt: 3 },
    ];

    expect(resolveTrick(trick, 'clubs')).toBe('south');
  });

  it('should handle face-down trump (discarded trump cannot win)', () => {
    const trick: PlayedCard[] = [
      { card: { suit: 'hearts', rank: '5' }, playedBy: 'north', faceDown: false, playedAt: 0 },
      { card: { suit: 'spades', rank: 'A' }, playedBy: 'east', faceDown: true, playedAt: 1 }, // Discarded trump!
      { card: { suit: 'hearts', rank: '7' }, playedBy: 'south', faceDown: false, playedAt: 2 },
      { card: { suit: 'diamonds', rank: 'K' }, playedBy: 'west', faceDown: false, playedAt: 3 },
    ];

    expect(resolveTrick(trick, 'spades')).toBe('south');
  });

  it('should ignore off-suit cards when determining winner', () => {
    const trick: PlayedCard[] = [
      { card: { suit: 'hearts', rank: '5' }, playedBy: 'north', faceDown: false, playedAt: 0 },
      { card: { suit: 'diamonds', rank: 'A' }, playedBy: 'east', faceDown: false, playedAt: 1 }, // Off-suit
      { card: { suit: 'clubs', rank: 'K' }, playedBy: 'south', faceDown: false, playedAt: 2 }, // Off-suit
      { card: { suit: 'hearts', rank: '6' }, playedBy: 'west', faceDown: false, playedAt: 3 },
    ];

    expect(resolveTrick(trick, 'spades')).toBe('west');
  });

  it('should throw error for incomplete tricks', () => {
    const trick: PlayedCard[] = [
      { card: { suit: 'hearts', rank: '5' }, playedBy: 'north', faceDown: false, playedAt: 0 },
      { card: { suit: 'hearts', rank: '7' }, playedBy: 'east', faceDown: false, playedAt: 1 },
    ];

    expect(() => resolveTrick(trick, 'spades')).toThrow();
  });

  it('should handle Ace vs King correctly (Ace is high)', () => {
    const trick: PlayedCard[] = [
      { card: { suit: 'hearts', rank: 'K' }, playedBy: 'north', faceDown: false, playedAt: 0 },
      { card: { suit: 'hearts', rank: 'A' }, playedBy: 'east', faceDown: false, playedAt: 1 },
      { card: { suit: 'hearts', rank: 'Q' }, playedBy: 'south', faceDown: false, playedAt: 2 },
      { card: { suit: 'hearts', rank: 'J' }, playedBy: 'west', faceDown: false, playedAt: 3 },
    ];

    expect(resolveTrick(trick, 'spades')).toBe('east');
  });
});

describe('getTrickWinnerInfo', () => {
  it('should return winner info with trump flag', () => {
    const trick: PlayedCard[] = [
      { card: { suit: 'hearts', rank: 'A' }, playedBy: 'north', faceDown: false, playedAt: 0 },
      { card: { suit: 'spades', rank: '2' }, playedBy: 'east', faceDown: false, playedAt: 1 },
      { card: { suit: 'hearts', rank: 'K' }, playedBy: 'south', faceDown: false, playedAt: 2 },
      { card: { suit: 'hearts', rank: 'Q' }, playedBy: 'west', faceDown: false, playedAt: 3 },
    ];

    const info = getTrickWinnerInfo(trick, 'spades');
    expect(info.winner).toBe('east');
    expect(info.wonWithTrump).toBe(true);
    expect(info.winningCard.card.rank).toBe('2');
  });

  it('should indicate non-trump win correctly', () => {
    const trick: PlayedCard[] = [
      { card: { suit: 'hearts', rank: 'A' }, playedBy: 'north', faceDown: false, playedAt: 0 },
      { card: { suit: 'hearts', rank: '2' }, playedBy: 'east', faceDown: false, playedAt: 1 },
      { card: { suit: 'hearts', rank: 'K' }, playedBy: 'south', faceDown: false, playedAt: 2 },
      { card: { suit: 'hearts', rank: 'Q' }, playedBy: 'west', faceDown: false, playedAt: 3 },
    ];

    const info = getTrickWinnerInfo(trick, 'spades');
    expect(info.winner).toBe('north');
    expect(info.wonWithTrump).toBe(false);
  });
});
