import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  PlayerPosition,
} from '@fkthepope/shared';
import { toPlayerView } from '@fkthepope/shared';
import { LobbyManager } from '../lobby/lobby-manager.js';
import { GameManager } from '../game/game-manager.js';
import { playerId } from '@fkthepope/game-engine';
import {
  validateData,
  JoinLobbySchema,
  CreateRoomSchema,
  JoinRoomSchema,
  RejoinRoomSchema,
  PlayCardSchema,
  AddBotSchema,
  RemoveBotSchema,
  ReplaceWithBotSchema,
  ApprovePlayerSchema,
  RejectPlayerSchema,
} from '../validation/schemas.js';
import { AnalyticsManager } from '../analytics/index.js';

// Required client version - clients must match this exactly
const REQUIRED_VERSION = '1.31';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;
type GameServer = Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

const lobbyManager = new LobbyManager();
const activeGames = new Map<string, GameManager>();
// Track which players have clicked "Continue" after a hand completes
const pendingContinues = new Map<string, Set<PlayerPosition>>();

/**
 * Setup socket event handlers
 */
export function setupSocketHandlers(io: GameServer): void {
  io.on('connection', (socket: GameSocket) => {
    console.log(`Client connected: ${socket.id}`);

    // Initialize socket data
    socket.data.playerId = playerId();
    socket.data.playerName = 'Guest';
    socket.data.roomId = null;
    socket.data.position = null;

    // Track analytics session
    const auth = socket.handshake.auth as { clientId?: string; deviceType?: string; version?: string } | undefined;
    const clientId = auth?.clientId || `anon_${socket.id}`;
    const deviceType = (auth?.deviceType === 'mobile' ? 'mobile' : 'desktop') as 'mobile' | 'desktop';
    const clientVersion = auth?.version || 'unknown';
    const ip = socket.handshake.headers['x-forwarded-for']?.toString().split(',')[0]
      || socket.handshake.address
      || '';

    // Check version - if mismatch or unknown (old client), notify and disconnect
    if (clientVersion !== REQUIRED_VERSION) {
      console.log(`[Socket] Version mismatch: client ${clientVersion}, required ${REQUIRED_VERSION}`);
      // Emit both events - new clients handle version-mismatch, old clients see error
      socket.emit('version-mismatch', { clientVersion, requiredVersion: REQUIRED_VERSION });
      socket.emit('error', {
        message: `Your game is outdated (v${clientVersion}). Please refresh the page (Ctrl+Shift+R or Cmd+Shift+R) to get the latest version (v${REQUIRED_VERSION}).`,
        code: 'VERSION_MISMATCH'
      });
      setTimeout(() => socket.disconnect(true), 2000); // Give time for messages to be shown
      return;
    }

    AnalyticsManager.getInstance().startSession(socket.id, clientId, deviceType, ip, clientVersion);

    // Send connection confirmation
    socket.emit('connected', { playerId: socket.data.playerId });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      // End analytics session
      AnalyticsManager.getInstance().endSession(socket.id);
      // Remove from any pending lists
      lobbyManager.removePendingPlayer(socket.id);
      handleDisconnect(socket, io);
    });

    // Lobby events
    socket.on('join-lobby', (data) => handleJoinLobby(socket, io, data));
    socket.on('create-room', (data) => handleCreateRoom(socket, io, data));
    socket.on('join-room', (data) => handleJoinRoom(socket, io, data));
    socket.on('rejoin-room', (data) => handleRejoinRoom(socket, io, data));
    socket.on('leave-room', () => handleLeaveRoom(socket, io));
    socket.on('start-game', () => handleStartGame(socket, io));

    // Game events
    socket.on('play-card', (data) => handlePlayCard(socket, io, data));
    socket.on('continue-game', () => handleContinueGame(socket, io));

    // Bot events
    socket.on('add-bot', (data) => handleAddBot(socket, io, data));
    socket.on('remove-bot', (data) => handleRemoveBot(socket, io, data));
    socket.on('replace-with-bot', (data) => handleReplaceWithBot(socket, io, data));

    // Player approval events (host only)
    socket.on('approve-player', (data) => handleApprovePlayer(socket, io, data));
    socket.on('reject-player', (data) => handleRejectPlayer(socket, io, data));

    // Dev events
    socket.on('dev-reset-game', () => handleDevReset(socket, io));

    // WebRTC signaling - relay to target player
    socket.on('webrtc-offer', ({ to, offer }) => {
      const roomId = socket.data.roomId;
      const from = socket.data.position;
      if (roomId && from) {
        const room = lobbyManager.getRoom(roomId);
        const targetPlayer = room?.players.get(to);
        if (targetPlayer && !targetPlayer.isBot) {
          const targetSocket = io.sockets.sockets.get(targetPlayer.socketId);
          targetSocket?.emit('webrtc-offer', { from, offer });
        }
      }
    });

    socket.on('webrtc-answer', ({ to, answer }) => {
      const roomId = socket.data.roomId;
      const from = socket.data.position;
      if (roomId && from) {
        const room = lobbyManager.getRoom(roomId);
        const targetPlayer = room?.players.get(to);
        if (targetPlayer && !targetPlayer.isBot) {
          const targetSocket = io.sockets.sockets.get(targetPlayer.socketId);
          targetSocket?.emit('webrtc-answer', { from, answer });
        }
      }
    });

    socket.on('webrtc-ice-candidate', ({ to, candidate }) => {
      const roomId = socket.data.roomId;
      const from = socket.data.position;
      if (roomId && from) {
        const room = lobbyManager.getRoom(roomId);
        const targetPlayer = room?.players.get(to);
        if (targetPlayer && !targetPlayer.isBot) {
          const targetSocket = io.sockets.sockets.get(targetPlayer.socketId);
          targetSocket?.emit('webrtc-ice-candidate', { from, candidate });
        }
      }
    });

    // Mute status - broadcast to all other players in room
    socket.on('mute-status', ({ isMuted }) => {
      const roomId = socket.data.roomId;
      const position = socket.data.position;
      if (roomId && position) {
        socket.to(roomId).emit('player-mute-status', { player: position, isMuted });
      }
    });

    // Chat - broadcast to all players in room (including sender)
    socket.on('chat-message', ({ message }) => {
      const roomId = socket.data.roomId;
      const playerName = socket.data.playerName;
      if (roomId && message.trim()) {
        const chatMessage = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          playerName,
          message: message.trim().slice(0, 200), // Limit message length
          timestamp: Date.now(),
        };
        io.to(roomId).emit('room-chat', { message: chatMessage });
      }
    });
  });
}

