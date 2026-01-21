import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  PlayerPosition,
  GameType,
  Card,
} from '@fkthepope/shared';
import { toPlayerView, GAME_CONFIGS } from '@fkthepope/shared';
import { LobbyManager } from '../lobby/lobby-manager.js';
import { GameManager } from '../game/game-manager.js';
import { SkitgubbeGameManager } from '../game/skitgubbe-manager.js';
import { BridgeGameManager } from '../game/bridge-manager.js';
import type { BaseGameManager } from '../game/base-game-manager.js';
import { playerId, bridge } from '@fkthepope/game-engine';
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
  KickPlayerSchema,
  ApprovePlayerSchema,
  RejectPlayerSchema,
  SkitgubbePlaySchema,
  BridgeBidSchema,
  BridgePlaySchema,
} from '../validation/schemas.js';
import { AnalyticsManager } from '../analytics/index.js';
import {
  notifyAdminOfRoomUpdate,
  notifyAdminOfRoomCreated,
  notifyAdminOfRoomDeleted,
  setClientMetadata,
  removeClientMetadata,
} from '../admin/index.js';

// Type alias for any game manager
type AnyGameManager = GameManager | SkitgubbeGameManager | BridgeGameManager;

// Required client version - clients must match this exactly
const REQUIRED_VERSION = '1.70';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;
type GameServer = Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

