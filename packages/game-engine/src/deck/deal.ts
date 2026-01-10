import type { Card, PlayerPosition, Suit } from '@fkthepope/shared';
import { createStandardDeck, SUITS, PLAYER_POSITIONS, CARDS_PER_PLAYER } from '@fkthepope/shared';
import { shuffle } from './shuffle.js';

/**
 * Result of dealing cards
 */
export interface DealResult {
  hands: Record<PlayerPosition, Card[]>;
  trumpSuit: Suit;
}

/**
 * Deal cards to all players
 * @param seed - Optional seed for deterministic shuffling
 * @param forceTrump - Optional forced trump suit (for dev mode)
 * @returns Dealt hands and trump suit
 */
export function deal(seed?: number, forceTrump?: Suit): DealResult {
  const deck = createStandardDeck();
  const shuffled = shuffle(deck, seed);

  const hands: Record<PlayerPosition, Card[]> = {
    north: [],
    east: [],
    south: [],
    west: [],
  };

  // Deal 13 cards to each player
  for (let i = 0; i < shuffled.length; i++) {
    const position = PLAYER_POSITIONS[i % 4]!;
    hands[position].push(shuffled[i]!);
  }

  // Determine trump suit
  const trumpSuit = forceTrump ?? selectRandomTrump(seed);

  return { hands, trumpSuit };
}

/**
 * Select a random trump suit
 * @param seed - Optional seed for deterministic selection
 */
function selectRandomTrump(seed?: number): Suit {
  if (seed !== undefined) {
    // Use a simple hash of the seed to pick trump
    const index = Math.abs(seed * 2654435761) % 4;
    return SUITS[index]!;
  }
  // Use current time + random for better entropy
  const randomIndex = Math.floor((Math.random() * Date.now()) % 4);
  return SUITS[randomIndex]!;
}

/**
 * Validate that a deal is correct
 * Used for debugging and testing
 */
export function validateDeal(result: DealResult): boolean {
  const allCards: Card[] = [];

  for (const position of PLAYER_POSITIONS) {
    const hand = result.hands[position];
    if (hand.length !== CARDS_PER_PLAYER) {
      return false;
    }
    allCards.push(...hand);
  }

  // Should have exactly 52 unique cards
  if (allCards.length !== 52) {
    return false;
  }

  // Check for duplicates
  const seen = new Set<string>();
  for (const card of allCards) {
    const key = `${card.rank}_${card.suit}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
  }

  return true;
}