/**
 * Handle player joining lobby
 */
function handleJoinLobby(
  socket: GameSocket,
  io: GameServer,
  data: unknown
): void {
  const validation = validateData(JoinLobbySchema, data);
  if (!validation.success) {
    socket.emit('error', { message: `Invalid data: ${validation.error}`, code: 'VALIDATION_ERROR' });
    return;
  }

  socket.data.playerName = validation.data.playerName;

  // Track player name for analytics
  AnalyticsManager.getInstance().updateSessionPlayerName(socket.id, validation.data.playerName);

  socket.emit('lobby-state', { rooms: lobbyManager.getRoomList() });
}

/**
 * Handle room creation
 */
function handleCreateRoom(
  socket: GameSocket,
  io: GameServer,
  data: unknown
): void {
  const validation = validateData(CreateRoomSchema, data);
  if (!validation.success) {
    socket.emit('error', { message: `Invalid data: ${validation.error}`, code: 'VALIDATION_ERROR' });
    return;
  }

  const room = lobbyManager.createRoom(validation.data.roomName, socket.id, socket.data.playerName);

  socket.join(room.id);
  socket.data.roomId = room.id;
  socket.data.position = 'south';

  socket.emit('room-joined', {
    roomId: room.id,
    roomName: room.name,
    position: 'south',
    players: getPlayerViews(room.id),
    isHost: true, // Creator is always host
  });

  // Broadcast updated room list
  io.emit('lobby-state', { rooms: lobbyManager.getRoomList() });
}

/**
 * Handle joining a room - adds player to pending list for host approval
 */
