import type { Card, PlayedCard, PlayerPosition, Suit } from './card.js';
import type { Player, PlayerView } from './player.js';
import type { Rule, RuleViolation } from './rules.js';

/**
 * Game phases
 */
export type GamePhase =
  | 'waiting' // Lobby, waiting for players
  | 'dealing' // Cards being dealt
  | 'playing' // Trick in progress
  | 'trick_end' // Trick just completed, showing result
  | 'hand_end' // Hand complete, showing scores
  | 'rule_create' // Winner creating new rule
  | 'game_end'; // Game over

/**
 * State of the current trick
 */
export interface TrickState {
  cards: PlayedCard[];
  leadSuit: Suit | null;
  leader: PlayerPosition;
  currentPlayer: PlayerPosition;
  trickNumber: number; // 1-13 within a hand
  winner?: PlayerPosition;
}

/**
 * State of the current hand (13 tricks)
 */
export interface HandState {
  number: number;
  trumpSuit: Suit;
  completedTricks: TrickState[];
  currentTrick: TrickState | null;
  tricksPlayed: number;
}

/**
 * Full game state (server-side)
 */
export interface GameState {
  id: string;
  phase: GamePhase;
  players: Record<PlayerPosition, Player | null>;
  currentHand: HandState | null;
  rules: Rule[];
  scores: Record<PlayerPosition, number>; // Total tricks across all hands
  handHistory: HandResult[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Result of a completed hand
 */
export interface HandResult {
  handNumber: number;
  trumpSuit: Suit;
  tricks: Record<PlayerPosition, number>;
  winner: PlayerPosition;
  ruleAdded?: Rule;
}

/**
 * Game state as seen by a client
 */
export interface ClientGameState {
  id: string;
  phase: GamePhase;
  myPosition: PlayerPosition;
  myHand: Card[];
  players: Record<PlayerPosition, PlayerView | null>;
  currentHand: HandState | null;
  rules: Rule[];
  scores: Record<PlayerPosition, number>;
  legalMoves: LegalMove[];
  lastAction?: GameAction;
  lastViolation?: RuleViolation;
}

/**
 * A legal move the current player can make
 */
export interface LegalMove {
  card: Card;
  canPlayFaceUp: boolean;
  canPlayFaceDown: boolean;
}

/**
 * Actions that can occur in the game
 */
export type GameAction =
  | { type: 'card_played'; player: PlayerPosition; card: PlayedCard }
  | { type: 'trick_won'; winner: PlayerPosition; trickNumber: number }
  | { type: 'hand_started'; handNumber: number; trumpSuit: Suit }
  | { type: 'hand_ended'; winner: PlayerPosition; tricks: Record<PlayerPosition, number> }
  | { type: 'rule_added'; rule: Rule }
  | { type: 'player_joined'; player: PlayerView }
  | { type: 'player_left'; position: PlayerPosition };

/**
 * Turn order for players
 */
export const TURN_ORDER: PlayerPosition[] = ['north', 'east', 'south', 'west'];

/**
 * Get the next player in turn order
 */
export function getNextPlayer(current: PlayerPosition): PlayerPosition {
  const index = TURN_ORDER.indexOf(current);
  return TURN_ORDER[(index + 1) % 4]!;
}

/**
 * Get the player across from a given position
 */
export function getAcrossPlayer(position: PlayerPosition): PlayerPosition {
  const index = TURN_ORDER.indexOf(position);
  return TURN_ORDER[(index + 2) % 4]!;
}
