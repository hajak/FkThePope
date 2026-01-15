import type { PlayerPosition, Card, Suit } from '@fkthepope/shared';

/**
 * Player info visible to admin (includes all cards)
 */
export interface AdminPlayerInfo {
  position: PlayerPosition;
  name: string;
  isBot: boolean;
  isConnected: boolean;
  disconnectedAt: number | null;
  socketId: string;
  hand: Card[];
  tricksWon: number;
  version?: string;
  deviceType?: 'mobile' | 'desktop';
}

/**
 * Trick info visible to admin
 */
export interface AdminTrickInfo {
  cards: Array<{ card: Card; playedBy: PlayerPosition; faceDown: boolean }>;
  leadSuit: Suit | null;
  trickNumber: number;
  winner?: PlayerPosition;
}

/**
 * Full game info for admin dashboard
 */
export interface AdminGameInfo {
  roomId: string;
  roomName: string;
  status: 'waiting' | 'playing';
  phase: string;
  players: Record<PlayerPosition, AdminPlayerInfo | null>;
  currentTrick: AdminTrickInfo | null;
  completedTricks: AdminTrickInfo[];
  trumpSuit: Suit | null;
  currentPlayer: PlayerPosition | null;
  scores: Record<PlayerPosition, number>;
  handNumber: number;
  createdAt: number;
}

/**
 * Full admin dashboard state
 */
export interface AdminDashboardState {
  rooms: AdminGameInfo[];
  totalConnections: number;
  serverUptime: number;
}

/**
 * Socket events from server to admin client
 */
export interface AdminServerToClientEvents {
  'admin-state': (data: AdminDashboardState) => void;
  'room-updated': (data: AdminGameInfo) => void;
  'room-created': (data: AdminGameInfo) => void;
  'room-deleted': (data: { roomId: string }) => void;
  'error': (data: { message: string }) => void;
}

/**
 * Socket events from admin client to server
 */
export interface AdminClientToServerEvents {
  subscribe: () => void;
  unsubscribe: () => void;
}
