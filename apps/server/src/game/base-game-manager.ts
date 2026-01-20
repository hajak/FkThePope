import type { PlayerPosition, GameType } from '@fkthepope/shared';
import type { Room } from '../lobby/lobby-manager.js';

/**
 * Base interface for all game managers
 */
export interface BaseGameManager {
  readonly gameType: GameType;
  readonly room: Room;

  /**
   * Start a new hand/round
   */
  startHand(): void;

  /**
   * Get the current player whose turn it is
   */
  getCurrentPlayer(): PlayerPosition | null;

  /**
   * Get client state for a specific player
   */
  getClientState(position: PlayerPosition): unknown;

  /**
   * Get admin state (all hands visible)
   */
  getAdminState(): unknown;

  /**
   * Check if game is in a rule creation phase (Whist-specific, returns false for others)
   */
  isRuleCreationPhase(): boolean;

  /**
   * Get the hand winner (for rule creation, Whist-specific)
   */
  getHandWinner(): PlayerPosition | null;

  /**
   * Get bot move for automated play
   */
  getBotMove(position: PlayerPosition): unknown | null;
}
