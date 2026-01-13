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
 * WebRTC signaling types (generic to work in both browser and Node.js)
 */
export interface RTCOfferAnswer {
  type: string;
  sdp?: string;
}

export interface RTCIceCandidate {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

/**
 * Pending player request for join approval
 */
export interface PendingPlayer {
  socketId: string;
  playerName: string;
  requestedAt: number;
}

/**
 * Chat message
 */
export interface ChatMessage {
  id: string;
  playerName: string;
  message: string;
  timestamp: number;
}

/**
 * Events sent from client to server
 */
export type ClientToServerEvents = {
  // Lobby events
  'join-lobby': (data: { playerName: string }) => void;
  'create-room': (data: { roomName: string }) => void;
  'join-room': (data: { roomId: string; position?: PlayerPosition }) => void;
  'rejoin-room': (data: { roomId: string; position: PlayerPosition; playerName: string }) => void;
  'leave-room': () => void;
  'start-game': () => void;

  // Player approval events (host only)
  'approve-player': (data: { socketId: string; position: PlayerPosition }) => void;
  'reject-player': (data: { socketId: string }) => void;

  // Game events
  'play-card': (data: { card: Card; faceDown: boolean }) => void;
  'continue-game': () => void;

  // Dev/bot events
  'add-bot': (data: { position: PlayerPosition }) => void;
  'remove-bot': (data: { position: PlayerPosition }) => void;

  // Dev tools
  'dev-inject-rule': (data: { rule: Rule }) => void;
  'dev-set-trump': (data: { suit: string }) => void;
  'dev-reset-game': () => void;

  // WebRTC signaling
  'webrtc-offer': (data: { to: PlayerPosition; offer: RTCOfferAnswer }) => void;
  'webrtc-answer': (data: { to: PlayerPosition; answer: RTCOfferAnswer }) => void;
  'webrtc-ice-candidate': (data: { to: PlayerPosition; candidate: RTCIceCandidate }) => void;

  // Audio/Video status
  'mute-status': (data: { isMuted: boolean }) => void;

  // Chat
  'chat-message': (data: { message: string }) => void;

  // Replace disconnected player with bot
  'replace-with-bot': (data: { position: PlayerPosition }) => void;
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
  'room-joined': (data: { roomId: string; roomName: string; position: PlayerPosition; players: Array<PlayerView | null> }) => void;
  'room-updated': (data: { players: Array<PlayerView | null> }) => void;
  'room-left': () => void;

  // Player approval events
  'join-requested': (data: { roomId: string; roomName: string }) => void;
  'join-request': (data: { pending: PendingPlayer }) => void;
  'pending-players': (data: { pending: PendingPlayer[] }) => void;
  'join-approved': (data: { position: PlayerPosition }) => void;
  'join-rejected': (data: { message: string }) => void;

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

  // Action log
  'action': (data: { action: GameAction }) => void;

  // WebRTC signaling
  'webrtc-offer': (data: { from: PlayerPosition; offer: RTCOfferAnswer }) => void;
  'webrtc-answer': (data: { from: PlayerPosition; answer: RTCOfferAnswer }) => void;
  'webrtc-ice-candidate': (data: { from: PlayerPosition; candidate: RTCIceCandidate }) => void;

  // Audio/Video status
  'player-mute-status': (data: { player: PlayerPosition; isMuted: boolean }) => void;

  // Chat
  'room-chat': (data: { message: ChatMessage }) => void;

  // Player disconnect/reconnect during game
  'player-disconnected': (data: { position: PlayerPosition; playerName: string; disconnectedAt: number }) => void;
  'player-reconnected': (data: { position: PlayerPosition; playerName: string }) => void;
  'player-replaced': (data: { position: PlayerPosition }) => void;
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
