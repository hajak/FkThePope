import type {
  GameState,
  PlayerPosition,
  Card,
  Suit,
  Rule,
  RuleContext,
  ClientGameState,
} from '@fkthepope/shared';
import { PLAYER_POSITIONS, getNextPlayer } from '@fkthepope/shared';
import {
  createInitialState,
  gameReducer,
  deal,
  resolveTrick,
  isLegalPlay,
  toClientGameState,
  getCurrentPlayer,
  isTrickComplete,
  getHandWinner,
  scoreHand,
  ruleId,
} from '@fkthepope/game-engine';
import type { GameAction } from '@fkthepope/game-engine';
import { RulesEngine } from '../rules-engine/index.js';
import type { Room, RoomPlayer } from '../lobby/lobby-manager.js';

/**
 * Manages a single game instance
 */
export class GameManager {
  private state: GameState;
  private rulesEngine: RulesEngine;
  private seed?: number;
  private forceTrump?: Suit;

  constructor(
    private room: Room,
    options: { seed?: number; forceTrump?: Suit } = {}
  ) {
    this.seed = options.seed;
    this.forceTrump = options.forceTrump;
    this.rulesEngine = new RulesEngine();

    // Create initial state with players from room
    const players = Array.from(room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      isBot: p.isBot,
    }));

    this.state = createInitialState({
      gameId: room.id,
      players,
    });
  }

  /**
   * Start a new hand (deal cards)
   */
  startHand(): { trumpSuit: Suit; hands: Record<PlayerPosition, Card[]> } {
    const { hands, trumpSuit } = deal(this.seed, this.forceTrump);

    // Determine first leader (random for first hand, previous winner otherwise)
    const firstLeader = this.state.handHistory.length > 0
      ? this.state.handHistory[this.state.handHistory.length - 1]!.winner
      : PLAYER_POSITIONS[Math.floor(Math.random() * 4)]!;

    this.state = gameReducer(this.state, {
      type: 'START_HAND',
      trumpSuit,
      hands,
      firstLeader,
    });

    return { trumpSuit, hands };
  }

  /**
   * Attempt to play a card
   */
  playCard(
    position: PlayerPosition,
    card: Card,
    faceDown: boolean
  ): {
    success: boolean;
    error?: string;
    trickComplete?: boolean;
    trickWinner?: PlayerPosition;
    handComplete?: boolean;
    handWinner?: PlayerPosition;
  } {
    // Validate it's this player's turn
    const currentPlayer = getCurrentPlayer(this.state);
    if (currentPlayer !== position) {
      return { success: false, error: 'Not your turn' };
    }

    const player = this.state.players[position];
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    // Check base game rules (follow suit, etc.)
    const baseCheck = isLegalPlay(
      card,
      faceDown,
      player.hand,
      this.state.currentHand?.currentTrick?.cards ?? [],
      this.state.currentHand?.trumpSuit ?? 'spades'
    );

    if (!baseCheck.legal) {
      return { success: false, error: baseCheck.reason };
    }

    // Check custom rules
    const context = this.buildRuleContext(position, card, faceDown);
    const ruleResult = this.rulesEngine.evaluate(
      'onPlayAttempt',
      this.state.rules,
      context
    );

    if (!ruleResult.allowed) {
      const violation = ruleResult.violations[0];
      return {
        success: false,
        error: violation?.message ?? 'Move blocked by custom rule',
      };
    }

    // Apply the play
    this.state = gameReducer(this.state, {
      type: 'PLAY_CARD',
      position,
      card,
      faceDown: faceDown || ruleResult.mustPlayFaceDown,
    });

    // Check if trick is complete
    if (isTrickComplete(this.state)) {
      const trickCards = this.state.currentHand!.currentTrick!.cards;
      const winner = resolveTrick(trickCards, this.state.currentHand!.trumpSuit);

      this.state = gameReducer(this.state, {
        type: 'COMPLETE_TRICK',
        winner,
      });

      // Evaluate onTrickEnd rules
      this.rulesEngine.evaluate('onTrickEnd', this.state.rules, context);

      // Check if hand is complete
      if (this.state.currentHand!.tricksPlayed >= 13) {
        const handScore = scoreHand(this.state.currentHand!.completedTricks);

        this.state = gameReducer(this.state, {
          type: 'COMPLETE_HAND',
          winner: handScore.winner,
        });

        return {
          success: true,
          trickComplete: true,
          trickWinner: winner,
          handComplete: true,
          handWinner: handScore.winner,
        };
      }

      return {
        success: true,
        trickComplete: true,
        trickWinner: winner,
      };
    }

    return { success: true };
  }

  /**
   * Add a custom rule
   */
  addRule(
    createdBy: PlayerPosition,
    rule: Omit<Rule, 'id' | 'createdBy' | 'createdAtHand' | 'createdAt' | 'isActive'>
  ): { success: boolean; rule?: Rule; error?: string } {
    // Validate the rule
    const validation = this.rulesEngine.validateRule(rule);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(', ') };
    }

    const newRule: Rule = {
      ...rule,
      id: ruleId(),
      createdBy,
      createdAtHand: this.state.handHistory.length,
      createdAt: Date.now(),
      isActive: true,
    };

    this.state = gameReducer(this.state, {
      type: 'ADD_RULE',
      rule: newRule,
    });

    return { success: true, rule: newRule };
  }

  /**
   * Start the next hand after rule creation
   */
  startNextHand(): void {
    this.state = gameReducer(this.state, { type: 'START_NEXT_HAND' });
  }

  /**
   * Get the current game state for a specific player
   */
  getClientState(position: PlayerPosition): ClientGameState {
    return toClientGameState(this.state, position);
  }

  /**
   * Get the full server state (for debugging)
   */
  getServerState(): GameState {
    return this.state;
  }

  /**
   * Get current player whose turn it is
   */
  getCurrentPlayer(): PlayerPosition | null {
    return getCurrentPlayer(this.state);
  }

  /**
   * Get the hand winner (for rule creation phase)
   */
  getHandWinner(): PlayerPosition | null {
    return getHandWinner(this.state);
  }

  /**
   * Check if game is in rule creation phase
   */
  isRuleCreationPhase(): boolean {
    return this.state.phase === 'rule_create';
  }

  /**
   * Build rule context for evaluation
   */
  private buildRuleContext(
    position: PlayerPosition,
    card: Card,
    faceDown: boolean
  ): RuleContext {
    const player = this.state.players[position]!;
    const currentTrick = this.state.currentHand?.currentTrick;

    return {
      playedCard: card,
      playedFaceDown: faceDown,
      player: {
        position,
        hand: player.hand,
        tricksWon: player.tricksWon,
      },
      trick: {
        cards: currentTrick?.cards.map((pc) => ({
          card: pc.card,
          playedBy: pc.playedBy,
          faceDown: pc.faceDown,
        })) ?? [],
        leadSuit: currentTrick?.leadSuit ?? null,
        trickNumber: currentTrick?.trickNumber ?? 1,
      },
      game: {
        trumpSuit: this.state.currentHand?.trumpSuit ?? 'spades',
        handNumber: this.state.currentHand?.number ?? 1,
      },
    };
  }

  /**
   * Get a bot's move (simple AI: random legal card)
   */
  getBotMove(position: PlayerPosition): { card: Card; faceDown: boolean } | null {
    const player = this.state.players[position];
    if (!player || !player.isBot) return null;

    const currentTrick = this.state.currentHand?.currentTrick;
    if (!currentTrick) return null;

    // Get legal moves from base rules
    const trumpSuit = this.state.currentHand!.trumpSuit;
    const leadSuit = currentTrick.leadSuit;

    let legalCards = player.hand;

    // If there's a lead suit, must follow if possible
    if (leadSuit) {
      const suitCards = player.hand.filter((c) => c.suit === leadSuit);
      if (suitCards.length > 0) {
        legalCards = suitCards;
      }
    }

    // Pick a random legal card
    const card = legalCards[Math.floor(Math.random() * legalCards.length)]!;

    // Decide face-down: only if void in lead suit and not leading
    const faceDown = leadSuit !== null &&
      !player.hand.some((c) => c.suit === leadSuit) &&
      card.suit !== trumpSuit;

    return { card, faceDown: false }; // Bots play face-up for simplicity
  }
}