function handleJoinRoom(
  socket: GameSocket,
  io: GameServer,
  data: unknown
): void {
  const validation = validateData(JoinRoomSchema, data);
  if (!validation.success) {
    socket.emit('error', { message: `Invalid data: ${validation.error}`, code: 'VALIDATION_ERROR' });
    return;
  }

  const { roomId } = validation.data;
  const room = lobbyManager.getRoom(roomId);

  if (!room) {
    socket.emit('error', { message: 'Room not found', code: 'ROOM_NOT_FOUND' });
    return;
  }

  // Add to pending list instead of joining directly
  const result = lobbyManager.addPendingPlayer(roomId, socket.id, socket.data.playerName);

  if (!result.success) {
    socket.emit('error', { message: result.error!, code: 'JOIN_FAILED' });
    return;
  }

  // Tell the player they're waiting for approval
  socket.emit('join-requested', { roomId, roomName: room.name });

  // Notify host of new pending player
  const hostSocket = io.sockets.sockets.get(room.hostId);
  if (hostSocket) {
    hostSocket.emit('join-request', { pending: result.pending! });
  }
}

/**
 * Handle rejoining a room after disconnect
 */
function handleRejoinRoom(
  socket: GameSocket,
  io: GameServer,
  data: unknown
): void {
  const validation = validateData(RejoinRoomSchema, data);
  if (!validation.success) {
    socket.emit('error', { message: `Invalid data: ${validation.error}`, code: 'VALIDATION_ERROR' });
    return;
  }

  const { roomId, position, playerName } = validation.data;
  const room = lobbyManager.getRoom(roomId);

  if (!room) {
    socket.emit('error', { message: 'Room no longer exists', code: 'ROOM_NOT_FOUND' });
    return;
  }

  // Check if position is available or occupied by a disconnected player
  const existingPlayer = room.players.get(position);
  if (existingPlayer && !existingPlayer.isBot) {
    // Position is occupied - check if same player name (simple reconnect check)
    if (existingPlayer.name !== playerName) {
      socket.emit('error', { message: 'Position is already taken', code: 'POSITION_TAKEN' });
      return;
    }
    // Same player reconnecting - update their socket
    lobbyManager.updatePlayerSocket(roomId, position, socket.id, playerName);
  } else if (existingPlayer?.isBot) {
    // Replace bot with human player
    lobbyManager.removeBot(roomId, position);
    const result = lobbyManager.joinRoom(roomId, socket.id, playerName, position);
    if (!result.success) {
      socket.emit('error', { message: result.error!, code: 'REJOIN_FAILED' });
      return;
    }
  } else {
    // Position is empty - join normally
    const result = lobbyManager.joinRoom(roomId, socket.id, playerName, position);
    if (!result.success) {
      socket.emit('error', { message: result.error!, code: 'REJOIN_FAILED' });
      return;
    }
  }

  socket.data.playerName = playerName;
  socket.join(roomId);
  socket.data.roomId = roomId;
  socket.data.position = position;

  socket.emit('room-joined', {
    roomId,
    roomName: room.name,
    position,
    players: getPlayerViews(roomId),
    isHost: room.hostId === socket.id,
  });

  // If game is in progress, send current game state
  const gameManager = activeGames.get(roomId);
  if (gameManager) {
    socket.emit('game-started', {
      gameState: gameManager.getClientState(position),
    });
  }

  // Notify other players
  socket.to(roomId).emit('room-updated', {
    players: getPlayerViews(roomId),
  });

  io.emit('lobby-state', { rooms: lobbyManager.getRoomList() });
}

/**
 * Handle socket disconnect (different from intentional leave)
 */
