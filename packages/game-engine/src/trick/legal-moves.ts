import type { Card, Suit, PlayedCard, PlayerPosition } from '@fkthepope/shared';
import { hasSuit, getCardsOfSuit, isTrump } from '@fkthepope/shared';
import type { LegalMove } from '@fkthepope/shared';

/**
 * Determine what cards a player can legally play
 *
 * Rules:
 * 1. If leading (no cards in trick), can play any card face-up
 * 2. If suit led and player has that suit, must follow suit (face-up only)
 * 3. If player doesn't have suit led:
 *    - Can play trump face-up
 *    - Can play any non-trump card face-down (discard)
 *    - Can play trump face-down (weird but legal)
 */
export function getLegalMoves(
  hand: Card[],
  trickCards: PlayedCard[],
  trumpSuit: Suit
): LegalMove[] {
  // Leading: can play anything face-up
  if (trickCards.length === 0) {
    return hand.map((card) => ({
      card,
      canPlayFaceUp: true,
      canPlayFaceDown: false, // Can't discard when leading
    }));
  }

  // Get suit led (from first card, even if face-down the suit is known to the system)
  const leadCard = trickCards[0]!;
  const leadSuit = leadCard.card.suit;

  // If player has the lead suit, must follow suit
  if (hasSuit(hand, leadSuit)) {
    const suitCards = getCardsOfSuit(hand, leadSuit);
    return suitCards.map((card) => ({
      card,
      canPlayFaceUp: true,
      canPlayFaceDown: false, // Must play face-up when following suit
    }));
  }

  // Player is void in lead suit - can play trump or discard
  return hand.map((card) => ({
    card,
    canPlayFaceUp: true, // Can always play face-up (trump or off-suit)
    canPlayFaceDown: true, // Can discard any card when void
  }));
}

/**
 * Check if a specific play is legal
 */
export function isLegalPlay(
  card: Card,
  faceDown: boolean,
  hand: Card[],
  trickCards: PlayedCard[],
  trumpSuit: Suit
): { legal: boolean; reason?: string } {
  // Card must be in hand
  const inHand = hand.some(
    (c) => c.suit === card.suit && c.rank === card.rank
  );
  if (!inHand) {
    return { legal: false, reason: 'Card is not in your hand' };
  }

  // Leading: can play anything face-up, but not face-down
  if (trickCards.length === 0) {
    if (faceDown) {
      return { legal: false, reason: 'Cannot discard when leading a trick' };
    }
    return { legal: true };
  }

  const leadSuit = trickCards[0]!.card.suit;

  // If following suit
  if (hasSuit(hand, leadSuit)) {
    if (card.suit !== leadSuit) {
      return {
        legal: false,
        reason: `Must follow suit (${leadSuit}) when you have cards of that suit`,
      };
    }
    if (faceDown) {
      return {
        legal: false,
        reason: 'Cannot discard when following suit',
      };
    }
    return { legal: true };
  }

  // Void in lead suit - anything goes
  return { legal: true };
}

/**
 * Get suggested alternative moves when a play is illegal
 */
export function getSuggestedMoves(
  hand: Card[],
  trickCards: PlayedCard[],
  trumpSuit: Suit
): Card[] {
  const legalMoves = getLegalMoves(hand, trickCards, trumpSuit);
  return legalMoves.map((m) => m.card);
}
