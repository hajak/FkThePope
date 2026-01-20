import type { Card, Suit, PlayerPosition } from '@fkthepope/shared';
import { SUITS, RANKS } from '@fkthepope/shared';
import { shuffle } from '../deck/shuffle.js';

/**
 * Create a standard 52-card deck
 */
function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit: suit as Suit, rank });
    }
  }
  return deck;
}

/**
 * Deal cards for Bridge
 * - Each of 4 players gets 13 cards
 */
export function dealBridge(seed?: number): {
  hands: Record<PlayerPosition, Card[]>;
} {
  const deck = createDeck();
  const shuffled = shuffle(deck, seed);

  const positions: PlayerPosition[] = ['north', 'east', 'south', 'west'];
  const hands: Record<PlayerPosition, Card[]> = {
    north: [],
    east: [],
    south: [],
    west: [],
  };

  // Deal all cards, 13 to each player
  for (let i = 0; i < 52; i++) {
    const position = positions[i % 4]!;
    const card = shuffled[i];
    if (card) {
      hands[position].push(card);
    }
  }

  // Sort hands by suit and rank for display
  for (const pos of positions) {
    hands[pos].sort((a, b) => {
      const suitOrder: Record<Suit, number> = { spades: 4, hearts: 3, diamonds: 2, clubs: 1 };
      const rankOrder: Record<string, number> = {
        'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8,
        '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2,
      };

      if (suitOrder[a.suit] !== suitOrder[b.suit]) {
        return suitOrder[b.suit] - suitOrder[a.suit];
      }
      return (rankOrder[b.rank] ?? 0) - (rankOrder[a.rank] ?? 0);
    });
  }

  return { hands };
}

/**
 * Get the next dealer (rotates clockwise)
 */
export function getNextDealer(currentDealer: PlayerPosition): PlayerPosition {
  const order: PlayerPosition[] = ['north', 'east', 'south', 'west'];
  const index = order.indexOf(currentDealer);
  return order[(index + 1) % 4]!;
}