// Export for admin dashboard access
export const lobbyManager = new LobbyManager();
export const activeGames = new Map<string, AnyGameManager>();
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

    // Track client metadata for admin dashboard
    setClientMetadata(socket.id, { version: clientVersion, deviceType });

    // Log session event for debugging
    AnalyticsManager.getInstance().logSessionEvent(socket.id, 'connected', {
      details: { deviceType, version: clientVersion, ip: ip.substring(0, 20) },
    });

    // Send connection confirmation
    socket.emit('connected', { playerId: socket.data.playerId });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      // Log session event for debugging
      AnalyticsManager.getInstance().logSessionEvent(socket.id, 'disconnected', {
        roomId: socket.data.roomId ?? undefined,
        playerPosition: socket.data.position ?? undefined,
        details: { playerName: socket.data.playerName },
      });
      // End analytics session
      AnalyticsManager.getInstance().endSession(socket.id);
      // Remove client metadata
      removeClientMetadata(socket.id);
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

    // Game events (Whist)
    socket.on('play-card', (data) => handlePlayCard(socket, io, data));
    socket.on('continue-game', () => handleContinueGame(socket, io));

    // Skitgubbe events
    socket.on('skitgubbe-play', (data) => handleSkitgubbePlay(socket, io, data));
    socket.on('skitgubbe-pickup', () => handleSkitgubbePickup(socket, io));

    // Bridge events
    socket.on('bridge-bid', (data) => handleBridgeBid(socket, io, data));
    socket.on('bridge-play', (data) => handleBridgePlay(socket, io, data));

    // Bot events
    socket.on('add-bot', (data) => handleAddBot(socket, io, data));
    socket.on('remove-bot', (data) => handleRemoveBot(socket, io, data));
    socket.on('replace-with-bot', (data) => handleReplaceWithBot(socket, io, data));

    // Kick disconnected player event
    socket.on('kick-player', (data) => handleKickPlayer(socket, io, data));

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

  // Log session event
  AnalyticsManager.getInstance().logSessionEvent(socket.id, 'join_lobby', {
    details: { playerName: validation.data.playerName },
  });

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

  const gameType = validation.data.gameType as GameType;
  const room = lobbyManager.createRoom(validation.data.roomName, socket.id, socket.data.playerName, gameType);
  const config = GAME_CONFIGS[gameType];

  socket.join(room.id);
  socket.data.roomId = room.id;
  socket.data.position = 'south';

  socket.emit('room-joined', {
    roomId: room.id,
    roomName: room.name,
    gameType: room.gameType,
    maxPlayers: config.maxPlayers,
    position: 'south',
    players: getPlayerViews(room.id),
    isHost: true, // Creator is always host
  });

  // Broadcast updated room list
  io.emit('lobby-state', { rooms: lobbyManager.getRoomList() });

  // Log session event
  AnalyticsManager.getInstance().logSessionEvent(socket.id, 'create_room', {
    roomId: room.id,
    playerPosition: 'south',
    details: { roomName: room.name, playerName: socket.data.playerName },
  });

  // Notify admin dashboard
  notifyAdminOfRoomCreated(room.id);
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

  const config = GAME_CONFIGS[room.gameType];
  socket.emit('room-joined', {
    roomId,
    roomName: room.name,
    gameType: room.gameType,
    maxPlayers: config.maxPlayers,
    position,
    players: getPlayerViews(roomId),
    isHost: room.hostId === socket.id,
  });

  // If game is in progress, send current game state
  const gameManager = activeGames.get(roomId);
  if (gameManager) {
    socket.emit('game-started', {
      gameState: gameManager.getClientState(position),
      gameType: room.gameType,
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
      // Notify admin dashboard
      notifyAdminOfRoomUpdate(result.roomId);
    } else {
      // Only clean up game if room is deleted (no human players left)
      // Track game end if there was an active game
      if (activeGames.has(result.roomId)) {
        const room = lobbyManager.getRoom(result.roomId);
        AnalyticsManager.getInstance().recordGameEnded(result.roomId, undefined, room?.gameType);
      }
      activeGames.delete(result.roomId);
      // Notify admin dashboard of deletion
      notifyAdminOfRoomDeleted(result.roomId);
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

  const gameConfig = GAME_CONFIGS[room.gameType];
  if (!lobbyManager.canStartGame(roomId)) {
    const minPlayers = gameConfig.minPlayers;
    socket.emit('error', { message: `Need at least ${minPlayers} players to start`, code: 'NOT_ENOUGH_PLAYERS' });
    return;
  }

  lobbyManager.startGame(roomId);

  // Create appropriate game manager based on game type
  let gameManager: AnyGameManager;
  switch (room.gameType) {
    case 'bridge':
      gameManager = new BridgeGameManager(room);
      break;
    case 'skitgubbe':
      gameManager = new SkitgubbeGameManager(room);
      break;
    case 'whist':
    default:
      gameManager = new GameManager(room);
      break;
  }
  activeGames.set(roomId, gameManager);

  // Track game started
  AnalyticsManager.getInstance().recordGameStarted(roomId, room.players.size, room.gameType);

  // Track players in the game and log session events
  const playerList: Array<{ position: string; name: string; isBot: boolean }> = [];
  for (const [pos, player] of room.players) {
    playerList.push({ position: pos, name: player.name, isBot: player.isBot });
    if (!player.isBot) {
      AnalyticsManager.getInstance().recordPlayerJoinedRoom(player.socketId, roomId);
      AnalyticsManager.getInstance().recordPlayerPlayedGame(player.socketId);
      // Log session event for each human player
      AnalyticsManager.getInstance().logSessionEvent(player.socketId, 'game_started', {
        roomId,
        playerPosition: pos,
        details: { playerName: player.name, roomName: room.name, gameType: room.gameType },
      });
    }
  }

  // Log the full player composition for debugging
  AnalyticsManager.getInstance().logSessionEvent(socket.id, 'game_players', {
    roomId,
    details: { players: playerList, gameType: room.gameType },
  });

  // Start the game based on game type
  if (room.gameType === 'whist') {
    const whistManager = gameManager as GameManager;
    const { trumpSuit, hands } = whistManager.startHand();

    // Send game state to each player
    for (const [position, player] of room.players) {
      if (!player.isBot) {
        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
          playerSocket.emit('game-started', {
            gameState: whistManager.getClientState(position),
            gameType: 'whist',
          });
          playerSocket.emit('hand-started', {
            handNumber: 1,
            trumpSuit,
            yourHand: hands[position],
          });
        }
      }
    }

    broadcastTurn(io, roomId, whistManager);
    processWhistBotTurns(io, roomId, whistManager);
  } else if (room.gameType === 'skitgubbe') {
    const skitgubbeManager = gameManager as SkitgubbeGameManager;
    const { trumpSuit, trumpCard } = skitgubbeManager.startHand();

    // Send game state to each player
    for (const [position, player] of room.players) {
      if (!player.isBot) {
        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
          playerSocket.emit('game-started', {
            gameState: skitgubbeManager.getClientState(position),
            gameType: 'skitgubbe',
          });
        }
      }
    }

    broadcastTurnForGame(io, roomId, skitgubbeManager, 'skitgubbe');
    processSkitgubbeBotTurns(io, roomId, skitgubbeManager);
  } else if (room.gameType === 'bridge') {
    const bridgeManager = gameManager as BridgeGameManager;
    bridgeManager.startHand();

    // Send game state to each player
    for (const [position, player] of room.players) {
      if (!player.isBot) {
        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
          playerSocket.emit('game-started', {
            gameState: bridgeManager.getClientState(position),
            gameType: 'bridge',
          });
        }
      }
    }

    broadcastTurnForGame(io, roomId, bridgeManager, 'bridge');
    processBridgeBotTurns(io, roomId, bridgeManager);
  }

  // Update lobby
  io.emit('lobby-state', { rooms: lobbyManager.getRoomList() });

  // Notify admin dashboard
  notifyAdminOfRoomUpdate(roomId);
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
  if (!gameManager || !(gameManager instanceof GameManager)) {
    socket.emit('error', { message: 'Whist game not found', code: 'GAME_NOT_FOUND' });
    return;
  }

  const { card: cardData, faceDown } = validation.data;
  const card = { suit: cardData.suit, rank: cardData.rank } as import('@fkthepope/shared').Card;
  const result = gameManager.playCard(position, card, faceDown);

  if (!result.success) {
    // Log the play rejection for debugging
    AnalyticsManager.getInstance().logSessionEvent(socket.id, 'play_rejected', {
      roomId,
      playerPosition: position,
      details: {
        error: result.error,
        attemptedCard: `${card.rank}${card.suit.charAt(0).toUpperCase()}`,
        faceDown,
      },
    });
    AnalyticsManager.getInstance().logError('play-card', result.error!, {
      level: 'warn',
      sessionId: socket.id,
      roomId,
      playerName: socket.data.playerName,
      context: { position, card, faceDown },
    });

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

  // Log session event for the card play
  AnalyticsManager.getInstance().logSessionEvent(socket.id, 'card_played', {
    roomId,
    playerPosition: position,
    details: {
      card: `${card.rank}${card.suit.charAt(0).toUpperCase()}`,
      faceDown,
      handNumber: gameManager.getServerState().currentHand?.number,
      trickNumber: gameManager.getServerState().currentHand?.tricksPlayed,
    },
  });

  // Notify admin dashboard of state change
  notifyAdminOfRoomUpdate(roomId);

  // Handle trick completion
  if (result.trickComplete) {
    // Log trick complete event
    AnalyticsManager.getInstance().logSessionEvent(socket.id, 'trick_complete', {
      roomId,
      details: {
        winner: result.trickWinner,
        trickNumber: gameManager.getServerState().currentHand?.tricksPlayed,
        handNumber: gameManager.getServerState().currentHand?.number,
      },
    });

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

      // Log hand complete event
      AnalyticsManager.getInstance().logSessionEvent(socket.id, 'hand_complete', {
        roomId,
        details: {
          winner: result.handWinner,
          handNumber: serverState.currentHand?.number,
          tricks,
          scores: serverState.scores,
        },
      });

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
      notifyAdminOfRoomUpdate(roomId); // Update admin with new trick state
      processWhistBotTurns(io, roomId, gameManager);
    }, 2750);
  } else {
    // No trick complete - broadcast immediately
    broadcastGameState(io, roomId, gameManager);
    processWhistBotTurns(io, roomId, gameManager);
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
  if (gameManager && gameManager instanceof GameManager) {
    broadcastGameState(io, roomId, gameManager);

    // If it's now the bot's turn, process it
    const currentPlayer = gameManager.getCurrentPlayer();
    if (currentPlayer === position) {
      processWhistBotTurns(io, roomId, gameManager);
    }
  }
}

