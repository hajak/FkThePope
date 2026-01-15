import type { PlayerPosition, RoomInfo, PendingPlayer } from '@fkthepope/shared';
import { PLAYER_POSITIONS, getRandomBotName } from '@fkthepope/shared';
import { nanoid, playerId } from '@fkthepope/game-engine';

/**
 * Player in a room
 */
export interface RoomPlayer {
  id: string;
  socketId: string;
  name: string;
  position: PlayerPosition;
  isBot: boolean;
  isReady: boolean;
  isConnected: boolean;
  disconnectedAt: number | null;
}

/**
 * A game room
 */
export interface Room {
  id: string;
  name: string;
  hostId: string;
  players: Map<PlayerPosition, RoomPlayer>;
  pendingPlayers: Map<string, PendingPlayer>; // socketId -> PendingPlayer
  status: 'waiting' | 'playing';
  createdAt: number;
}

/**
 * Manages game rooms and player matchmaking
 */
export class LobbyManager {
  private rooms = new Map<string, Room>();
  private playerRooms = new Map<string, string>(); // socketId -> roomId

  /**
   * Create a new room
   */
  createRoom(name: string, hostSocketId: string, hostName: string): Room {
    const roomId = nanoid(8);
    const hostPlayerId = playerId();

    const room: Room = {
      id: roomId,
      name,
      hostId: hostSocketId,
      players: new Map(),
      pendingPlayers: new Map(),
      status: 'waiting',
      createdAt: Date.now(),
    };

    // Add host as first player (south by default)
    room.players.set('south', {
      id: hostPlayerId,
      socketId: hostSocketId,
      name: hostName,
      position: 'south',
      isBot: false,
      isReady: false,
      isConnected: true,
      disconnectedAt: null,
    });

    this.rooms.set(roomId, room);
    this.playerRooms.set(hostSocketId, roomId);

    return room;
  }

  /**
   * Join an existing room
   */
  joinRoom(
    roomId: string,
    socketId: string,
    playerName: string,
    preferredPosition?: PlayerPosition
  ): { success: boolean; room?: Room; position?: PlayerPosition; error?: string } {
    const room = this.rooms.get(roomId);

    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (room.status === 'playing') {
      return { success: false, error: 'Game already in progress' };
    }

    // Find available position
    let position = preferredPosition;
    if (position && room.players.has(position)) {
      position = undefined; // Preferred position taken
    }

    if (!position) {
      // Find first available position
      for (const pos of PLAYER_POSITIONS) {
        if (!room.players.has(pos)) {
          position = pos;
          break;
        }
      }
    }

    if (!position) {
      return { success: false, error: 'Room is full' };
    }

    // Add player to room
    const player: RoomPlayer = {
      id: playerId(),
      socketId,
      name: playerName,
      position,
      isBot: false,
      isReady: false,
      isConnected: true,
      disconnectedAt: null,
    };

    room.players.set(position, player);
    this.playerRooms.set(socketId, roomId);

    return { success: true, room, position };
  }

  /**
   * Leave a room (for lobby/waiting room - removes player)
   */
  leaveRoom(socketId: string): { roomId?: string; wasHost: boolean; roomDeleted: boolean; newHostId?: string } {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) {
      return { wasHost: false, roomDeleted: false };
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      this.playerRooms.delete(socketId);
      return { wasHost: false, roomDeleted: false };
    }

    // Find and remove player
    for (const [position, player] of room.players) {
      if (player.socketId === socketId) {
        room.players.delete(position);
        break;
      }
    }

    this.playerRooms.delete(socketId);

    const wasHost = room.hostId === socketId;

    // Count human players remaining (connected ones)
    const humanPlayers = Array.from(room.players.values()).filter(p => !p.isBot && p.isConnected);

    // If no human players left, delete room
    if (humanPlayers.length === 0) {
      // Remove all player mappings (bots don't have real mappings)
      for (const player of room.players.values()) {
        if (!player.isBot) {
          this.playerRooms.delete(player.socketId);
        }
      }
      this.rooms.delete(roomId);
      return { roomId, wasHost, roomDeleted: true };
    }

    // If host left but there are still human players, transfer host
    let newHostId: string | undefined;
    const firstHuman = humanPlayers[0];
    if (wasHost && firstHuman) {
      newHostId = firstHuman.socketId;
      room.hostId = newHostId;
    }