function handleDisconnect(socket: GameSocket, io: GameServer): void {
  const roomId = socket.data.roomId;
  if (!roomId) return;

  const room = lobbyManager.getRoom(roomId);
  if (!room) return;

  // Check if game is in progress
  const gameInProgress = activeGames.has(roomId);

  if (gameInProgress) {
    // Mark player as disconnected but keep them in the room
    const result = lobbyManager.markPlayerDisconnected(socket.id);

    if (result.roomId && result.position && result.playerName) {
      socket.leave(result.roomId);

      // Notify other players about the disconnection
      io.to(result.roomId).emit('player-disconnected', {
        position: result.position,
        playerName: result.playerName,
        disconnectedAt: Date.now(),
      });

      // Update room with new player states
      io.to(result.roomId).emit('room-updated', {
        players: getPlayerViews(result.roomId),
      });

      // If disconnected player was current turn, process bot turn logic
      const gameManager = activeGames.get(result.roomId);
      if (gameManager) {
        const currentPlayer = gameManager.getCurrentPlayer();
        if (currentPlayer === result.position) {
          // Auto-play for disconnected player after a delay, or wait for replacement
          // For now, just broadcast who we're waiting for
          io.to(result.roomId).emit('waiting-for', { player: currentPlayer });
        }
      }
    }
  } else {
    // In lobby/waiting room - remove player completely
    handleLeaveRoom(socket, io);
  }
}

/**
 * Handle leaving a room (intentional leave)
 */
function handleLeaveRoom(socket: GameSocket, io: GameServer): void {
  const result = lobbyManager.leaveRoom(socket.id);

  if (result.roomId) {
    socket.leave(result.roomId);

    if (!result.roomDeleted) {
      // Notify remaining players
      io.to(result.roomId).emit('room-updated', {
        players: getPlayerViews(result.roomId),
      });
    } else {
      // Only clean up game if room is deleted (no human players left)
      // Track game end if there was an active game
      if (activeGames.has(result.roomId)) {
        AnalyticsManager.getInstance().recordGameEnded(result.roomId);
      }
      activeGames.delete(result.roomId);
    }
  }

  socket.data.roomId = null;
  socket.data.position = null;

  socket.emit('room-left');
  io.emit('lobby-state', { rooms: lobbyManager.getRoomList() });
}

/**
 * Handle starting a game
 */
function handleStartGame(socket: GameSocket, io: GameServer): void {
  const roomId = socket.data.roomId;
  if (!roomId) {
    socket.emit('error', { message: 'Not in a room', code: 'NOT_IN_ROOM' });
    return;
  }

  const room = lobbyManager.getRoom(roomId);
  if (!room) {
    socket.emit('error', { message: 'Room not found', code: 'ROOM_NOT_FOUND' });
    return;
  }

  // Only host can start the game
  if (room.hostId !== socket.id) {
    socket.emit('error', { message: 'Only the room creator can start the game', code: 'NOT_HOST' });
    return;
  }

  if (!lobbyManager.canStartGame(roomId)) {
    socket.emit('error', { message: 'Need 4 players to start', code: 'NOT_ENOUGH_PLAYERS' });
    return;
  }

  lobbyManager.startGame(roomId);

  // Create game manager
  const gameManager = new GameManager(room);
  activeGames.set(roomId, gameManager);

  // Track game started
  AnalyticsManager.getInstance().recordGameStarted(roomId, room.players.size);

  // Track players in the game
  for (const [_pos, player] of room.players) {
    if (!player.isBot) {
      AnalyticsManager.getInstance().recordPlayerJoinedRoom(player.socketId, roomId);
      AnalyticsManager.getInstance().recordPlayerPlayedGame(player.socketId);
    }
  }

  // Start first hand
  const { trumpSuit, hands } = gameManager.startHand();

  // Send game state to each player
  for (const [position, player] of room.players) {
    if (!player.isBot) {
      const playerSocket = io.sockets.sockets.get(player.socketId);
      if (playerSocket) {
        playerSocket.emit('game-started', {
          gameState: gameManager.getClientState(position),
        });
        playerSocket.emit('hand-started', {
          handNumber: 1,
          trumpSuit,
          yourHand: hands[position],
        });
      }
    }
  }

  // Notify whose turn it is
  broadcastTurn(io, roomId, gameManager);

  // Update lobby
  io.emit('lobby-state', { rooms: lobbyManager.getRoomList() });

  // Process bot turns if the first player is a bot
  processBotTurns(io, roomId, gameManager);
}

/**
 * Handle playing a card
 */