/**
 * Handle kicking a disconnected player from the room
 */
function handleKickPlayer(
  socket: GameSocket,
  io: GameServer,
  data: unknown
): void {
  const validation = validateData(KickPlayerSchema, data);
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
  const result = lobbyManager.kickDisconnectedPlayer(roomId, position, socket.id);

  if (!result.success) {
    socket.emit('error', { message: result.error!, code: 'KICK_FAILED' });
    return;
  }

  // Notify all players in room about the kick
  io.to(roomId).emit('player-kicked', { position });

  if (result.roomDeleted) {
    // Track game end if there was an active game
    if (activeGames.has(roomId)) {
      const room = lobbyManager.getRoom(roomId);
      AnalyticsManager.getInstance().recordGameEnded(roomId, undefined, room?.gameType);
    }
    activeGames.delete(roomId);
    notifyAdminOfRoomDeleted(roomId);
  } else {
    // Update room state for remaining players
    io.to(roomId).emit('room-updated', { players: getPlayerViews(roomId) });
    notifyAdminOfRoomUpdate(roomId);
  }

  // Update lobby list for everyone
  io.emit('lobby-state', { rooms: lobbyManager.getRoomList() });
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

    // Log session event for the joined player
    AnalyticsManager.getInstance().logSessionEvent(socketId, 'join_room', {
      roomId,
      playerPosition: availablePosition,
      details: { playerName: approvedSocket.data.playerName, roomName: room.name },
    });

    // Tell them they've been approved
    approvedSocket.emit('join-approved', { position: availablePosition });
    const approvedRoomConfig = GAME_CONFIGS[room.gameType];
    approvedSocket.emit('room-joined', {
      roomId,
      roomName: room.name,
      gameType: room.gameType,
      maxPlayers: approvedRoomConfig.maxPlayers,
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
  processWhistBotTurns(io, roomId, gameManager);
}

/**
 * Process bot turns automatically for Whist
 */
async function processWhistBotTurns(
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

    // Log bot card play to analytics (use 'bot' as sessionId)
    AnalyticsManager.getInstance().logSessionEvent(`bot_${currentPlayer}`, 'card_played', {
      roomId,
      playerPosition: currentPlayer,
      details: {
        card: `${move.card.rank}${move.card.suit.charAt(0).toUpperCase()}`,
        faceDown: move.faceDown,
        handNumber: gameManager.getServerState().currentHand?.number,
        trickNumber: gameManager.getServerState().currentHand?.tricksPlayed,
        isBot: true,
      },
    });

    // Notify admin of bot card play
    notifyAdminOfRoomUpdate(roomId);

    if (result.trickComplete) {
      io.to(roomId).emit('trick-complete', {
        winner: result.trickWinner!,
        trickNumber: gameManager.getServerState().currentHand?.tricksPlayed ?? 0,
      });

      // Add delay to show the completed trick (+10%)
      await new Promise((resolve) => setTimeout(resolve, 1650));

      // Notify admin with cleared trick state
      notifyAdminOfRoomUpdate(roomId);

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
 * Broadcast game state to all players (Whist-specific, includes gameType)
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
          gameType: 'whist',
        });
      }
    }
  }
}

