import type { Card, PlayedCard, Rank, Suit } from '../types/card.js';
import { RANK_VALUES, getCardId, getRankValue } from '../types/card.js';
import { SUIT_SYMBOLS, RANK_NAMES, SUIT_NAMES } from '../constants/cards.js';

/**
 * Format a card for display (e.g., "A♠")
 */
export function formatCard(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

/**
 * Format a card with full names (e.g., "Ace of Spades")
 */
export function formatCardLong(card: Card): string {
  return `${RANK_NAMES[card.rank]} of ${SUIT_NAMES[card.suit]}`;
}

/**
 * Sort cards by suit then rank
 */
export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    // First by suit
    const suitOrder: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
    const suitDiff = suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
    if (suitDiff !== 0) return suitDiff;
    // Then by rank (high to low)
    return getRankValue(b.rank) - getRankValue(a.rank);
  });
}

/**
 * Group cards by suit
 */
export function groupBySuit(cards: Card[]): Record<Suit, Card[]> {
  const groups: Record<Suit, Card[]> = {
    hearts: [],
    diamonds: [],
    clubs: [],
    spades: [],
  };
  for (const card of cards) {
    groups[card.suit].push(card);
  }
  // Sort each group by rank
  for (const suit of Object.keys(groups) as Suit[]) {
    groups[suit].sort((a, b) => getRankValue(b.rank) - getRankValue(a.rank));
  }
  return groups;
}

/**
 * Check if two cards are the same
 */
export function cardsEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

/**
 * Find a card in a list
 */
export function findCard(cards: Card[], target: Card): Card | undefined {
  return cards.find((c) => cardsEqual(c, target));
}

/**
 * Remove a card from a list (returns new array)
 */
export function removeCard(cards: Card[], target: Card): Card[] {
  const index = cards.findIndex((c) => cardsEqual(c, target));
  if (index === -1) return cards;
  return [...cards.slice(0, index), ...cards.slice(index + 1)];
}

/**
 * Check if a hand contains a specific suit
 */
export function hasSuit(cards: Card[], suit: Suit): boolean {
  return cards.some((c) => c.suit === suit);
}

/**
 * Get all cards of a specific suit from a hand
 */
export function getCardsOfSuit(cards: Card[], suit: Suit): Card[] {
  return cards.filter((c) => c.suit === suit);
}

/**
 * Check if a rank is odd (3, 5, 7, 9, J, K = odd; 2, 4, 6, 8, 10, Q, A = even)
 * Note: Face cards J=11 (odd), Q=12 (even), K=13 (odd), A=14 (even)
 */
export function isOddRank(rank: Rank): boolean {
  return RANK_VALUES[rank] % 2 === 1;
}

/**
 * Get the highest card of a specific suit from played cards
 */
export function getHighestOfSuit(
  playedCards: PlayedCard[],
  suit: Suit
): PlayedCard | undefined {
  const suitCards = playedCards.filter(
    (pc) => pc.card.suit === suit && !pc.faceDown
  );
  if (suitCards.length === 0) return undefined;
  return suitCards.reduce((highest, current) =>
    getRankValue(current.card.rank) > getRankValue(highest.card.rank)
      ? current
      : highest
  );
}

/**
 * Check if any card in the trick is trump
 */
export function hasTrumpInTrick(
  playedCards: PlayedCard[],
  trumpSuit: Suit
): boolean {
  return playedCards.some((pc) => pc.card.suit === trumpSuit && !pc.faceDown);
}

/**
 * Check if any card in the trick is face-down (discard)
 */
export function hasDiscardInTrick(playedCards: PlayedCard[]): boolean {
  return playedCards.some((pc) => pc.faceDown);
}
