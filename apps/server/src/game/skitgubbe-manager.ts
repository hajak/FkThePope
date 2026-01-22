import type { PlayerPosition, Card, Suit, GameType } from '@fkthepope/shared';
import { skitgubbe } from '@fkthepope/game-engine';
import type { BaseGameManager } from './base-game-manager.js';
import type { Room } from '../lobby/lobby-manager.js';

const {
  createInitialSkitgubbeState,
  toClientSkitgubbeState,
  skitgubbeReducer,
  dealSkitgubbe,
  getLegalMoves,
  getCollectionLegalMoves,
  getSheddingLegalMoves,
  isLegalCollectionPlay,
  isLegalSheddingPlay,
  getRankValue,
  canBeatPile,
} = skitgubbe;

type SkitgubbeState = skitgubbe.SkitgubbeState;
type ClientSkitgubbeState = skitgubbe.ClientSkitgubbeState;
type CollectionLegalMoves = skitgubbe.CollectionLegalMoves;
type SheddingLegalMoves = skitgubbe.SheddingLegalMoves;

/**
 * Manages a Skitgubbe game instance
 *
 * Skitgubbe has two phases:
 * Phase 1 (Collection): 2-card duels to collect strong cards
 * Phase 2 (Shedding): Get rid of cards by following suit (no trump)
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
   * Start the game - deal cards to all players
   * Note: Skitgubbe has no trump, but interface requires a return value
   */
  startHand(): { trumpSuit: Suit; trumpCard: Card } {
    const { hands, drawPile } = dealSkitgubbe(this.state.playerOrder, this.seed);

    this.state = skitgubbeReducer(this.state, {
      type: 'START_GAME',
      deal: hands,
      drawPile,
    });

    // Skitgubbe has no trump - return dummy values for interface compatibility
    const dummyCard: Card = { suit: 'spades', rank: 'A' };
    return { trumpSuit: 'spades', trumpCard: dummyCard };
  }

  /**
   * Phase 1: Play a card in a duel
   */
  playDuelCard(
    position: PlayerPosition,
    card: Card
  ): {
    success: boolean;
    error?: string;
    duelComplete?: boolean;
    winner?: PlayerPosition | null;
    isTie?: boolean;
    phaseChange?: boolean;
  } {
    if (this.state.phase !== 'collection') {
      return { success: false, error: 'Not in collection phase' };
    }

    if (this.state.currentPlayer !== position) {
      return { success: false, error: 'Not your turn' };
    }

    const player = this.state.players[position];
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    // Check if card is in hand
    const check = isLegalCollectionPlay(card, player.hand);
    if (!check.legal) {
      return { success: false, error: check.reason };
    }

    // Play the card
    this.state = skitgubbeReducer(this.state, {
      type: 'PLAY_DUEL_CARD',
      position,
      card,
    });

    // Check if duel is complete (both cards played)
    if (this.state.currentDuel?.leaderCard && this.state.currentDuel?.responderCard) {
      // Resolve the duel
      const prevTiePileCount = this.state.tiePile.length;
      this.state = skitgubbeReducer(this.state, { type: 'RESOLVE_DUEL' });

      // Check for tie
      const isTie = this.state.tiePile.length > prevTiePileCount;

      // Check if it's time to transition to shedding phase
      const shouldTransition = this.shouldTransitionToShedding();
      if (shouldTransition) {
        this.state = skitgubbeReducer(this.state, { type: 'START_SHEDDING' });
        return {
          success: true,
          duelComplete: true,
          winner: isTie ? null : this.state.currentPlayer,
          isTie,
          phaseChange: true,
        };
      }

      return {
        success: true,
        duelComplete: true,
        winner: isTie ? null : this.state.currentPlayer,
        isTie,
      };
    }

    return { success: true };
  }

  /**
   * Phase 1: Draw a card instead of playing
   */
  drawCard(position: PlayerPosition): {
    success: boolean;
    error?: string;
    drawnCard?: Card;
    isLastCard?: boolean;
    phaseChange?: boolean;
  } {
    if (this.state.phase !== 'collection') {
      return { success: false, error: 'Not in collection phase' };
    }

    if (this.state.currentPlayer !== position) {
      return { success: false, error: 'Not your turn' };
    }

    if (this.state.drawPile.length === 0) {
      return { success: false, error: 'Draw pile is empty' };
    }

    const drawnCard = this.state.drawPile[0]!;
    const isLastCard = this.state.drawPile.length === 1;

    this.state = skitgubbeReducer(this.state, {
      type: 'DRAW_CARD',
      position,
    });

    // Check if we should transition to shedding
    if (this.shouldTransitionToShedding()) {
      this.state = skitgubbeReducer(this.state, { type: 'START_SHEDDING' });
      return { success: true, drawnCard, isLastCard, phaseChange: true };
    }

    return { success: true, drawnCard, isLastCard };
  }

  /**
   * Check if collection phase should end
   * Ends when draw pile is empty AND all players have played out their hands
   */
  private shouldTransitionToShedding(): boolean {
    if (this.state.drawPile.length > 0) {
      return false;
    }

    // Check if any player has cards in hand (not yet collected)
    for (const pos of this.state.playerOrder) {
      const player = this.state.players[pos];
      if (player && player.hand.length > 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Phase 2: Play a card in shedding
   */
  playSheddingCard(
    position: PlayerPosition,
    card: Card
  ): {
    success: boolean;
    error?: string;
    trickComplete?: boolean;
    trickWinner?: PlayerPosition;
    mustPickUp?: boolean;
    playerOut?: boolean;
    gameEnd?: boolean;
    loser?: PlayerPosition;
  } {
    if (this.state.phase !== 'shedding') {
      return { success: false, error: 'Not in shedding phase' };
    }

    if (this.state.currentPlayer !== position) {
      return { success: false, error: 'Not your turn' };
    }

    const player = this.state.players[position];
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    // Check if play is legal
    const check = isLegalSheddingPlay(
      card,
      player.hand,
      this.state.pile,
      this.state.currentTrick
    );

    if (!check.legal) {
      return { success: false, error: check.reason };
    }

    // Play the card
    this.state = skitgubbeReducer(this.state, {
      type: 'PLAY_TRICK_CARD',
      position,
      card,
    });

    // Check if this play triggers a pickup
    if (check.mustPickUp) {
      this.state = skitgubbeReducer(this.state, {
        type: 'PICK_UP_PILE',
        position,
      });
      return { success: true, mustPickUp: true };
    }

    // Check if trick is complete
    const activePlayerCount = this.countActivePlayers();
    if (this.state.currentTrick && this.state.currentTrick.cards.length >= activePlayerCount) {
      // Resolve the trick
      this.state = skitgubbeReducer(this.state, { type: 'RESOLVE_TRICK' });
      const trickWinner = this.state.currentPlayer!;

      // Check if winner is now out of cards
      const winnerPlayer = this.state.players[trickWinner];
      if (winnerPlayer && winnerPlayer.hand.length === 0) {
        this.state = skitgubbeReducer(this.state, {
          type: 'PLAYER_OUT',
          position: trickWinner,
        });

        if (this.state.phase === 'game_end') {
          return {
            success: true,
            trickComplete: true,
            trickWinner,
            playerOut: true,
            gameEnd: true,
            loser: this.state.loser!,
          };
        }

        return { success: true, trickComplete: true, trickWinner, playerOut: true };
      }

      return { success: true, trickComplete: true, trickWinner };
    }

    // Check if current player is now out of cards
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
   * Phase 2: Pick up the pile
   */
  pickUpPile(position: PlayerPosition): {
    success: boolean;
    error?: string;
    cardsPickedUp: number;
  } {
    if (this.state.phase !== 'shedding') {
      return { success: false, error: 'Not in shedding phase', cardsPickedUp: 0 };
    }

    if (this.state.currentPlayer !== position) {
      return { success: false, error: 'Not your turn', cardsPickedUp: 0 };
    }

    const pileCards = this.state.pile.length;
    const trickCards = this.state.currentTrick?.cards.length ?? 0;
    const cardsPickedUp = pileCards + trickCards;

    if (cardsPickedUp === 0) {
      return { success: false, error: 'No cards to pick up', cardsPickedUp: 0 };
    }

    this.state = skitgubbeReducer(this.state, {
      type: 'PICK_UP_PILE',
      position,
    });

    return { success: true, cardsPickedUp };
  }

  /**
   * Count active players (not out)
   */
  private countActivePlayers(): number {
    return this.state.playerOrder.filter(pos => {
      const player = this.state.players[pos];
      return player && !player.isOut;
    }).length;
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
   * Get trump info - Skitgubbe has no trump
   */
  getTrumpInfo(): { trumpSuit: Suit | null; trumpCard: Card | null } {
    return {
      trumpSuit: null,
      trumpCard: null,
    };
  }

  /**
   * Get bot move
   */
  getBotMove(position: PlayerPosition): {
    action: 'duel' | 'draw' | 'play' | 'pickup';
    card?: Card;
  } | null {
    const player = this.state.players[position];
    if (!player || !player.isBot) return null;
    if (this.state.currentPlayer !== position) return null;

    if (this.state.phase === 'collection') {
      return this.getCollectionBotMove(position);
    }

    if (this.state.phase === 'shedding') {
      return this.getSheddingBotMove(position);
    }

    return null;
  }

  /**
   * Bot move in collection phase
   */
  private getCollectionBotMove(position: PlayerPosition): {
    action: 'duel' | 'draw';
    card?: Card;
  } | null {
    const player = this.state.players[position];
    if (!player) return null;

    const legalMoves = getCollectionLegalMoves(player.hand, this.state.drawPile.length);

    // Strategy: Save high cards (A, K, Q), draw if we'd have to play them
    // When responding: try to win with minimal card, or sacrifice lowest
    // When leading: play medium cards to probe

    const isResponding = this.state.currentDuel?.responder === position;
    const leaderCard = this.state.currentDuel?.leaderCard;

    const sortedHand = [...player.hand].sort((a, b) => getRankValue(a) - getRankValue(b));

    if (isResponding && leaderCard) {
      // Responding to a duel
      const leaderValue = getRankValue(leaderCard);

      // Find cards that can win
      const winningCards = sortedHand.filter(c => getRankValue(c) > leaderValue);

      if (winningCards.length > 0) {
        // Win with minimal card (save high cards)
        return { action: 'duel', card: winningCards[0] };
      }

      // Can't win - sacrifice lowest card
      if (sortedHand.length > 0) {
        return { action: 'duel', card: sortedHand[0] };
      }

      // No cards, draw
      if (legalMoves.canDraw) {
        return { action: 'draw' };
      }
    } else {
      // Leading a duel
      // Don't lead with high cards (A, K, Q) unless we have to
      const highCards = sortedHand.filter(c => getRankValue(c) >= 12);
      const mediumCards = sortedHand.filter(c => getRankValue(c) >= 7 && getRankValue(c) < 12);
      const lowCards = sortedHand.filter(c => getRankValue(c) < 7);

      // Prefer to draw if we only have high cards
      if (highCards.length === player.hand.length && legalMoves.canDraw) {
        return { action: 'draw' };
      }

      // Play medium card to probe
      if (mediumCards.length > 0) {
        return { action: 'duel', card: mediumCards[0] };
      }

      // Play low card
      if (lowCards.length > 0) {
        return { action: 'duel', card: lowCards[0] };
      }

      // Must play high card
      if (sortedHand.length > 0) {
        return { action: 'duel', card: sortedHand[0] };
      }

      // Draw as fallback
      if (legalMoves.canDraw) {
        return { action: 'draw' };
      }
    }

    return null;
  }

  /**
   * Bot move in shedding phase
   */
  private getSheddingBotMove(position: PlayerPosition): {
    action: 'play' | 'pickup';
    card?: Card;
  } | null {
    const player = this.state.players[position];
    if (!player) return null;

    const legalMoves = getSheddingLegalMoves(
      player.hand,
      this.state.pile,
      this.state.currentTrick
    );

    // Must pick up if no legal plays
    if (legalMoves.mustPickUp || legalMoves.playableCards.length === 0) {
      return { action: 'pickup' };
    }

    const playable = legalMoves.playableCards;

    // Sort by value (prefer to play low cards to get rid of them)
    const sorted = [...playable].sort((a, b) => getRankValue(a) - getRankValue(b));

    // Play lowest playable card
    if (sorted.length > 0) {
      return { action: 'play', card: sorted[0] };
    }

    return { action: 'pickup' };
  }
}
