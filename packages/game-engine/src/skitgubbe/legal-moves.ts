import type { Card, Suit } from '@fkthepope/shared';
import type { SkitgubbeState, SkitgubbePlayedCard } from './state.js';

/**
 * Rank values for card comparison
 */
const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

/**
 * Get numeric value of a card rank
 */
export function getRankValue(card: Card): number {
  return RANK_VALUES[card.rank] ?? 0;
}

/**
 * Compare two cards (for trick resolution)
 * Returns positive if card1 wins, negative if card2 wins
 */
export function compareCards(card1: Card, card2: Card, trumpSuit: Suit | null): number {
  const isTrump1 = card1.suit === trumpSuit;
  const isTrump2 = card2.suit === trumpSuit;

  // Trump beats non-trump
  if (isTrump1 && !isTrump2) return 1;
  if (!isTrump1 && isTrump2) return -1;

  // Same suit or both trump: compare ranks
  if (card1.suit === card2.suit) {
    return getRankValue(card1) - getRankValue(card2);
  }

  // Different suits (non-trump): first card wins
  return 1;
}

/**
 * Phase 1 legal moves
 * - Leading: Can play any card
 * - Following: Can play any card (no suit restrictions in Skitgubbe)
 */
export function getPhase1LegalMoves(hand: Card[]): Card[] {
  return hand;
}

/**
 * Check if a play is legal in Phase 1
 */
export function isLegalPhase1Play(
  card: Card,
  hand: Card[]
): { legal: boolean; reason?: string } {
  const inHand = hand.some(c => c.suit === card.suit && c.rank === card.rank);
  if (!inHand) {
    return { legal: false, reason: 'Card not in hand' };
  }
  return { legal: true };
}

/**
 * Phase 2 legal moves
 * - Must beat the top card of the pile (higher same suit or trump)
 * - Or can pick up the pile
 */
export function getPhase2LegalMoves(
  hand: Card[],
  pileTopCard: Card | null,
  trumpSuit: Suit
): { playableCards: Card[]; canPickUp: boolean } {
  if (!pileTopCard) {
    // Empty pile: can play any card
    return { playableCards: hand, canPickUp: false };
  }

  const playableCards = hand.filter(card => canBeatCard(card, pileTopCard, trumpSuit));

  return {
    playableCards,
    canPickUp: true, // Can always pick up the pile if can't (or don't want to) beat
  };
}

/**
 * Check if one card can beat another
 */
export function canBeatCard(playCard: Card, targetCard: Card, trumpSuit: Suit): boolean {
  // Trump beats non-trump
  if (playCard.suit === trumpSuit && targetCard.suit !== trumpSuit) {
    return true;
  }

  // Same suit: must be higher
  if (playCard.suit === targetCard.suit) {
    return getRankValue(playCard) > getRankValue(targetCard);
  }

  // Different non-trump suits: cannot beat
  return false;
}

/**
 * Check if a play is legal in Phase 2
 */
export function isLegalPhase2Play(
  card: Card,
  hand: Card[],
  pileTopCard: Card | null,
  trumpSuit: Suit
): { legal: boolean; reason?: string } {
  const inHand = hand.some(c => c.suit === card.suit && c.rank === card.rank);
  if (!inHand) {
    return { legal: false, reason: 'Card not in hand' };
  }

  if (!pileTopCard) {
    return { legal: true };
  }

  if (!canBeatCard(card, pileTopCard, trumpSuit)) {
    return { legal: false, reason: `Cannot beat ${pileTopCard.rank} of ${pileTopCard.suit}` };
  }

  return { legal: true };
}

/**
 * Resolve Phase 1 trick - determine winner
 */
export function resolvePhase1Trick(
  cards: SkitgubbePlayedCard[],
  trumpSuit: Suit | null
): SkitgubbePlayedCard['playedBy'] {
  if (cards.length !== 2) {
    throw new Error('Phase 1 trick must have exactly 2 cards');
  }

  const [first, second] = cards;
  const comparison = compareCards(first!.card, second!.card, trumpSuit);

  return comparison >= 0 ? first!.playedBy : second!.playedBy;
}
