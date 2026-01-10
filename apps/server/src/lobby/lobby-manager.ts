import type { PlayerPosition, RoomInfo } from '@fkthepope/shared';
import { PLAYER_POSITIONS, BOT_NAMES } from '@fkthepope/shared';
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
}

/**
 * A game room
 */
export interface Room {
  id: string;
  name: string;
  hostId: string;
  players: Map<PlayerPosition, RoomPlayer>;
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
    };

    room.players.set(position, player);
    this.playerRooms.set(socketId, roomId);

    return { success: true, room, position };
  }

  /**
   * Leave a room
   */
  leaveRoom(socketId: string): { roomId?: string; wasHost: boolean; roomDeleted: boolean } {
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

    // If room is empty or host left, delete room
    if (room.players.size === 0 || wasHost) {
      // Remove all player mappings
      for (const player of room.players.values()) {
        this.playerRooms.delete(player.socketId);
      }
      this.rooms.delete(roomId);
      return { roomId, wasHost, roomDeleted: true };
    }

    return { roomId, wasHost, roomDeleted: false };
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
      name: BOT_NAMES[botPosition],
      position: botPosition,
      isBot: true,
      isReady: true,
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
}
