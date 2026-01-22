import type { Card, Suit, PlayerPosition } from '@fkthepope/shared';
import type { SkitgubbeState, TrickCard } from './state.js';

/**
 * Rank values for card comparison (Ace high, 2 low)
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
 * Legal moves result for Phase 1 (Collection)
 */
export interface CollectionLegalMoves {
  phase: 'collection';
  canPlayCards: Card[];  // All cards in hand are playable
  canDraw: boolean;       // Can draw from pile instead
}

/**
 * Legal moves result for Phase 2 (Shedding)
 */
export interface SheddingLegalMoves {
  phase: 'shedding';
  playableCards: Card[];  // Cards that can legally be played
  mustPickUp: boolean;    // If no legal play, must pick up
  canLead: boolean;       // Is player leading (any card is fine)
}

/**
 * Check if a card can beat the current pile top in shedding phase
 * No trump in Skitgubbe - must follow suit and beat by rank
 */
export function canBeatPile(
  card: Card,
  pileTopCard: Card | null,
  leadSuit: Suit | null
): boolean {
  // Empty pile - any card works
  if (!pileTopCard || !leadSuit) {
    return true;
  }

  // Must follow suit to beat - if not following suit, can't beat
  if (card.suit !== pileTopCard.suit) {
    return false;
  }

  // Same suit: must be higher to beat
  return getRankValue(card) > getRankValue(pileTopCard);
}

/**
 * Check if player has any cards of the given suit
 */
function hasCardsOfSuit(hand: Card[], suit: Suit): boolean {
  return hand.some(c => c.suit === suit);
}

/**
 * Get legal moves for collection phase (Phase 1)
 * In collection phase, any card can be played, and drawing is allowed
 */
export function getCollectionLegalMoves(
  hand: Card[],
  drawPileCount: number
): CollectionLegalMoves {
  return {
    phase: 'collection',
    canPlayCards: [...hand],  // All cards are playable
    canDraw: drawPileCount > 0,
  };
}

/**
 * Get legal moves for shedding phase (Phase 2)
 * Must follow suit if possible
 * If can't follow suit, can play any card but can't beat
 * If can't beat, must pick up
 */
export function getSheddingLegalMoves(
  hand: Card[],
  pile: Card[],
  currentTrick: { cards: TrickCard[]; leadSuit: Suit } | null
): SheddingLegalMoves {
  // If leading (no cards in trick yet), any card is playable
  if (!currentTrick || currentTrick.cards.length === 0) {
    return {
      phase: 'shedding',
      playableCards: [...hand],
      mustPickUp: false,
      canLead: true,
    };
  }

  const leadSuit = currentTrick.leadSuit;
  const pileTopCard = pile.length > 0 ? pile[pile.length - 1] ?? null : null;

  // Get the highest card in the current trick to determine what we need to beat
  let highestCard = currentTrick.cards[0]?.card;
  if (highestCard) {
    for (const tc of currentTrick.cards) {
      if (canBeatPile(tc.card, highestCard, leadSuit)) {
        highestCard = tc.card;
      }
    }
  }

  const cardToBeat = highestCard || pileTopCard;

  // If we have cards of the lead suit, we must follow suit
  const hasLeadSuit = hasCardsOfSuit(hand, leadSuit);

  let playableCards: Card[] = [];

  if (hasLeadSuit) {
    // Must follow suit - find cards that can beat
    const suitCards = hand.filter(c => c.suit === leadSuit);
    playableCards = suitCards.filter(c =>
      cardToBeat ? canBeatPile(c, cardToBeat, leadSuit) : true
    );

    // If we have suit cards but none can beat, we must still follow suit
    // (and will have to pick up)
    if (playableCards.length === 0) {
      playableCards = suitCards;
    }
  } else {
    // No lead suit - can play any card but can't beat (will have to pick up)
    playableCards = [...hand];
  }

  // Check if any playable card can actually beat
  const canBeat = cardToBeat ?
    playableCards.some(c => canBeatPile(c, cardToBeat, leadSuit)) :
    true;

  return {
    phase: 'shedding',
    playableCards,
    mustPickUp: !canBeat,
    canLead: false,
  };
}

/**
 * Get legal moves for the current player
 */
export function getLegalMoves(state: SkitgubbeState, position: PlayerPosition): CollectionLegalMoves | SheddingLegalMoves | null {
  const player = state.players[position];
  if (!player || player.isOut) return null;
  if (state.currentPlayer !== position) return null;

  if (state.phase === 'collection') {
    return getCollectionLegalMoves(player.hand, state.drawPile.length);
  }

  if (state.phase === 'shedding') {
    return getSheddingLegalMoves(
      player.hand,
      state.pile,
      state.currentTrick
    );
  }

  return null;
}

/**
 * Check if a specific card play is legal in collection phase
 */
export function isLegalCollectionPlay(
  card: Card,
  hand: Card[]
): { legal: boolean; reason?: string } {
  const hasCard = hand.some(c => c.suit === card.suit && c.rank === card.rank);
  if (!hasCard) {
    return { legal: false, reason: 'Card not in hand' };
  }
  return { legal: true };
}

/**
 * Check if a specific card play is legal in shedding phase
 */
export function isLegalSheddingPlay(
  card: Card,
  hand: Card[],
  pile: Card[],
  currentTrick: { cards: TrickCard[]; leadSuit: Suit } | null
): { legal: boolean; reason?: string; mustPickUp?: boolean } {
  const hasCard = hand.some(c => c.suit === card.suit && c.rank === card.rank);
  if (!hasCard) {
    return { legal: false, reason: 'Card not in hand' };
  }

  const legalMoves = getSheddingLegalMoves(hand, pile, currentTrick);

  const isPlayable = legalMoves.playableCards.some(
    c => c.suit === card.suit && c.rank === card.rank
  );

  if (!isPlayable) {
    return { legal: false, reason: 'Must follow suit' };
  }

  // Check if this play will require picking up
  if (currentTrick && currentTrick.cards.length > 0) {
    const leadSuit = currentTrick.leadSuit;
    let highestCard = currentTrick.cards[0]?.card;
    if (highestCard) {
      for (const tc of currentTrick.cards) {
        if (canBeatPile(tc.card, highestCard, leadSuit)) {
          highestCard = tc.card;
        }
      }
    }

    const cardToBeat = highestCard;
    if (cardToBeat && !canBeatPile(card, cardToBeat, leadSuit)) {
      return { legal: true, mustPickUp: true };
    }
  }

  return { legal: true };
}
