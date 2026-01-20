import type { PlayerPosition, Card, Suit, GameType } from '@fkthepope/shared';
import { skitgubbe } from '@fkthepope/game-engine';
import type { BaseGameManager } from './base-game-manager.js';
import type { Room } from '../lobby/lobby-manager.js';

const {
  createInitialSkitgubbeState,
  toClientSkitgubbeState,
  skitgubbeReducer,
  dealSkitgubbe,
  getPhase1LegalMoves,
  getPhase2LegalMoves,
  isLegalPhase1Play,
  isLegalPhase2Play,
  resolvePhase1Trick,
  getRankValue,
  canBeatCard,
} = skitgubbe;

type SkitgubbeState = skitgubbe.SkitgubbeState;
type ClientSkitgubbeState = skitgubbe.ClientSkitgubbeState;

/**
 * Manages a Skitgubbe game instance
 */
export class SkitgubbeGameManager implements BaseGameManager {
  readonly gameType: GameType = 'skitgubbe';
  private state: SkitgubbeState;
  private seed?: number;

  constructor(
    public readonly room: Room,
    options: { seed?: number } = {}
  ) {
    this.seed = options.seed;

    // Create initial state
    const playerCount = room.players.size;
    this.state = createInitialSkitgubbeState(room.id, playerCount);

    // Add players from room
    for (const [pos, player] of room.players) {
      this.state = skitgubbeReducer(this.state, {
        type: 'ADD_PLAYER',
        player: {
          id: player.id,
          name: player.name,
          position: pos,
          isBot: player.isBot,
        },
      });
    }
  }

  /**
   * Start a new hand
   */
  startHand(): { trumpSuit: Suit; trumpCard: Card } {
    const { hands, stock, trumpCard } = dealSkitgubbe(this.state.playerOrder, this.seed);

    this.state = skitgubbeReducer(this.state, {
      type: 'START_GAME',
      hands,
      stock,
      trumpCard,
    });

    return { trumpSuit: trumpCard.suit, trumpCard };
  }

  /**
   * Play a card in Phase 1 (trick-taking)
   */
  playCardPhase1(
    position: PlayerPosition,
    card: Card
  ): {
    success: boolean;
    error?: string;
    trickComplete?: boolean;
    trickWinner?: PlayerPosition;
    stunsa?: boolean; // Bounce - equal cards, same player leads again
    drawNeeded?: boolean;
    phase2Starts?: boolean;
  } {
    if (this.state.phase !== 'phase1') {
      return { success: false, error: 'Not in phase 1' };
    }

    if (this.state.currentPlayer !== position) {
      return { success: false, error: 'Not your turn' };
    }

    const player = this.state.players[position];
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    // Check if play is legal
    const check = isLegalPhase1Play(card, player.hand);
    if (!check.legal) {
      return { success: false, error: check.reason };
    }

    // Play the card
    this.state = skitgubbeReducer(this.state, {
      type: 'PLAY_CARD_PHASE1',
      position,
      card,
    });

    // Check if trick is complete (2 cards)
    if (this.state.currentTrick && this.state.currentTrick.cards.length >= 2) {
      const winner = resolvePhase1Trick(
        this.state.currentTrick.cards,
        this.state.trumpSuit
      );

      // Check for stunsa (bounce) - winner is null when cards are equal
      if (winner === null) {
        this.state = skitgubbeReducer(this.state, { type: 'STUNSA' });

        // Draw cards after stunsa
        this.state = skitgubbeReducer(this.state, { type: 'DRAW_CARDS' });

        // Check if phase 2 should start (stock empty)
        if (this.state.stock.length === 0) {
          this.state = skitgubbeReducer(this.state, { type: 'START_PHASE2' });
          return {
            success: true,
            trickComplete: false, // Stunsa means trick isn't really complete
            stunsa: true,
            phase2Starts: true,
          };
        }

        return {
          success: true,
          trickComplete: false,
          stunsa: true,
          drawNeeded: true,
        };
      }

      this.state = skitgubbeReducer(this.state, {
        type: 'COMPLETE_TRICK',
        winner,
      });

      // Draw cards
      this.state = skitgubbeReducer(this.state, { type: 'DRAW_CARDS' });

      // Check if phase 2 should start (stock empty)
      if (this.state.stock.length === 0) {
        this.state = skitgubbeReducer(this.state, { type: 'START_PHASE2' });
        return {
          success: true,
          trickComplete: true,
          trickWinner: winner,
          phase2Starts: true,
        };
      }

      return {
        success: true,
        trickComplete: true,
        trickWinner: winner,
        drawNeeded: true,
      };
    }

    return { success: true };
  }

