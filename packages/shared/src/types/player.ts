import type { Card, PlayerPosition } from './card.js';

/**
 * Full player state (server-side)
 */
export interface Player {
  id: string;
  name: string;
  position: PlayerPosition;
  hand: Card[];
  tricksWon: number;
  isBot: boolean;
  isConnected: boolean;
}

/**
 * What other players can see about a player
 */
export interface PlayerView {
  id: string;
  name: string;
  position: PlayerPosition;
  cardCount: number; // Hidden: actual cards
  tricksWon: number;
  isCurrentTurn: boolean;
  isBot: boolean;
  isConnected: boolean;
}

/**
 * Create a player view from full player state
 */
export function toPlayerView(player: Player, isCurrentTurn: boolean): PlayerView {
  return {
    id: player.id,
    name: player.name,
    position: player.position,
    cardCount: player.hand.length,
    tricksWon: player.tricksWon,
    isCurrentTurn,
    isBot: player.isBot,
    isConnected: player.isConnected,
  };
}

/**
 * Create a new player
 */
export function createPlayer(
  id: string,
  name: string,
  position: PlayerPosition,
  isBot = false
): Player {
  return {
    id,
    name,
    position,
    hand: [],
    tricksWon: 0,
    isBot,
    isConnected: !isBot,
  };
}
