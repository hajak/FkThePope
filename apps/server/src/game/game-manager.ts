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
   * Get a bot's move using strategic AI
   */
  getBotMove(position: PlayerPosition): { card: Card; faceDown: boolean } | null {
    const player = this.state.players[position];
    if (!player || !player.isBot) return null;

    const currentTrick = this.state.currentHand?.currentTrick;
    if (!currentTrick) return null;

    const hand = player.hand;
    const trumpSuit = this.state.currentHand!.trumpSuit;
    const leadSuit = currentTrick.leadSuit;
    const playedCards = currentTrick.cards;

    // Helper: get rank value for comparison
    const rankValue = (card: Card): number => {
      const values: Record<string, number> = {
        '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
        '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
      };
      return values[card.rank] ?? 0;
    };

    // Helper: sort cards by rank (lowest first)
    const sortByRankAsc = (cards: Card[]): Card[] =>
      [...cards].sort((a, b) => rankValue(a) - rankValue(b));

    // Helper: sort cards by rank (highest first)
    const sortByRankDesc = (cards: Card[]): Card[] =>
      [...cards].sort((a, b) => rankValue(b) - rankValue(a));

    // Helper: get cards of a suit
    const cardsOfSuit = (cards: Card[], suit: Suit): Card[] =>
      cards.filter((c) => c.suit === suit);

    // Helper: get current winning card info from played cards
    const getCurrentWinner = (): { card: Card; isTrump: boolean } | null => {
      if (playedCards.length === 0) return null;
      const eligible = playedCards.filter((pc) => !pc.faceDown);
      if (eligible.length === 0) return null;

      // Check for trump
      const trumpPlayed = eligible.filter((pc) => pc.card.suit === trumpSuit);
      if (trumpPlayed.length > 0) {
        const highestTrump = trumpPlayed.reduce((h, c) =>
          rankValue(c.card) > rankValue(h.card) ? c : h
        );
        return { card: highestTrump.card, isTrump: true };
      }

      // Highest of lead suit
      const leadCards = eligible.filter((pc) => pc.card.suit === leadSuit);
      if (leadCards.length > 0) {
        const highestLead = leadCards.reduce((h, c) =>
          rankValue(c.card) > rankValue(h.card) ? c : h
        );
        return { card: highestLead.card, isTrump: false };
      }

      return null;
    };

    // Helper: check if a card would win
    const wouldWin = (card: Card): boolean => {
      const current = getCurrentWinner();
      if (!current) return true; // First to play always "wins" so far

      // If current winner is trump
      if (current.isTrump) {
        // Need higher trump to win
        return card.suit === trumpSuit && rankValue(card) > rankValue(current.card);
      }

      // Current winner is lead suit
      // Trump always beats non-trump
      if (card.suit === trumpSuit) return true;

      // Same suit - need higher rank
      if (card.suit === leadSuit) {
        return rankValue(card) > rankValue(current.card);
      }

      // Off-suit non-trump cannot win
      return false;
    };

    // Helper: get lowest card that wins
    const getLowestWinningCard = (cards: Card[]): Card | null => {
      const winners = cards.filter((c) => wouldWin(c));
      if (winners.length === 0) return null;
      return sortByRankAsc(winners)[0]!;
    };

    // Helper: get lowest card overall
    const getLowestCard = (cards: Card[]): Card =>
      sortByRankAsc(cards)[0]!;

    // Helper: get highest card overall
    const getHighestCard = (cards: Card[]): Card =>
      sortByRankDesc(cards)[0]!;

    // Helper: get best discard (lowest, prefer short suits, avoid trump)
    const getBestDiscard = (cards: Card[]): Card => {
      // Group by suit
      const bySuit: Record<Suit, Card[]> = {
        hearts: [], diamonds: [], clubs: [], spades: [],
      };
      for (const c of cards) {
        bySuit[c.suit].push(c);
      }

      // Prefer non-trump, then shortest suit, then lowest card
      const nonTrump = cards.filter((c) => c.suit !== trumpSuit);
      const pool = nonTrump.length > 0 ? nonTrump : cards;

      // Find shortest suit among pool
      let shortest: Card[] = pool;
      let shortestLen = 14;
      for (const suit of ['hearts', 'diamonds', 'clubs', 'spades'] as Suit[]) {
        if (suit === trumpSuit && nonTrump.length > 0) continue;
        const suitCards = pool.filter((c) => c.suit === suit);
        if (suitCards.length > 0 && suitCards.length < shortestLen) {
          shortest = suitCards;
          shortestLen = suitCards.length;
        }
      }

      return getLowestCard(shortest.length > 0 ? shortest : pool);
    };

    // CASE 1: LEADING (first to play)
    if (!leadSuit) {
      const nonTrump = hand.filter((c) => c.suit !== trumpSuit);
      const trumpCards = cardsOfSuit(hand, trumpSuit);

      // Find longest non-trump suit
      let longestSuit: Suit | null = null;
      let longestLen = 0;
      for (const suit of ['hearts', 'diamonds', 'clubs', 'spades'] as Suit[]) {
        if (suit === trumpSuit) continue;
        const count = cardsOfSuit(hand, suit).length;
        if (count > longestLen) {
          longestLen = count;
          longestSuit = suit;
        }
      }

      // Lead highest from longest non-trump suit
      if (longestSuit && longestLen >= 2) {
        const suitCards = cardsOfSuit(hand, longestSuit);
        return { card: getHighestCard(suitCards), faceDown: false };
      }

      // If no good non-trump suit and have 4+ trumps, lead highest trump
      if (trumpCards.length >= 4) {
        return { card: getHighestCard(trumpCards), faceDown: false };
      }

      // Otherwise lead highest card available
      return { card: getHighestCard(hand), faceDown: false };
    }

    // CASE 2: FOLLOWING SUIT (have cards of lead suit)
    const followCards = cardsOfSuit(hand, leadSuit);
    if (followCards.length > 0) {
      // Can we win cheaply?
      const lowestWinner = getLowestWinningCard(followCards);
      if (lowestWinner) {
        return { card: lowestWinner, faceDown: false };
      }
      // Cannot win - play lowest
      return { card: getLowestCard(followCards), faceDown: false };
    }

    // CASE 3: VOID IN SUIT
    const trumpCards = cardsOfSuit(hand, trumpSuit);

    // Check if anyone has played trump
    const currentWinner = getCurrentWinner();
    const trumpAlreadyPlayed = currentWinner?.isTrump ?? false;

    // If we have trump
    if (trumpCards.length > 0) {
      // Can we win with trump?
      const lowestWinningTrump = getLowestWinningCard(trumpCards);
      if (lowestWinningTrump) {
        // Trump only if it will win
        return { card: lowestWinningTrump, faceDown: false };
      }
      // Cannot win with trump - discard instead
      // (Don't waste trump on a losing play)
    }

    // Discard: use best discard strategy
    return { card: getBestDiscard(hand), faceDown: false };
  }
}