    return { roomId, wasHost, roomDeleted: false, newHostId };
  }

  /**
   * Mark a player as disconnected during an active game (keeps them in room)
   */
  markPlayerDisconnected(socketId: string): {
    roomId?: string;
    position?: PlayerPosition;
    playerName?: string;
    wasHost: boolean;
    newHostId?: string;
  } {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) {
      return { wasHost: false };
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      this.playerRooms.delete(socketId);
      return { wasHost: false };
    }

    // Find player and mark as disconnected
    let foundPosition: PlayerPosition | undefined;
    let foundPlayerName: string | undefined;
    for (const [position, player] of room.players) {
      if (player.socketId === socketId && !player.isBot) {
        player.isConnected = false;
        player.disconnectedAt = Date.now();
        foundPosition = position;
        foundPlayerName = player.name;
        break;
      }
    }

    this.playerRooms.delete(socketId);

    const wasHost = room.hostId === socketId;

    // Transfer host if needed
    let newHostId: string | undefined;
    if (wasHost) {
      // Find another connected human player
      const connectedHuman = Array.from(room.players.values()).find(p => !p.isBot && p.isConnected);
      if (connectedHuman) {
        newHostId = connectedHuman.socketId;
        room.hostId = newHostId;
      }
    }

    return { roomId, position: foundPosition, playerName: foundPlayerName, wasHost, newHostId };
  }

  /**
   * Reconnect a disconnected player
   */
  reconnectPlayer(
    roomId: string,
    position: PlayerPosition,
    newSocketId: string,
    playerName: string
  ): { success: boolean; error?: string; player?: RoomPlayer } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const player = room.players.get(position);
    if (!player) {
      return { success: false, error: 'Position not occupied' };
    }

    // Verify player name matches
    if (player.name !== playerName) {
      return { success: false, error: 'Player name mismatch' };
    }

    // Don't allow reconnecting as a bot
    if (player.isBot) {
      return { success: false, error: 'Cannot rejoin as bot' };
    }

    // Update socket and connection status
    player.socketId = newSocketId;
    player.isConnected = true;
    player.disconnectedAt = null;
    this.playerRooms.set(newSocketId, roomId);

    return { success: true, player };
  }

  /**
   * Replace a disconnected player with a bot
   */
  replaceWithBot(roomId: string, position: PlayerPosition): { success: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const player = room.players.get(position);
    if (!player) {
      return { success: false, error: 'Position not occupied' };
    }

    // Only replace disconnected human players
    if (player.isBot) {
      return { success: false, error: 'Already a bot' };
    }

    if (player.isConnected) {
      return { success: false, error: 'Player is still connected' };
    }

    // Replace with bot
    const botPlayer: RoomPlayer = {
      id: playerId(),
      socketId: `bot_${position}`,
      name: getRandomBotName(),
      position,
      isBot: true,
      isReady: true,
      isConnected: true,
      disconnectedAt: null,
    };

    room.players.set(position, botPlayer);

    return { success: true };
  }

  /**
   * Add a bot to a room
   */
  addBot(roomId: string, position?: PlayerPosition): { success: boolean; position?: PlayerPosition; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (room.status === 'playing') {
      return { success: false, error: 'Game already in progress' };
    }

    // Find available position
    let botPosition = position;
    if (botPosition && room.players.has(botPosition)) {
      botPosition = undefined;
    }

    if (!botPosition) {
      for (const pos of PLAYER_POSITIONS) {
        if (!room.players.has(pos)) {
          botPosition = pos;
          break;
        }
      }
    }

    if (!botPosition) {
      return { success: false, error: 'Room is full' };
    }

    const botPlayer: RoomPlayer = {
      id: playerId(),
      socketId: `bot_${botPosition}`,
      name: getRandomBotName(),
      position: botPosition,
      isBot: true,
      isReady: true,
      isConnected: true,
      disconnectedAt: null,
    };

    room.players.set(botPosition, botPlayer);

    return { success: true, position: botPosition };
  }

  /**
   * Remove a bot from a room
   */
  removeBot(roomId: string, position: PlayerPosition): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const player = room.players.get(position);
    if (!player || !player.isBot) return false;

    room.players.delete(position);
    return true;
  }

  /**
   * Check if a room is ready to start
   */
  canStartGame(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    return room.players.size === 4;
  }

  /**
   * Mark room as playing
   */
  startGame(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room || room.status === 'playing') return false;
    room.status = 'playing';
    return true;
  }

  /**
   * Get room info
   */
  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get player's current room
   */
  getPlayerRoom(socketId: string): Room | undefined {
    const roomId = this.playerRooms.get(socketId);
    if (!roomId) return undefined;
    return this.rooms.get(roomId);
  }

  /**
   * Get all rooms as public info
   */
  getRoomList(): RoomInfo[] {
    return Array.from(this.rooms.values()).map((room) => ({
      id: room.id,
      name: room.name,
      playerCount: room.players.size,
      maxPlayers: 4,
      status: room.status,
      players: Array.from(room.players.values()).map((p) => ({
        name: p.name,
        position: p.position,
      })),
    }));
  }

  /**
   * Get all rooms (for admin dashboard)
   */
  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Get player position in their room
   */
  getPlayerPosition(socketId: string): PlayerPosition | undefined {
    const room = this.getPlayerRoom(socketId);
    if (!room) return undefined;

    for (const [position, player] of room.players) {
      if (player.socketId === socketId) {
        return position;
      }
    }
    return undefined;
  }

  /**
   * Update a player's socket ID when they reconnect
   */
  updatePlayerSocket(
    roomId: string,
    position: PlayerPosition,
    newSocketId: string,
    playerName: string
  ): { success: boolean; error?: string; player?: RoomPlayer } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const player = room.players.get(position);
    if (!player) {
      return { success: false, error: 'Position not occupied' };
    }

    // Verify player name matches (security check)
    if (player.name !== playerName) {
      return { success: false, error: 'Player name mismatch' };
    }

    // Don't allow updating bot sockets
    if (player.isBot) {
      return { success: false, error: 'Cannot rejoin as bot' };
    }

    // Remove old socket mapping
    this.playerRooms.delete(player.socketId);

    // Update socket ID
    player.socketId = newSocketId;
    this.playerRooms.set(newSocketId, roomId);

    // Update host if this was the host
    if (room.hostId === player.socketId) {
      room.hostId = newSocketId;
    }

    return { success: true, player };
  }

  /**
   * Find a player by name in a room (for reconnection)
   */
  findPlayerByName(roomId: string, playerName: string): { position: PlayerPosition; player: RoomPlayer } | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    for (const [position, player] of room.players) {
      if (player.name === playerName && !player.isBot) {
        return { position, player };
      }
    }
    return undefined;
  }

  /**
   * Add a player to the pending list for a room
   */
  addPendingPlayer(
    roomId: string,
    socketId: string,
    playerName: string
  ): { success: boolean; error?: string; pending?: PendingPlayer } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (room.status === 'playing') {
      return { success: false, error: 'Game already in progress' };
    }

    // Check if player is already pending
    if (room.pendingPlayers.has(socketId)) {
      return { success: false, error: 'Already waiting for approval' };
    }

    // Check if room has space
    const availablePositions = PLAYER_POSITIONS.filter(pos => !room.players.has(pos));
    if (availablePositions.length === 0) {
      return { success: false, error: 'Room is full' };
    }

    const pending: PendingPlayer = {
      socketId,
      playerName,
      requestedAt: Date.now(),
    };

    room.pendingPlayers.set(socketId, pending);
    return { success: true, pending };
  }

  /**
   * Approve a pending player and add them to the room
   */
  approvePendingPlayer(
    roomId: string,
    socketId: string,
    position: PlayerPosition
  ): { success: boolean; error?: string; player?: RoomPlayer } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const pending = room.pendingPlayers.get(socketId);
    if (!pending) {
      return { success: false, error: 'Player not found in pending list' };
    }

    // Check if position is available
    if (room.players.has(position)) {
      return { success: false, error: 'Position is already taken' };
    }

    // Remove from pending and add to players
    room.pendingPlayers.delete(socketId);

    const player: RoomPlayer = {
      id: playerId(),
      socketId,
      name: pending.playerName,
      position,
      isBot: false,
      isReady: false,
      isConnected: true,
      disconnectedAt: null,
    };

    room.players.set(position, player);
    this.playerRooms.set(socketId, roomId);

    return { success: true, player };
  }

  /**
   * Reject a pending player
   */
  rejectPendingPlayer(roomId: string, socketId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    return room.pendingPlayers.delete(socketId);
  }

  /**
   * Get pending players for a room
   */
  getPendingPlayers(roomId: string): PendingPlayer[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.pendingPlayers.values());
  }

  /**
   * Remove a player from pending (e.g., when they disconnect)
   */
  removePendingPlayer(socketId: string): void {
    for (const room of this.rooms.values()) {
      room.pendingPlayers.delete(socketId);
    }
  }
}
