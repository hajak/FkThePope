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
 * Deal cards for Skitgubbe
 * - Each player gets 3 cards
 * - Remaining cards form the stock
 * - Last card of stock is the trump card (revealed)
 */
export function dealSkitgubbe(
  playerPositions: PlayerPosition[],
  seed?: number
): {
  hands: Record<PlayerPosition, Card[]>;
  stock: Card[];
  trumpCard: Card;
} {
  const deck = createDeck();
  const shuffled = shuffle(deck, seed);

  const hands: Record<PlayerPosition, Card[]> = {
    north: [],
    east: [],
    south: [],
    west: [],
  };

  // Deal 3 cards to each player
  let cardIndex = 0;
  for (let round = 0; round < 3; round++) {
    for (const position of playerPositions) {
      const card = shuffled[cardIndex];
      if (card) {
        hands[position].push(card);
        cardIndex++;
      }
    }
  }

  // Remaining cards form the stock
  const stock = shuffled.slice(cardIndex);

  // Trump card is the bottom card of the stock (placed face up under the stock)
  // We'll put it at index 0 so it's drawn last
  const trumpCard = stock[0]!;

  return {
    hands,
    stock,
    trumpCard,
  };
}