/**
 * Broadcast game state for any game type
 */
function broadcastGameStateForGame(
  io: GameServer,
  roomId: string,
  gameManager: BaseGameManager,
  gameType: GameType
): void {
  const room = lobbyManager.getRoom(roomId);
  if (!room) return;

  for (const [position, player] of room.players) {
    if (!player.isBot) {
      const playerSocket = io.sockets.sockets.get(player.socketId);
      if (playerSocket) {
        playerSocket.emit('game-state', {
          gameState: gameManager.getClientState(position),
          gameType,
        });
      }
    }
  }
}

/**
 * Broadcast current turn for any game type
 */
function broadcastTurnForGame(
  io: GameServer,
  roomId: string,
  gameManager: BaseGameManager,
  _gameType: GameType
): void {
  const currentPlayer = gameManager.getCurrentPlayer();
  if (currentPlayer) {
    io.to(roomId).emit('waiting-for', { player: currentPlayer });
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
  if (!gameManager || !(gameManager instanceof GameManager)) {
    socket.emit('error', { message: 'Whist game not found', code: 'GAME_NOT_FOUND' });
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

    // Start next hand (only for Whist)
    startNextHand(io, roomId, gameManager);
  }
}

/**
 * Handle Skitgubbe card play
 */
function handleSkitgubbePlay(
  socket: GameSocket,
  io: GameServer,
  data: unknown
): void {
  const validation = validateData(SkitgubbePlaySchema, data);
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
  if (!gameManager || !(gameManager instanceof SkitgubbeGameManager)) {
    socket.emit('error', { message: 'Skitgubbe game not found', code: 'GAME_NOT_FOUND' });
    return;
  }

  const { card: cardData } = validation.data;
  const card: Card = { suit: cardData.suit, rank: cardData.rank };
  const phase = gameManager.getPhase();

  let result;
  if (phase === 'phase1') {
    result = gameManager.playCardPhase1(position, card);
  } else if (phase === 'phase2') {
    result = gameManager.playCardPhase2(position, card);
  } else {
    socket.emit('error', { message: 'Cannot play now', code: 'INVALID_PHASE' });
    return;
  }

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
    faceDown: false,
  });

  // Handle phase 2 specific events
  if (phase === 'phase2' && 'playerOut' in result && result.playerOut) {
    io.to(roomId).emit('skitgubbe-player-out', { player: position });

    if (result.gameEnd && result.loser) {
      io.to(roomId).emit('game-ended', {
        finalScores: { north: 0, east: 0, south: 0, west: 0 },
        loser: result.loser,
      });
      return;
    }
  }

  // Handle phase 1 trick completion and phase transition
  if (phase === 'phase1' && 'trickComplete' in result && result.trickComplete) {
    io.to(roomId).emit('trick-complete', {
      winner: result.trickWinner!,
      trickNumber: 0,
    });

    if (result.phase2Starts) {
      io.to(roomId).emit('skitgubbe-phase-change', { phase: 'phase2' });
    }
  }

  broadcastGameStateForGame(io, roomId, gameManager, 'skitgubbe');
  broadcastTurnForGame(io, roomId, gameManager, 'skitgubbe');
  processSkitgubbeBotTurns(io, roomId, gameManager);
}

