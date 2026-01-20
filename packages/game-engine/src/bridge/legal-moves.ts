import type { Card, Suit, PlayerPosition } from '@fkthepope/shared';
import type { BridgeState, BridgePlayedCard } from './state.js';

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
 * Get cards of a specific suit from hand
 */
function getCardsOfSuit(hand: Card[], suit: Suit): Card[] {
  return hand.filter(c => c.suit === suit);
}

/**
 * Check if hand has any cards of the given suit
 */
function hasSuit(hand: Card[], suit: Suit): boolean {
  return hand.some(c => c.suit === suit);
}

/**
 * Get legal moves for a player in Bridge
 * - If leading: can play any card
 * - If following: must follow suit if able
 */
export function getBridgeLegalMoves(
  hand: Card[],
  trickCards: BridgePlayedCard[],
  _trumpSuit: Suit | null
): Card[] {
  if (trickCards.length === 0) {
    // Leading: can play any card
    return hand;
  }

  const leadSuit = trickCards[0]!.card.suit;

  // Must follow suit if able
  if (hasSuit(hand, leadSuit)) {
    return getCardsOfSuit(hand, leadSuit);
  }

  // Void in suit: can play any card
  return hand;
}

/**
 * Check if a play is legal in Bridge
 */
export function isLegalBridgePlay(
  card: Card,
  hand: Card[],
  trickCards: BridgePlayedCard[],
  trumpSuit: Suit | null
): { legal: boolean; reason?: string } {
  // Card must be in hand
  const inHand = hand.some(c => c.suit === card.suit && c.rank === card.rank);
  if (!inHand) {
    return { legal: false, reason: 'Card not in hand' };
  }

  // If leading, any card is legal
  if (trickCards.length === 0) {
    return { legal: true };
  }

  const leadSuit = trickCards[0]!.card.suit;

  // Must follow suit if able
  if (hasSuit(hand, leadSuit) && card.suit !== leadSuit) {
    return { legal: false, reason: `Must follow suit (${leadSuit})` };
  }

  return { legal: true };
}

/**
 * Resolve a Bridge trick - determine winner
 */
export function resolveBridgeTrick(
  cards: BridgePlayedCard[],
  trumpSuit: Suit | null
): PlayerPosition {
  if (cards.length !== 4) {
    throw new Error('Bridge trick must have 4 cards');
  }

  const leadSuit = cards[0]!.card.suit;
  let winningCard = cards[0]!;

  for (let i = 1; i < cards.length; i++) {
    const card = cards[i]!;

    // Check if this card beats the current winner
    const winnerIsTrump = trumpSuit && winningCard.card.suit === trumpSuit;
    const cardIsTrump = trumpSuit && card.card.suit === trumpSuit;

    if (cardIsTrump && !winnerIsTrump) {
      // Trump beats non-trump
      winningCard = card;
    } else if (cardIsTrump && winnerIsTrump) {
      // Both trump: higher wins
      if (getRankValue(card.card) > getRankValue(winningCard.card)) {
        winningCard = card;
      }
    } else if (!cardIsTrump && !winnerIsTrump) {
      // Neither trump: must follow lead suit to win
      if (card.card.suit === leadSuit && card.card.suit === winningCard.card.suit) {
        if (getRankValue(card.card) > getRankValue(winningCard.card)) {
          winningCard = card;
        }
      } else if (card.card.suit === leadSuit && winningCard.card.suit !== leadSuit) {
        winningCard = card;
      }
    }
  }

  return winningCard.playedBy;
}

/**
 * Get the next player to play in Bridge
 * In Bridge, declarer plays both their hand and dummy's hand
 */
export function getNextPlayer(
  currentPlayer: PlayerPosition,
  contract: { declarer: PlayerPosition; dummy: PlayerPosition } | null
): PlayerPosition {
  const order: PlayerPosition[] = ['north', 'east', 'south', 'west'];
  const currentIndex = order.indexOf(currentPlayer);
  const nextPosition = order[(currentIndex + 1) % 4]!;

  // If next player is dummy and there's a contract, declarer plays
  if (contract && nextPosition === contract.dummy) {
    return contract.declarer;
  }

  return nextPosition;
}

/**
 * Check who should play a card (handling dummy)
 */
export function getActualPlayer(
  position: PlayerPosition,
  contract: { declarer: PlayerPosition; dummy: PlayerPosition } | null
): PlayerPosition {
  if (contract && position === contract.dummy) {
    return contract.declarer;
  }
  return position;
}