  /**
   * Play a card in Phase 2 (shedding)
   */
  playCardPhase2(
    position: PlayerPosition,
    card: Card
  ): {
    success: boolean;
    error?: string;
    playerOut?: boolean;
    gameEnd?: boolean;
    loser?: PlayerPosition;
  } {
    if (this.state.phase !== 'phase2') {
      return { success: false, error: 'Not in phase 2' };
    }

    if (this.state.currentPlayer !== position) {
      return { success: false, error: 'Not your turn' };
    }

    const player = this.state.players[position];
    if (!player || !this.state.pile) {
      return { success: false, error: 'Invalid state' };
    }

    // Check if play is legal
    const check = isLegalPhase2Play(
      card,
      player.hand,
      this.state.pile.topCard,
      this.state.trumpSuit!
    );
    if (!check.legal) {
      return { success: false, error: check.reason };
    }

    // Play the card
    this.state = skitgubbeReducer(this.state, {
      type: 'PLAY_CARD_PHASE2',
      position,
      card,
    });

    // Check if player is now out (empty hand)
    const updatedPlayer = this.state.players[position];
    if (updatedPlayer && updatedPlayer.hand.length === 0) {
      this.state = skitgubbeReducer(this.state, {
        type: 'PLAYER_OUT',
        position,
      });

      if (this.state.phase === 'game_end') {
        return {
          success: true,
          playerOut: true,
          gameEnd: true,
          loser: this.state.loser!,
        };
      }

      return { success: true, playerOut: true };
    }

    return { success: true };
  }

  /**
   * Pick up the pile in Phase 2
   */
  pickUpPile(position: PlayerPosition): {
    success: boolean;
    error?: string;
    cardsPickedUp: number;
  } {
    if (this.state.phase !== 'phase2') {
      return { success: false, error: 'Not in phase 2', cardsPickedUp: 0 };
    }

    if (this.state.currentPlayer !== position) {
      return { success: false, error: 'Not your turn', cardsPickedUp: 0 };
    }

    if (!this.state.pile || this.state.pile.cards.length === 0) {
      return { success: false, error: 'No cards to pick up', cardsPickedUp: 0 };
    }

    const cardsPickedUp = this.state.pile.cards.length;

    this.state = skitgubbeReducer(this.state, {
      type: 'PICK_UP_PILE',
      position,
    });

    return { success: true, cardsPickedUp };
  }

  /**
   * Get the current player
   */
  getCurrentPlayer(): PlayerPosition | null {
    return this.state.currentPlayer;
  }

  /**
   * Get client state
   */
  getClientState(position: PlayerPosition): ClientSkitgubbeState {
    return toClientSkitgubbeState(this.state, position);
  }

  /**
   * Get admin state (all hands visible)
   */
  getAdminState(): SkitgubbeState {
    return this.state;
  }

  /**
   * No rule creation in Skitgubbe
   */
  isRuleCreationPhase(): boolean {
    return false;
  }

  /**
   * No hand winner concept in Skitgubbe
   */
  getHandWinner(): PlayerPosition | null {
    return null;
  }

  /**
   * Get phase
   */
  getPhase(): string {
    return this.state.phase;
  }

  /**
   * Get bot move
   */
  getBotMove(position: PlayerPosition): { card: Card; action: 'play' | 'pickup' } | null {
    const player = this.state.players[position];
    if (!player || !player.isBot || player.hand.length === 0) return null;

    if (this.state.phase === 'phase1') {
      // Phase 1: Play any card (simple strategy: play highest)
      const hand = [...player.hand].sort((a, b) => getRankValue(b) - getRankValue(a));
      return { card: hand[0]!, action: 'play' };
    }

    if (this.state.phase === 'phase2' && this.state.pile) {
      const { playableCards, canPickUp } = getPhase2LegalMoves(
        player.hand,
        this.state.pile.topCard,
        this.state.trumpSuit!
      );

      if (playableCards.length > 0) {
        // Play lowest card that can beat
        const sorted = [...playableCards].sort((a, b) => getRankValue(a) - getRankValue(b));
        return { card: sorted[0]!, action: 'play' };
      }

      if (canPickUp) {
        // Must pick up - return a dummy card with pickup action
        return { card: player.hand[0]!, action: 'pickup' };
      }
    }

    return null;
  }
}
