import type { Card, PlayerPosition } from './card.js';
import type { ClientGameState, GameAction } from './game.js';
import type { PlayerView } from './player.js';
import type { Rule, RuleViolation } from './rules.js';

/**
 * Room information for lobby display
 */
export interface RoomInfo {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: 4;
  status: 'waiting' | 'playing';
  players: Array<{ name: string; position: PlayerPosition }>;
}

/**
 * Events sent from client to server
 */
export type ClientToServerEvents = {
  // Lobby events
  'join-lobby': (data: { playerName: string }) => void;
  'create-room': (data: { roomName: string }) => void;
  'join-room': (data: { roomId: string; position?: PlayerPosition }) => void;
  'leave-room': () => void;
  'start-game': () => void;

  // Game events
  'play-card': (data: { card: Card; faceDown: boolean }) => void;
  'create-rule': (data: { rule: Omit<Rule, 'id' | 'createdBy' | 'createdAtHand' | 'createdAt' | 'isActive'> }) => void;

  // Dev/bot events
  'add-bot': (data: { position: PlayerPosition }) => void;
  'remove-bot': (data: { position: PlayerPosition }) => void;

  // Dev tools
  'dev-inject-rule': (data: { rule: Rule }) => void;
  'dev-set-trump': (data: { suit: string }) => void;
  'dev-reset-game': () => void;
};

/**
 * Events sent from server to client
 */
export type ServerToClientEvents = {
  // Connection events
  'connected': (data: { playerId: string }) => void;
  'error': (data: { message: string; code: string }) => void;

  // Lobby events
  'lobby-state': (data: { rooms: RoomInfo[] }) => void;
  'room-joined': (data: { roomId: string; position: PlayerPosition; players: Array<PlayerView | null> }) => void;
  'room-updated': (data: { players: Array<PlayerView | null> }) => void;
  'room-left': () => void;

  // Game lifecycle events
  'game-started': (data: { gameState: ClientGameState }) => void;
  'game-state': (data: { gameState: ClientGameState }) => void;
  'game-ended': (data: { finalScores: Record<PlayerPosition, number>; winner: PlayerPosition }) => void;

  // Turn events
  'your-turn': (data: { legalMoves: Array<{ card: Card; canPlayFaceDown: boolean }> }) => void;
  'waiting-for': (data: { player: PlayerPosition }) => void;

  // Play events
  'card-played': (data: { player: PlayerPosition; card: Card; faceDown: boolean }) => void;
  'play-rejected': (data: { violation: RuleViolation }) => void;

  // Trick events
  'trick-started': (data: { trickNumber: number; leader: PlayerPosition }) => void;
  'trick-complete': (data: { winner: PlayerPosition; trickNumber: number }) => void;

  // Hand events
  'hand-started': (data: { handNumber: number; trumpSuit: string; yourHand: Card[] }) => void;
  'hand-complete': (data: { winner: PlayerPosition; tricks: Record<PlayerPosition, number>; tieBreaker?: PlayerPosition }) => void;

  // Rule events
  'rule-creation-phase': (data: { winner: PlayerPosition }) => void;
  'rule-created': (data: { rule: Rule }) => void;

  // Action log
  'action': (data: { action: GameAction }) => void;
};

/**
 * Socket data for type safety
 */
export interface SocketData {
  playerId: string;
  playerName: string;
  roomId: string | null;
  position: PlayerPosition | null;
}
