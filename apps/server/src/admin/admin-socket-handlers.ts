import type { Server, Socket } from 'socket.io';
import type { PlayerPosition, Card, Suit } from '@fkthepope/shared';
import { validateAdminToken } from '../analytics/index.js';
import { LobbyManager, type Room, type RoomPlayer } from '../lobby/lobby-manager.js';
import { GameManager } from '../game/game-manager.js';
import { SkitgubbeGameManager } from '../game/skitgubbe-manager.js';
import type { BaseGameManager } from '../game/base-game-manager.js';
import type {
  AdminServerToClientEvents,
  AdminClientToServerEvents,
  AdminDashboardState,
  AdminGameInfo,
  AdminPlayerInfo,
  AdminTrickInfo,
} from './types.js';

// References to main game data (set during initialization)
let lobbyManagerRef: LobbyManager;
let activeGamesRef: Map<string, BaseGameManager>;
let ioRef: Server;

// Track connected admin sockets
const adminSockets = new Set<string>();

// Track client metadata (version, device type) per socket ID
const clientMetadata = new Map<string, { version?: string; deviceType?: 'mobile' | 'desktop' }>();

/**
 * Store client metadata when they connect (called from main socket handlers)
 */
export function setClientMetadata(
  socketId: string,
  metadata: { version?: string; deviceType?: 'mobile' | 'desktop' }
): void {
  clientMetadata.set(socketId, metadata);
}

/**
 * Remove client metadata when they disconnect
 */
export function removeClientMetadata(socketId: string): void {
  clientMetadata.delete(socketId);
}

/**
 * Setup admin socket namespace handlers
 */
export function setupAdminSocketHandlers(
  io: Server,
  lobbyManager: LobbyManager,
  activeGames: Map<string, BaseGameManager>
): void {
  lobbyManagerRef = lobbyManager;
  activeGamesRef = activeGames;
  ioRef = io;

  // Create admin namespace
  const adminNamespace = io.of('/admin');

  // Authentication middleware
  adminNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token || !validateAdminToken(token)) {
      console.log('[Admin] Connection rejected: invalid token');
      return next(new Error('Unauthorized'));
    }
    console.log('[Admin] Connection authorized');
    next();
  });

  // Handle admin connections
  adminNamespace.on('connection', (socket: Socket<AdminClientToServerEvents, AdminServerToClientEvents>) => {
    console.log(`[Admin] Client connected: ${socket.id}`);
    adminSockets.add(socket.id);

    // Handle subscribe event - send full state
    socket.on('subscribe', () => {
      console.log(`[Admin] Client subscribed: ${socket.id}`);
      const state = buildFullAdminState();
      socket.emit('admin-state', state);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`[Admin] Client disconnected: ${socket.id}`);
      adminSockets.delete(socket.id);
    });

    // Handle kill-room request
    socket.on('kill-room', ({ roomId }) => {
      console.log(`[Admin] Kill room request: ${roomId}`);
      handleKillRoom(roomId, socket);
    });
  });
}

/**
 * Build complete admin state from all rooms
 */
function buildFullAdminState(): AdminDashboardState {
  const rooms: AdminGameInfo[] = [];

  for (const room of lobbyManagerRef.getAllRooms()) {
    const gameInfo = buildAdminGameInfo(room.id);
    if (gameInfo) {
      rooms.push(gameInfo);
    }
  }

  return {
    rooms,
    totalConnections: ioRef?.engine?.clientsCount ?? 0,
    serverUptime: process.uptime(),
  };
}

// Type for Whist admin state (what GameManager.getAdminState returns)
interface WhistAdminState {
  phase: string;
  players: Record<PlayerPosition, { hand: Card[]; tricksWon: number; name: string; isBot: boolean } | null>;
  currentTrick: {
    cards: Array<{ card: Card; playedBy: PlayerPosition; faceDown: boolean }>;
    leadSuit: Suit | null;
    trickNumber: number;
  } | null;
  completedTricks: Array<{
    cards: Array<{ card: Card; playedBy: PlayerPosition; faceDown: boolean }>;
    winner: PlayerPosition;
  }>;
  trumpSuit: Suit | null;
  currentPlayer: PlayerPosition | null;
  scores: Record<PlayerPosition, number>;
  handNumber: number;
}

// Type for Skitgubbe admin state (matches SkitgubbeState from game-engine)
interface SkitgubbeAdminState {
  phase: string;
  players: Record<PlayerPosition, {
    hand: Card[];
    collectedCards: Card[];
    name: string;
    isBot: boolean;
    isOut: boolean;
  } | null>;
  drawPile: Card[];
  currentDuel: unknown | null;
  tiePile: Card[];
  currentTrick: unknown | null;
  pile: Card[];
  currentPlayer: PlayerPosition | null;
  finishOrder: PlayerPosition[];
  loser: PlayerPosition | null;
}

/**
 * Build admin info for a single room
 */
