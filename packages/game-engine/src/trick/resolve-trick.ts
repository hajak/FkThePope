import type { PlayedCard, PlayerPosition, Suit } from '@fkthepope/shared';
import { getRankValue } from '@fkthepope/shared';

/**
 * Determine the winner of a completed trick
 *
 * Rules:
 * 1. Face-down cards (discards) cannot win
 * 2. If any trump cards were played face-up, highest trump wins
 * 3. Otherwise, highest card of suit led wins
 *
 * @param trickCards - The 4 cards played in the trick (in play order)
 * @param trumpSuit - The trump suit for this hand
 * @returns The position of the winning player
 */
export function resolveTrick(
  trickCards: PlayedCard[],
  trumpSuit: Suit
): PlayerPosition {
  if (trickCards.length !== 4) {
    throw new Error(`Trick must have exactly 4 cards, got ${trickCards.length}`);
  }

  const leadSuit = trickCards[0]!.card.suit;

  // Filter out face-down cards (discards can't win)
  const eligibleCards = trickCards.filter((pc) => !pc.faceDown);

  if (eligibleCards.length === 0) {
    // All cards face-down? Shouldn't happen in normal play, but leader wins
    return trickCards[0]!.playedBy;
  }

  // Check for trump cards
  const trumpCards = eligibleCards.filter((pc) => pc.card.suit === trumpSuit);

  if (trumpCards.length > 0) {
    // Highest trump wins
    const winner = trumpCards.reduce((highest, current) =>
      getRankValue(current.card.rank) > getRankValue(highest.card.rank)
        ? current
        : highest
    );
    return winner.playedBy;
  }

  // No trump - highest of lead suit wins
  const leadSuitCards = eligibleCards.filter((pc) => pc.card.suit === leadSuit);

  if (leadSuitCards.length === 0) {
    // No one followed suit and no trump? First player wins (shouldn't happen)
    return trickCards[0]!.playedBy;
  }

  const winner = leadSuitCards.reduce((highest, current) =>
    getRankValue(current.card.rank) > getRankValue(highest.card.rank)
      ? current
      : highest
  );

  return winner.playedBy;
}

/**
 * Get information about the winning card in a trick
 */
export interface TrickWinnerInfo {
  winner: PlayerPosition;
  winningCard: PlayedCard;
  wonWithTrump: boolean;
}

export function getTrickWinnerInfo(
  trickCards: PlayedCard[],
  trumpSuit: Suit
): TrickWinnerInfo {
  const winner = resolveTrick(trickCards, trumpSuit);
  const winningCard = trickCards.find((pc) => pc.playedBy === winner)!;
  const wonWithTrump = winningCard.card.suit === trumpSuit && !winningCard.faceDown;

  return {
    winner,
    winningCard,
    wonWithTrump,
  };
}