function handlePlayCard(
  socket: GameSocket,
  io: GameServer,
  data: unknown
): void {
  const validation = validateData(PlayCardSchema, data);
  if (!validation.success) {
    socket.emit('error', { message: `Invalid data: ${validation.error}`, code: 'VALIDATION_ERROR' });
    return;
  }

  const roomId = socket.data.roomId;
  const position = socket.data.position;

  if (!roomId || !position) {
    socket.emit('error', { message: 'Not in a game', code: 'NOT_IN_GAME' });
    return;
  }

  const gameManager = activeGames.get(roomId);
  if (!gameManager) {
    socket.emit('error', { message: 'Game not found', code: 'GAME_NOT_FOUND' });
    return;
  }

  const { card: cardData, faceDown } = validation.data;
  const card = { suit: cardData.suit, rank: cardData.rank } as import('@fkthepope/shared').Card;
  const result = gameManager.playCard(position, card, faceDown);

  if (!result.success) {
    socket.emit('play-rejected', {
      violation: {
        ruleId: 'base',
        ruleName: 'Game Rules',
        message: result.error!,
        attemptedCard: card,
      },
    });
    return;
  }

  // Broadcast the play
  io.to(roomId).emit('card-played', {
    player: position,
    card,
    faceDown,
  });

  // Handle trick completion
  if (result.trickComplete) {
    io.to(roomId).emit('trick-complete', {
      winner: result.trickWinner!,
      trickNumber: gameManager.getServerState().currentHand?.tricksPlayed ?? 0,
    });

    // Handle hand completion
    if (result.handComplete) {
      const serverState = gameManager.getServerState();
      const tricks = {
        north: serverState.players.north?.tricksWon ?? 0,
        east: serverState.players.east?.tricksWon ?? 0,
        south: serverState.players.south?.tricksWon ?? 0,
        west: serverState.players.west?.tricksWon ?? 0,
      };
      io.to(roomId).emit('hand-complete', {
        winner: result.handWinner!,
        tricks,
      });

      // Check if there are human players - if so, wait for them to continue
      const room = lobbyManager.getRoom(roomId);
      const humanPlayers = room ? getHumanPlayers(room) : [];

      if (humanPlayers.length > 0) {
        // Initialize pending continues for this room
        pendingContinues.set(roomId, new Set());
      } else {
        // All bots - start next hand after a delay
        setTimeout(() => {
          startNextHand(io, roomId, gameManager);
        }, 3000);
      }
      return; // Don't process bot turns or broadcast state yet
    }

    // Add delay before clearing trick and continuing
    // Wait 2.75s to ensure all clients see the 4th card and animation completes (+10%)
    setTimeout(() => {
      broadcastGameState(io, roomId, gameManager);
      processBotTurns(io, roomId, gameManager);
    }, 2750);
  } else {
    // No trick complete - broadcast immediately
    broadcastGameState(io, roomId, gameManager);
    processBotTurns(io, roomId, gameManager);
  }
}

/**
 * Handle adding a bot
 */
function handleAddBot(
  socket: GameSocket,
  io: GameServer,
  data: unknown
): void {
  const validation = validateData(AddBotSchema, data);
  if (!validation.success) {
    socket.emit('error', { message: `Invalid data: ${validation.error}`, code: 'VALIDATION_ERROR' });
    return;
  }

  const roomId = socket.data.roomId;
  if (!roomId) {
    socket.emit('error', { message: 'Not in a room', code: 'NOT_IN_ROOM' });
    return;
  }

  const result = lobbyManager.addBot(roomId, validation.data.position as PlayerPosition);
  if (!result.success) {
    socket.emit('error', { message: result.error!, code: 'ADD_BOT_FAILED' });
    return;
  }

  io.to(roomId).emit('room-updated', {
    players: getPlayerViews(roomId),
  });
}

/**
 * Handle removing a bot
 */
