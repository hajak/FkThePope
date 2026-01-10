import type { PlayerPosition, TrickState } from '@fkthepope/shared';
import { PLAYER_POSITIONS } from '@fkthepope/shared';

/**
 * Result of scoring a hand
 */
export interface HandScore {
  tricks: Record<PlayerPosition, number>;
  winner: PlayerPosition;
  tiedPlayers: PlayerPosition[];
  tieBreaker?: PlayerPosition; // Who won the tie (last trick winner among tied)
}

/**
 * Count tricks won by each player in a hand
 */
export function scoreHand(completedTricks: TrickState[]): HandScore {
  const tricks: Record<PlayerPosition, number> = {
    north: 0,
    east: 0,
    south: 0,
    west: 0,
  };

  // Count tricks for each player
  for (const trick of completedTricks) {
    if (trick.winner) {
      tricks[trick.winner]++;
    }
  }

  // Find the maximum tricks won
  const maxTricks = Math.max(...Object.values(tricks));

  // Find all players with max tricks (potential tie)
  const tiedPlayers = PLAYER_POSITIONS.filter(
    (pos) => tricks[pos] === maxTricks
  );

  let winner: PlayerPosition;
  let tieBreaker: PlayerPosition | undefined;

  if (tiedPlayers.length === 1) {
    // Clear winner
    winner = tiedPlayers[0]!;
  } else {
    // Tie-breaker: last trick winner among tied players
    tieBreaker = findLastTrickWinner(completedTricks, tiedPlayers);
    winner = tieBreaker;
  }

  return {
    tricks,
    winner,
    tiedPlayers,
    tieBreaker: tiedPlayers.length > 1 ? tieBreaker : undefined,
  };
}

/**
 * Find the last trick winner among a set of players
 * Used for tie-breaking
 */
function findLastTrickWinner(
  completedTricks: TrickState[],
  candidates: PlayerPosition[]
): PlayerPosition {
  // Go backwards through tricks to find last winner among candidates
  for (let i = completedTricks.length - 1; i >= 0; i--) {
    const trick = completedTricks[i]!;
    if (trick.winner && candidates.includes(trick.winner)) {
      return trick.winner;
    }
  }

  // Fallback: first candidate (shouldn't happen in normal play)
  return candidates[0]!;
}

/**
 * Check if a hand is complete
 */
export function isHandComplete(completedTricks: TrickState[]): boolean {
  return completedTricks.length === 13;
}
