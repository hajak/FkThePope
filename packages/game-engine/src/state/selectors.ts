import type {
  GameState,
  ClientGameState,
  PlayerPosition,
  Card,
  LegalMove,
  PlayerView,
} from '@fkthepope/shared';
import { toPlayerView, PLAYER_POSITIONS } from '@fkthepope/shared';
import { getLegalMoves } from '../trick/legal-moves.js';

/**
 * Get the current player whose turn it is
 */
export function getCurrentPlayer(state: GameState): PlayerPosition | null {
  if (state.phase !== 'playing' || !state.currentHand?.currentTrick) {
    return null;
  }
  return state.currentHand.currentTrick.currentPlayer;
}

/**
 * Check if it's a specific player's turn
 */
export function isPlayerTurn(state: GameState, position: PlayerPosition): boolean {
  return getCurrentPlayer(state) === position;
}

/**
 * Get the cards in a player's hand
 */
export function getPlayerHand(state: GameState, position: PlayerPosition): Card[] {
  return state.players[position]?.hand ?? [];
}

/**
 * Get legal moves for the current player
 */
export function getCurrentLegalMoves(state: GameState): LegalMove[] {
  const currentPlayer = getCurrentPlayer(state);
  if (!currentPlayer || !state.currentHand) {
    return [];
  }

  const hand = getPlayerHand(state, currentPlayer);
  const trickCards = state.currentHand.currentTrick?.cards ?? [];
  const trumpSuit = state.currentHand.trumpSuit;

  return getLegalMoves(hand, trickCards, trumpSuit);
}

/**
 * Convert server game state to client view for a specific player
 */
export function toClientGameState(
  state: GameState,
  forPosition: PlayerPosition
): ClientGameState {
  const currentPlayer = getCurrentPlayer(state);
  const myPlayer = state.players[forPosition];

  // Build player views (hide other players' cards)
  const players: Record<PlayerPosition, PlayerView | null> = {
    north: null,
    east: null,
    south: null,
    west: null,
  };

  for (const pos of PLAYER_POSITIONS) {
    const player = state.players[pos];
    if (player) {
      players[pos] = toPlayerView(player, currentPlayer === pos);
    }
  }

  // Get legal moves for this player
  let legalMoves: LegalMove[] = [];
  if (currentPlayer === forPosition && myPlayer && state.currentHand) {
    legalMoves = getLegalMoves(
      myPlayer.hand,
      state.currentHand.currentTrick?.cards ?? [],
      state.currentHand.trumpSuit
    );
  }

  return {
    id: state.id,
    phase: state.phase,
    myPosition: forPosition,
    myHand: myPlayer?.hand ?? [],
    players,
    currentHand: state.currentHand,
    rules: state.rules,
    scores: state.scores,
    legalMoves,
  };
}

/**
 * Get the winner of the current hand (if determined)
 */
export function getHandWinner(state: GameState): PlayerPosition | null {
  if (state.phase !== 'hand_end' && state.phase !== 'rule_create') {
    return null;
  }

  // Find player with most tricks
  let maxTricks = -1;
  let winners: PlayerPosition[] = [];

  for (const pos of PLAYER_POSITIONS) {
    const player = state.players[pos];
    if (player) {
      if (player.tricksWon > maxTricks) {
        maxTricks = player.tricksWon;
        winners = [pos];
      } else if (player.tricksWon === maxTricks) {
        winners.push(pos);
      }
    }
  }

  if (winners.length === 1) {
    return winners[0]!;
  }

  // Tie-breaker: last trick winner among tied players
  if (state.currentHand) {
    const tricks = state.currentHand.completedTricks;
    for (let i = tricks.length - 1; i >= 0; i--) {
      const trick = tricks[i]!;
      if (trick.winner && winners.includes(trick.winner)) {
        return trick.winner;
      }
    }
  }

  return winners[0] ?? null;
}

/**
 * Check if a trick is complete
 */
export function isTrickComplete(state: GameState): boolean {
  return (state.currentHand?.currentTrick?.cards.length ?? 0) === 4;
}

/**
 * Get connected players
 */
export function getConnectedPlayers(state: GameState): PlayerPosition[] {
  return PLAYER_POSITIONS.filter((pos) => {
    const player = state.players[pos];
    return player && player.isConnected;
  });
}

/**
 * Get bot players
 */
export function getBotPlayers(state: GameState): PlayerPosition[] {
  return PLAYER_POSITIONS.filter((pos) => {
    const player = state.players[pos];
    return player?.isBot;
  });
}