function handleRemoveBot(
  socket: GameSocket,
  io: GameServer,
  data: unknown
): void {
  const validation = validateData(RemoveBotSchema, data);
  if (!validation.success) {
    socket.emit('error', { message: `Invalid data: ${validation.error}`, code: 'VALIDATION_ERROR' });
    return;
  }

  const roomId = socket.data.roomId;
  if (!roomId) {
    socket.emit('error', { message: 'Not in a room', code: 'NOT_IN_ROOM' });
    return;
  }

  if (lobbyManager.removeBot(roomId, validation.data.position as PlayerPosition)) {
    io.to(roomId).emit('room-updated', {
      players: getPlayerViews(roomId),
    });
  }
}

/**
 * Handle replacing a disconnected player with a bot
 */
function handleReplaceWithBot(
  socket: GameSocket,
  io: GameServer,
  data: unknown
): void {
  const validation = validateData(ReplaceWithBotSchema, data);
  if (!validation.success) {
    socket.emit('error', { message: `Invalid data: ${validation.error}`, code: 'VALIDATION_ERROR' });
    return;
  }

  const roomId = socket.data.roomId;
  if (!roomId) {
    socket.emit('error', { message: 'Not in a room', code: 'NOT_IN_ROOM' });
    return;
  }

  const position = validation.data.position as PlayerPosition;
  const result = lobbyManager.replaceWithBot(roomId, position);

  if (!result.success) {
    socket.emit('error', { message: result.error!, code: 'REPLACE_FAILED' });
    return;
  }

  // Notify all players in room
  io.to(roomId).emit('player-replaced', { position });
  io.to(roomId).emit('room-updated', {
    players: getPlayerViews(roomId),
  });

  // If game is in progress, broadcast game state and process bot turn if needed
  const gameManager = activeGames.get(roomId);
  if (gameManager) {
    broadcastGameState(io, roomId, gameManager);

    // If it's now the bot's turn, process it
    const currentPlayer = gameManager.getCurrentPlayer();
    if (currentPlayer === position) {
      processBotTurns(io, roomId, gameManager);
    }
  }
}

/**
 * Handle host approving a pending player
 */
function handleApprovePlayer(
  socket: GameSocket,
  io: GameServer,
  data: unknown
): void {
  const validation = validateData(ApprovePlayerSchema, data);
  if (!validation.success) {
    socket.emit('error', { message: `Invalid data: ${validation.error}`, code: 'VALIDATION_ERROR' });
    return;
  }

  const roomId = socket.data.roomId;
  if (!roomId) {
    socket.emit('error', { message: 'Not in a room', code: 'NOT_IN_ROOM' });
    return;
  }

  const room = lobbyManager.getRoom(roomId);
  if (!room) {
    socket.emit('error', { message: 'Room not found', code: 'ROOM_NOT_FOUND' });
    return;
  }

  // Only host can approve players
  if (room.hostId !== socket.id) {
    socket.emit('error', { message: 'Only host can approve players', code: 'NOT_HOST' });
    return;
  }

  const { socketId } = validation.data;

  // Find first available position
  const positions: PlayerPosition[] = ['north', 'east', 'south', 'west'];
  const availablePosition = positions.find(pos => !room.players.has(pos));

  if (!availablePosition) {
    socket.emit('error', { message: 'Room is full', code: 'ROOM_FULL' });
    return;
  }

  const result = lobbyManager.approvePendingPlayer(roomId, socketId, availablePosition);

  if (!result.success) {
    socket.emit('error', { message: result.error!, code: 'APPROVE_FAILED' });
    return;
  }

  // Get the approved player's socket
  const approvedSocket = io.sockets.sockets.get(socketId);
  if (approvedSocket) {
    // Join them to the room
    approvedSocket.join(roomId);
    approvedSocket.data.roomId = roomId;
    approvedSocket.data.position = availablePosition;

    // Tell them they've been approved
    approvedSocket.emit('join-approved', { position: availablePosition });
    approvedSocket.emit('room-joined', {
      roomId,
      roomName: room.name,
      position: availablePosition,
      players: getPlayerViews(roomId),
      isHost: false, // Approved players are never host
    });
  }

  // Notify all players in room of the update
  io.to(roomId).emit('room-updated', {
    players: getPlayerViews(roomId),
  });

  // Send updated pending list to host
  socket.emit('pending-players', { pending: lobbyManager.getPendingPlayers(roomId) });

  // Broadcast updated room list to lobby
  io.emit('lobby-state', { rooms: lobbyManager.getRoomList() });
}