/**
 * Handle Skitgubbe pile pickup
 */
function handleSkitgubbePickup(socket: GameSocket, io: GameServer): void {
  const roomId = socket.data.roomId;
  const position = socket.data.position;

  if (!roomId || !position) {
    socket.emit('error', { message: 'Not in a game', code: 'NOT_IN_GAME' });
    return;
  }

  const gameManager = activeGames.get(roomId);
  if (!gameManager || !(gameManager instanceof SkitgubbeGameManager)) {
    socket.emit('error', { message: 'Skitgubbe game not found', code: 'GAME_NOT_FOUND' });
    return;
  }

  const result = gameManager.pickUpPile(position);

  if (!result.success) {
    socket.emit('error', { message: result.error!, code: 'PICKUP_FAILED' });
    return;
  }

  io.to(roomId).emit('skitgubbe-pickup', {
    player: position,
    cardsPickedUp: result.cardsPickedUp,
  });

  broadcastGameStateForGame(io, roomId, gameManager, 'skitgubbe');
  broadcastTurnForGame(io, roomId, gameManager, 'skitgubbe');
  processSkitgubbeBotTurns(io, roomId, gameManager);
}

/**
 * Handle Bridge bid
 */
function handleBridgeBid(
  socket: GameSocket,
  io: GameServer,
  data: unknown
): void {
  const validation = validateData(BridgeBidSchema, data);
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
  if (!gameManager || !(gameManager instanceof BridgeGameManager)) {
    socket.emit('error', { message: 'Bridge game not found', code: 'GAME_NOT_FOUND' });
    return;
  }

  const { bidType, level, strain } = validation.data;
  const bid: { type: string; level?: number; strain?: string } = { type: bidType };
  if (level !== undefined) bid.level = level;
  if (strain !== undefined) bid.strain = strain;

  const result = gameManager.makeBid(position, bid as bridge.Bid);

  if (!result.success) {
    socket.emit('error', { message: result.error!, code: 'BID_FAILED' });
    return;
  }

  // Broadcast the bid
  io.to(roomId).emit('bridge-bid-made', {
    player: position,
    bidType,
    level,
    strain,
  });

  // Handle bidding completion
  if (result.biddingComplete) {
    io.to(roomId).emit('bridge-bidding-complete', {
      contract: result.contract,
      passed: result.contract === null,
    });

    // If contract was made, reveal dummy hand
    if (result.contract) {
      const dummyPosition = result.contract.dummy;
      const clientState = gameManager.getClientState(result.contract.declarer);
      io.to(roomId).emit('bridge-dummy-revealed', {
        dummyPosition,
        dummyHand: (clientState as any).dummyHand ?? [],
      });
    }
  }

  broadcastGameStateForGame(io, roomId, gameManager, 'bridge');
  broadcastTurnForGame(io, roomId, gameManager, 'bridge');
  processBridgeBotTurns(io, roomId, gameManager);
}