function buildAdminGameInfo(roomId: string): AdminGameInfo | null {
  const room = lobbyManagerRef.getRoom(roomId);
  if (!room) return null;

  const game = activeGamesRef.get(roomId);
  const isWhist = game instanceof GameManager;
  const isSkitgubbe = game instanceof SkitgubbeGameManager;

  const whistState = isWhist ? game.getAdminState() as WhistAdminState : null;
  const skitgubbeState = isSkitgubbe ? game.getAdminState() as SkitgubbeAdminState : null;

  // Build player info for each position
  const players: Record<PlayerPosition, AdminPlayerInfo | null> = {
    north: null,
    east: null,
    south: null,
    west: null,
  };

  for (const [position, roomPlayer] of room.players) {
    const metadata = clientMetadata.get(roomPlayer.socketId);

    if (isWhist && whistState) {
      const gamePlayer = whistState.players[position];
      players[position] = {
        position,
        name: roomPlayer.name,
        isBot: roomPlayer.isBot,
        isConnected: roomPlayer.isConnected,
        disconnectedAt: roomPlayer.disconnectedAt,
        socketId: roomPlayer.socketId,
        hand: gamePlayer?.hand ?? [],
        tricksWon: gamePlayer?.tricksWon ?? 0,
        version: metadata?.version,
        deviceType: metadata?.deviceType,
      };
    } else if (isSkitgubbe && skitgubbeState) {
      const gamePlayer = skitgubbeState.players[position];
      players[position] = {
        position,
        name: roomPlayer.name,
        isBot: roomPlayer.isBot,
        isConnected: roomPlayer.isConnected,
        disconnectedAt: roomPlayer.disconnectedAt,
        socketId: roomPlayer.socketId,
        hand: gamePlayer?.hand ?? [],
        tricksWon: 0,
        isOut: gamePlayer?.isOut ?? false,
        version: metadata?.version,
        deviceType: metadata?.deviceType,
      };
    } else {
      // No game or unsupported game type
      players[position] = {
        position,
        name: roomPlayer.name,
        isBot: roomPlayer.isBot,
        isConnected: roomPlayer.isConnected,
        disconnectedAt: roomPlayer.disconnectedAt,
        socketId: roomPlayer.socketId,
        hand: [],
        tricksWon: 0,
        version: metadata?.version,
        deviceType: metadata?.deviceType,
      };
    }
  }

  // Build current trick info (Whist only - Skitgubbe uses pile instead)
  let currentTrick: AdminTrickInfo | null = null;
  if (whistState?.currentTrick) {
    currentTrick = {
      cards: whistState.currentTrick.cards,
      leadSuit: whistState.currentTrick.leadSuit,
      trickNumber: whistState.currentTrick.trickNumber,
    };
  }

  // Build completed tricks (Whist only)
  const completedTricks: AdminTrickInfo[] = whistState?.completedTricks?.map((t: WhistAdminState['completedTricks'][number]) => ({
    cards: t.cards,
    leadSuit: null,
    trickNumber: 0,
    winner: t.winner,
  })) ?? [];

  return {
    roomId: room.id,
    roomName: room.name,
    gameType: room.gameType,
    status: room.status,
    phase: whistState?.phase ?? skitgubbeState?.phase ?? 'waiting',
    players,
    currentTrick,
    completedTricks,
    trumpSuit: whistState?.trumpSuit ?? null,
    currentPlayer: whistState?.currentPlayer ?? skitgubbeState?.currentPlayer ?? null,
    scores: whistState?.scores ?? { north: 0, east: 0, south: 0, west: 0 },
    handNumber: whistState?.handNumber ?? 0,
    createdAt: room.createdAt,
    // Skitgubbe-specific
    pile: skitgubbeState?.pile ? { cards: skitgubbeState.pile, topCard: skitgubbeState.pile[skitgubbeState.pile.length - 1] ?? null } : undefined,
    discardCount: skitgubbeState?.tiePile?.length,
    loser: skitgubbeState?.loser,
  };
}

/**
 * Notify all admin clients of a room update
 * Call this from socket-handlers when game state changes
 */
export function notifyAdminOfRoomUpdate(roomId: string): void {
  if (adminSockets.size === 0) return;

  const gameInfo = buildAdminGameInfo(roomId);
  if (!gameInfo) return;

  const adminNamespace = ioRef?.of('/admin');
  if (adminNamespace) {
    adminNamespace.emit('room-updated', gameInfo);
  }
}

/**
 * Notify all admin clients of a new room
 */
export function notifyAdminOfRoomCreated(roomId: string): void {
  if (adminSockets.size === 0) return;

  const gameInfo = buildAdminGameInfo(roomId);
  if (!gameInfo) return;

  const adminNamespace = ioRef?.of('/admin');
  if (adminNamespace) {
    adminNamespace.emit('room-created', gameInfo);
  }
}

/**
 * Notify all admin clients of a deleted room
 */
export function notifyAdminOfRoomDeleted(roomId: string): void {
  if (adminSockets.size === 0) return;

  const adminNamespace = ioRef?.of('/admin');
  if (adminNamespace) {
    adminNamespace.emit('room-deleted', { roomId });
  }
}

/**
 * Handle admin kill-room request
 */
function handleKillRoom(
  roomId: string,
  socket: Socket<AdminClientToServerEvents, AdminServerToClientEvents>
): void {
  const result = lobbyManagerRef.forceDeleteRoom(roomId);

  if (!result.success) {
    socket.emit('error', { message: `Room ${roomId} not found` });
    return;
  }

  // Clean up active game if exists
  activeGamesRef.delete(roomId);

  // Notify all players in the room that they've been kicked
  for (const socketId of result.socketIds) {
    const playerSocket = ioRef?.sockets.sockets.get(socketId);
    if (playerSocket) {
      playerSocket.emit('room-left');
      playerSocket.leave(roomId);
      playerSocket.data.roomId = null;
      playerSocket.data.position = null;
    }
  }

  // Update lobby for all clients
  ioRef?.emit('lobby-state', { rooms: lobbyManagerRef.getRoomList() });

  // Notify all admin clients
  notifyAdminOfRoomDeleted(roomId);

  console.log(`[Admin] Room ${roomId} killed, ${result.socketIds.length} players removed`);
}