/**
 * Handle host rejecting a pending player
 */
function handleRejectPlayer(
  socket: GameSocket,
  io: GameServer,
  data: unknown
): void {
  const validation = validateData(RejectPlayerSchema, data);
  if (!validation.success) {
    socket.emit('error', { message: `Invalid data: ${validation.error}`, code: 'VALIDATION_ERROR' });
    return;
  }

  const roomId = socket.data.roomId;
  if (!roomId) {
    socket.emit('error', { message: 'Not in a room', code: 'NOT_IN_ROOM' });
    return;
  }

  const room = lobbyManager.getRoom(roomId);
  if (!room) {
    socket.emit('error', { message: 'Room not found', code: 'ROOM_NOT_FOUND' });
    return;
  }

  // Only host can reject players
  if (room.hostId !== socket.id) {
    socket.emit('error', { message: 'Only host can reject players', code: 'NOT_HOST' });
    return;
  }

  const { socketId } = validation.data;
  lobbyManager.rejectPendingPlayer(roomId, socketId);

  // Notify the rejected player
  const rejectedSocket = io.sockets.sockets.get(socketId);
  if (rejectedSocket) {
    rejectedSocket.emit('join-rejected', { message: 'Your request to join was declined' });
  }

  // Send updated pending list to host
  socket.emit('pending-players', { pending: lobbyManager.getPendingPlayers(roomId) });
}

/**
 * Handle dev reset
 */
function handleDevReset(socket: GameSocket, io: GameServer): void {
  const roomId = socket.data.roomId;
  if (!roomId) return;

  activeGames.delete(roomId);

  const room = lobbyManager.getRoom(roomId);
  if (room) {
    room.status = 'waiting';
    io.to(roomId).emit('room-updated', {
      players: getPlayerViews(roomId),
    });
  }
}

/**
 * Start the next hand
 */
function startNextHand(
  io: GameServer,
  roomId: string,
  gameManager: GameManager
): void {
  const room = lobbyManager.getRoom(roomId);
  if (!room) return;

  // Start next hand
  gameManager.startNextHand();
  const { trumpSuit, hands } = gameManager.startHand();

  // Send hand-started to human players
  for (const [pos, player] of room.players) {
    if (!player.isBot) {
      const playerSocket = io.sockets.sockets.get(player.socketId);
      if (playerSocket) {
        playerSocket.emit('hand-started', {
          handNumber: gameManager.getServerState().currentHand?.number ?? 1,
          trumpSuit,
          yourHand: hands[pos],
        });
      }
    }
  }

  broadcastGameState(io, roomId, gameManager);
  broadcastTurn(io, roomId, gameManager);
  processBotTurns(io, roomId, gameManager);
}

/**
 * Process bot turns automatically
 */
async function processBotTurns(
  io: GameServer,
  roomId: string,
  gameManager: GameManager
): Promise<void> {
  const room = lobbyManager.getRoom(roomId);
  if (!room) return;

  let currentPlayer = gameManager.getCurrentPlayer();

  while (currentPlayer) {
    const player = room.players.get(currentPlayer);
    if (!player?.isBot) {
      broadcastTurn(io, roomId, gameManager);
      break;
    }

    // Add small delay for visual effect
    await new Promise((resolve) => setTimeout(resolve, 500));

    const move = gameManager.getBotMove(currentPlayer);
    if (!move) break;

    const result = gameManager.playCard(currentPlayer, move.card, move.faceDown);

    io.to(roomId).emit('card-played', {
      player: currentPlayer,
      card: move.card,
      faceDown: move.faceDown,
    });

    if (result.trickComplete) {
      io.to(roomId).emit('trick-complete', {
        winner: result.trickWinner!,
        trickNumber: gameManager.getServerState().currentHand?.tricksPlayed ?? 0,
      });

      // Add delay to show the completed trick (+10%)
      await new Promise((resolve) => setTimeout(resolve, 1650));

      if (result.handComplete) {
        const serverState = gameManager.getServerState();
        const tricks = {
          north: serverState.players.north?.tricksWon ?? 0,
          east: serverState.players.east?.tricksWon ?? 0,
          south: serverState.players.south?.tricksWon ?? 0,
          west: serverState.players.west?.tricksWon ?? 0,
        };
        io.to(roomId).emit('hand-complete', {
          winner: result.handWinner!,
          tricks,
        });

        // Check if there are human players - if so, wait for them to continue
        const room = lobbyManager.getRoom(roomId);
        const humanPlayers = room ? getHumanPlayers(room) : [];

        if (humanPlayers.length > 0) {
          // Initialize pending continues for this room
          pendingContinues.set(roomId, new Set());
        } else {
          // All bots - start next hand after delay
          await new Promise((resolve) => setTimeout(resolve, 3000));
          startNextHand(io, roomId, gameManager);
        }
        return;
      }
    }

    broadcastGameState(io, roomId, gameManager);
    currentPlayer = gameManager.getCurrentPlayer();
  }
}