/**
 * Handle Bridge card play
 */
function handleBridgePlay(
  socket: GameSocket,
  io: GameServer,
  data: unknown
): void {
  const validation = validateData(BridgePlaySchema, data);
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
  if (!gameManager || !(gameManager instanceof BridgeGameManager)) {
    socket.emit('error', { message: 'Bridge game not found', code: 'GAME_NOT_FOUND' });
    return;
  }

  const { card: cardData, fromDummy } = validation.data;
  const card: Card = { suit: cardData.suit, rank: cardData.rank };

  const result = gameManager.playCard(position, card, fromDummy ?? false);

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
    faceDown: false,
  });

  if (result.trickComplete) {
    io.to(roomId).emit('trick-complete', {
      winner: result.trickWinner!,
      trickNumber: 0,
    });

    if (result.handComplete) {
      // Hand is complete - broadcast scores
      io.to(roomId).emit('hand-complete', {
        winner: result.trickWinner!,
        tricks: { north: 0, east: 0, south: 0, west: 0 },
      });
    }
  }

  broadcastGameStateForGame(io, roomId, gameManager, 'bridge');
  broadcastTurnForGame(io, roomId, gameManager, 'bridge');
  processBridgeBotTurns(io, roomId, gameManager);
}

/**
 * Process bot turns for Skitgubbe
 */
