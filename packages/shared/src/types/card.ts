/**
 * Card types and utilities for the game
 */

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

/**
 * A card that has been played to a trick
 */
export interface PlayedCard {
  card: Card;
  playedBy: PlayerPosition;
  faceDown: boolean; // True if discarded (can't win trick)
  playedAt: number; // Order in trick (0-3)
}

/**
 * Player positions around the table
 */
export type PlayerPosition = 'north' | 'east' | 'south' | 'west';

/**
 * Unique identifier for a card, e.g., "A_spades"
 */
export type CardId = `${Rank}_${Suit}`;

/**
 * Numeric values for card ranks (for comparison)
 */
export const RANK_VALUES: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  'J': 11,
  'Q': 12,
  'K': 13,
  'A': 14,
};

/**
 * Get the numeric value of a card's rank
 */
export function getRankValue(rank: Rank): number {
  return RANK_VALUES[rank];
}

/**
 * Generate a unique ID for a card
 */
export function getCardId(card: Card): CardId {
  return `${card.rank}_${card.suit}`;
}

/**
 * Parse a card ID back into a Card object
 */
export function parseCardId(id: CardId): Card {
  const [rank, suit] = id.split('_') as [Rank, Suit];
  return { rank, suit };
}

/**
 * Check if a card is a trump card
 */
export function isTrump(card: Card, trumpSuit: Suit): boolean {
  return card.suit === trumpSuit;
}

/**
 * Compare two cards within the same suit (higher value wins)
 * Returns positive if a > b, negative if a < b, 0 if equal
 */
export function compareRanks(a: Rank, b: Rank): number {
  return RANK_VALUES[a] - RANK_VALUES[b];
}
