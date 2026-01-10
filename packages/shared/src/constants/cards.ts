import type { Card, Rank, Suit } from '../types/card.js';

/**
 * All suits in the deck
 */
export const SUITS: readonly Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'] as const;

/**
 * All ranks in order from lowest to highest
 */
export const RANKS: readonly Rank[] = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'
] as const;

/**
 * Display names for suits
 */
export const SUIT_NAMES: Record<Suit, string> = {
  hearts: 'Hearts',
  diamonds: 'Diamonds',
  clubs: 'Clubs',
  spades: 'Spades',
};

/**
 * Unicode symbols for suits
 */
export const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '\u2665', // ♥
  diamonds: '\u2666', // ♦
  clubs: '\u2663', // ♣
  spades: '\u2660', // ♠
};

/**
 * Suit colors for UI
 */
export const SUIT_COLORS: Record<Suit, 'red' | 'black'> = {
  hearts: 'red',
  diamonds: 'red',
  clubs: 'black',
  spades: 'black',
};

/**
 * Display names for ranks
 */
export const RANK_NAMES: Record<Rank, string> = {
  '2': 'Two',
  '3': 'Three',
  '4': 'Four',
  '5': 'Five',
  '6': 'Six',
  '7': 'Seven',
  '8': 'Eight',
  '9': 'Nine',
  '10': 'Ten',
  'J': 'Jack',
  'Q': 'Queen',
  'K': 'King',
  'A': 'Ace',
};

/**
 * A complete standard 52-card deck
 */
export function createStandardDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/**
 * Number of cards in a standard deck
 */
export const DECK_SIZE = 52;

/**
 * Number of cards dealt to each player
 */
export const CARDS_PER_PLAYER = 13;

/**
 * Number of players in a game
 */
export const PLAYER_COUNT = 4;

/**
 * Number of tricks per hand
 */
export const TRICKS_PER_HAND = 13;
