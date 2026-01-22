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
 * Result of dealing for Skitgubbe
 */
export interface SkitgubbeDealResult {
  hands: Record<PlayerPosition, Card[]>;
  drawPile: Card[];
}

/**
 * Deal cards for Skitgubbe
 * Each player gets 3 cards in hand
 * Remaining cards form the draw pile (talon)
 */
export function dealSkitgubbe(
  playerPositions: PlayerPosition[],
  seed?: number
): SkitgubbeDealResult {
  const deck = createDeck();
  const shuffled = shuffle(deck, seed);

  const hands: Record<PlayerPosition, Card[]> = {
    north: [],
    east: [],
    south: [],
    west: [],
  };

  let cardIndex = 0;

  // Deal 3 cards to each player, one at a time
  for (let round = 0; round < 3; round++) {
    for (const position of playerPositions) {
      const card = shuffled[cardIndex];
      if (card) {
        hands[position].push(card);
        cardIndex++;
      }
    }
  }

  // Remaining cards form the draw pile
  const drawPile = shuffled.slice(cardIndex);

  return {
    hands,
    drawPile,
  };
}