async function processSkitgubbeBotTurns(
  io: GameServer,
  roomId: string,
  gameManager: SkitgubbeGameManager
): Promise<void> {
  const room = lobbyManager.getRoom(roomId);
  if (!room) return;

  let currentPlayer = gameManager.getCurrentPlayer();

  while (currentPlayer) {
    const player = room.players.get(currentPlayer);
    if (!player?.isBot) {
      broadcastTurnForGame(io, roomId, gameManager, 'skitgubbe');
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    const move = gameManager.getBotMove(currentPlayer);
    if (!move) break;

    if (move.action === 'pickup') {
      const result = gameManager.pickUpPile(currentPlayer);
      if (result.success) {
        io.to(roomId).emit('skitgubbe-pickup', {
          player: currentPlayer,
          cardsPickedUp: result.cardsPickedUp,
        });
      }
    } else {
      const phase = gameManager.getPhase();
      let result;
      if (phase === 'phase1') {
        result = gameManager.playCardPhase1(currentPlayer, move.card);
      } else {
        result = gameManager.playCardPhase2(currentPlayer, move.card);
      }

      if (result.success) {
        io.to(roomId).emit('card-played', {
          player: currentPlayer,
          card: move.card,
          faceDown: false,
        });

        if (phase === 'phase2' && 'playerOut' in result && result.playerOut) {
          io.to(roomId).emit('skitgubbe-player-out', { player: currentPlayer });
          if (result.gameEnd && result.loser) {
            io.to(roomId).emit('game-ended', {
              finalScores: { north: 0, east: 0, south: 0, west: 0 },
              loser: result.loser,
            });
            return;
          }
        }

        if (phase === 'phase1' && 'trickComplete' in result && result.trickComplete) {
          io.to(roomId).emit('trick-complete', {
            winner: result.trickWinner!,
            trickNumber: 0,
          });
          if (result.phase2Starts) {
            io.to(roomId).emit('skitgubbe-phase-change', { phase: 'phase2' });
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    broadcastGameStateForGame(io, roomId, gameManager, 'skitgubbe');
    currentPlayer = gameManager.getCurrentPlayer();
  }
}

/**
 * Process bot turns for Bridge
 */
async function processBridgeBotTurns(
  io: GameServer,
  roomId: string,
  gameManager: BridgeGameManager
): Promise<void> {
  const room = lobbyManager.getRoom(roomId);
  if (!room) return;

  let currentPlayer = gameManager.getCurrentPlayer();

  while (currentPlayer) {
    const player = room.players.get(currentPlayer);
    if (!player?.isBot) {
      broadcastTurnForGame(io, roomId, gameManager, 'bridge');
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    const move = gameManager.getBotMove(currentPlayer);
    if (!move) break;

    if (move.bid) {
      const result = gameManager.makeBid(currentPlayer, move.bid);
      if (result.success) {
        io.to(roomId).emit('bridge-bid-made', {
          player: currentPlayer,
          bidType: move.bid.type,
          level: 'level' in move.bid ? move.bid.level : undefined,
          strain: 'strain' in move.bid ? move.bid.strain : undefined,
        });

        if (result.biddingComplete) {
          io.to(roomId).emit('bridge-bidding-complete', {
            contract: result.contract,
            passed: result.contract === null,
          });

          if (result.contract) {
            const dummyPosition = result.contract.dummy;
            const clientState = gameManager.getClientState(result.contract.declarer);
            io.to(roomId).emit('bridge-dummy-revealed', {
              dummyPosition,
              dummyHand: (clientState as any).dummyHand ?? [],
            });
          }
        }
      }
    } else if (move.card) {
      const result = gameManager.playCard(currentPlayer, move.card, move.fromDummy ?? false);
      if (result.success) {
        io.to(roomId).emit('card-played', {
          player: currentPlayer,
          card: move.card,
          faceDown: false,
        });

        if (result.trickComplete) {
          io.to(roomId).emit('trick-complete', {
            winner: result.trickWinner!,
            trickNumber: 0,
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));

          if (result.handComplete) {
            io.to(roomId).emit('hand-complete', {
              winner: result.trickWinner!,
              tricks: { north: 0, east: 0, south: 0, west: 0 },
            });
          }
        }
      }
    }

    broadcastGameStateForGame(io, roomId, gameManager, 'bridge');
    currentPlayer = gameManager.getCurrentPlayer();
  }
}
