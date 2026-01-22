import type { Card, PlayerPosition } from './card.js';
import type { ClientGameState, GameAction } from './game.js';
import type { GameType } from './game-types.js';
import type { PlayerView } from './player.js';
import type { Rule, RuleViolation } from './rules.js';

/**
 * Room information for lobby display
 */
export interface RoomInfo {
  id: string;
  name: string;
  gameType: GameType;
  playerCount: number;
  maxPlayers: number;
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
  'create-room': (data: { roomName: string; gameType?: GameType }) => void;
  'join-room': (data: { roomId: string; position?: PlayerPosition }) => void;
  'rejoin-room': (data: { roomId: string; position: PlayerPosition; playerName: string }) => void;
  'leave-room': () => void;
  'start-game': () => void;

  // Player approval events (host only)
  'approve-player': (data: { socketId: string }) => void;
  'reject-player': (data: { socketId: string }) => void;

  // Game events (Whist)
  'play-card': (data: { card: Card; faceDown: boolean }) => void;
  'continue-game': () => void;

  // Skitgubbe events - Phase 1 (Collection)
  'skitgubbe-duel': (data: { card: Card }) => void;
  'skitgubbe-draw': () => void;
  // Skitgubbe events - Phase 2 (Shedding)
  'skitgubbe-play': (data: { card: Card }) => void;
  'skitgubbe-pickup': () => void;

  // Bridge events
  'bridge-bid': (data: { bidType: 'bid' | 'pass' | 'double' | 'redouble'; level?: number; strain?: string }) => void;
  'bridge-play': (data: { card: Card; fromDummy?: boolean }) => void;

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

  // Kick disconnected player from room
  'kick-player': (data: { position: PlayerPosition }) => void;
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
  'room-joined': (data: { roomId: string; roomName: string; gameType: GameType; maxPlayers: number; position: PlayerPosition; players: Array<PlayerView | null>; isHost: boolean }) => void;
  'room-updated': (data: { players: Array<PlayerView | null> }) => void;
  'room-left': () => void;

  // Player approval events
  'join-requested': (data: { roomId: string; roomName: string }) => void;
  'join-request': (data: { pending: PendingPlayer }) => void;
  'pending-players': (data: { pending: PendingPlayer[] }) => void;
  'join-approved': (data: { position: PlayerPosition }) => void;
  'join-rejected': (data: { message: string }) => void;

  // Game lifecycle events (generic - gameState can be any game's client state)
  'game-started': (data: { gameState: unknown; gameType: GameType }) => void;
  'game-state': (data: { gameState: unknown; gameType: GameType }) => void;
  'game-ended': (data: { finalScores: Record<PlayerPosition, number>; winner?: PlayerPosition; loser?: PlayerPosition }) => void;

  // Skitgubbe-specific events
  'skitgubbe-duel-card': (data: { player: PlayerPosition; card: Card; isLeader: boolean }) => void;
  'skitgubbe-duel-result': (data: { winner: PlayerPosition | null; isTie: boolean; tiePileCount: number }) => void;
  'skitgubbe-draw': (data: { player: PlayerPosition; isLastCard: boolean }) => void;
  'skitgubbe-phase-change': (data: { phase: 'collection' | 'shedding' | 'game_end'; trumpSuit: string | null; trumpCard: Card | null }) => void;
  'skitgubbe-trick-card': (data: { player: PlayerPosition; card: Card }) => void;
  'skitgubbe-trick-result': (data: { winner: PlayerPosition }) => void;
  'skitgubbe-pickup': (data: { player: PlayerPosition; cardsPickedUp: number }) => void;
  'skitgubbe-player-out': (data: { player: PlayerPosition }) => void;

  // Bridge-specific events
  'bridge-bid-made': (data: { player: PlayerPosition; bidType: string; level?: number; strain?: string }) => void;
  'bridge-bidding-complete': (data: { contract: unknown | null; passed: boolean }) => void;
  'bridge-dummy-revealed': (data: { dummyPosition: PlayerPosition; dummyHand: Card[] }) => void;

  // Turn events
  'your-turn': (data: { legalMoves: Array<{ card: Card; canPlayFaceDown: boolean }> }) => void;
  'waiting-for': (data: { player: PlayerPosition }) => void;

  // Play events
  'card-played': (data: { player: PlayerPosition; card: Card; faceDown: boolean; source?: 'hand' | 'faceUp' | 'faceDown' }) => void;
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
  'player-kicked': (data: { position: PlayerPosition }) => void;

  // Version control
  'version-mismatch': (data: { clientVersion: string; requiredVersion: string }) => void;
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
