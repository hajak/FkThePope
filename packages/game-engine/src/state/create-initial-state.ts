import type { GameState, PlayerPosition, Player, Suit } from '@fkthepope/shared';
import { createPlayer, PLAYER_POSITIONS } from '@fkthepope/shared';
import { nanoid } from '../utils/nanoid.js';

/**
 * Options for creating a new game
 */
export interface CreateGameOptions {
  gameId?: string;
  players?: Array<{ id: string; name: string; position: PlayerPosition; isBot?: boolean }>;
}

/**
 * Create the initial game state (waiting for players)
 */
export function createInitialState(options: CreateGameOptions = {}): GameState {
  const gameId = options.gameId ?? nanoid();
  const now = Date.now();

  const players: Record<PlayerPosition, Player | null> = {
    north: null,
    east: null,
    south: null,
    west: null,
  };

  // Add any initial players
  if (options.players) {
    for (const p of options.players) {
      players[p.position] = createPlayer(p.id, p.name, p.position, p.isBot ?? false);
    }
  }

  return {
    id: gameId,
    phase: 'waiting',
    players,
    currentHand: null,
    rules: [],
    scores: {
      north: 0,
      east: 0,
      south: 0,
      west: 0,
    },
    handHistory: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Check if a game has enough players to start
 */
export function canStartGame(state: GameState): boolean {
  return PLAYER_POSITIONS.every((pos) => state.players[pos] !== null);
}

/**
 * Get a list of empty positions
 */
export function getEmptyPositions(state: GameState): PlayerPosition[] {
  return PLAYER_POSITIONS.filter((pos) => state.players[pos] === null);
}

/**
 * Get a list of filled positions
 */
export function getFilledPositions(state: GameState): PlayerPosition[] {
  return PLAYER_POSITIONS.filter((pos) => state.players[pos] !== null);
}