/**
 * Broadcast current turn
 */
function broadcastTurn(io: GameServer, roomId: string, gameManager: GameManager): void {
  const currentPlayer = gameManager.getCurrentPlayer();
  if (currentPlayer) {
    io.to(roomId).emit('waiting-for', { player: currentPlayer });
  }
}

/**
 * Broadcast game state to all players
 */
function broadcastGameState(
  io: GameServer,
  roomId: string,
  gameManager: GameManager
): void {
  const room = lobbyManager.getRoom(roomId);
  if (!room) return;

  for (const [position, player] of room.players) {
    if (!player.isBot) {
      const playerSocket = io.sockets.sockets.get(player.socketId);
      if (playerSocket) {
        playerSocket.emit('game-state', {
          gameState: gameManager.getClientState(position),
        });
      }
    }
  }
}

/**
 * Get player views for a room
 */
function getPlayerViews(roomId: string): Array<any> {
  const room = lobbyManager.getRoom(roomId);
  if (!room) return [];

  return ['north', 'east', 'south', 'west'].map((pos) => {
    const player = room.players.get(pos as PlayerPosition);
    if (!player) return null;
    return {
      id: player.id,
      name: player.name,
      position: player.position,
      cardCount: 0,
      tricksWon: 0,
      isCurrentTurn: false,
      isBot: player.isBot,
      isConnected: player.isConnected,
      disconnectedAt: player.disconnectedAt,
    };
  });
}

/**
 * Get list of human player positions in a room
 */
function getHumanPlayers(room: { players: Map<PlayerPosition, { isBot: boolean }> }): PlayerPosition[] {
  const humans: PlayerPosition[] = [];
  for (const [position, player] of room.players) {
    if (!player.isBot) {
      humans.push(position);
    }
  }
  return humans;
}

/**
 * Handle player clicking Continue after hand completes
 */
function handleContinueGame(socket: GameSocket, io: GameServer): void {
  const roomId = socket.data.roomId;
  const position = socket.data.position;

  if (!roomId || !position) {
    socket.emit('error', { message: 'Not in a game', code: 'NOT_IN_GAME' });
    return;
  }

  const gameManager = activeGames.get(roomId);
  if (!gameManager) {
    socket.emit('error', { message: 'Game not found', code: 'GAME_NOT_FOUND' });
    return;
  }

  const room = lobbyManager.getRoom(roomId);
  if (!room) {
    socket.emit('error', { message: 'Room not found', code: 'ROOM_NOT_FOUND' });
    return;
  }

  // Get or create pending continues set for this room
  let continues = pendingContinues.get(roomId);
  if (!continues) {
    // No pending continue state - maybe all bots or already started
    return;
  }

  // Mark this player as continued
  continues.add(position);

  // Check if all human players have continued
  const humanPlayers = getHumanPlayers(room);
  const allHumansContinued = humanPlayers.every(pos => continues!.has(pos));

  if (allHumansContinued) {
    // Clear pending state
    pendingContinues.delete(roomId);

    // Start next hand
    startNextHand(io, roomId, gameManager);
  }
}
