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

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;
type GameServer = Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

const lobbyManager = new LobbyManager();
const activeGames = new Map<string, GameManager>();

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

    // Send connection confirmation
    socket.emit('connected', { playerId: socket.data.playerId });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      handleLeaveRoom(socket, io);
    });

    // Lobby events
    socket.on('join-lobby', (data) => handleJoinLobby(socket, io, data));
    socket.on('create-room', (data) => handleCreateRoom(socket, io, data));
    socket.on('join-room', (data) => handleJoinRoom(socket, io, data));
    socket.on('leave-room', () => handleLeaveRoom(socket, io));
    socket.on('start-game', () => handleStartGame(socket, io));

    // Game events
    socket.on('play-card', (data) => handlePlayCard(socket, io, data));
    socket.on('create-rule', (data) => handleCreateRule(socket, io, data));

    // Bot events
    socket.on('add-bot', (data) => handleAddBot(socket, io, data));
    socket.on('remove-bot', (data) => handleRemoveBot(socket, io, data));

    // Dev events
    socket.on('dev-reset-game', () => handleDevReset(socket, io));
  });
}

/**
 * Handle player joining lobby
 */
function handleJoinLobby(
  socket: GameSocket,
  io: GameServer,
  data: { playerName: string }
): void {
  socket.data.playerName = data.playerName;
  socket.emit('lobby-state', { rooms: lobbyManager.getRoomList() });
}

/**
 * Handle room creation
 */
function handleCreateRoom(
  socket: GameSocket,
  io: GameServer,
  data: { roomName: string }
): void {
  const room = lobbyManager.createRoom(data.roomName, socket.id, socket.data.playerName);

  socket.join(room.id);
  socket.data.roomId = room.id;
  socket.data.position = 'south';

  socket.emit('room-joined', {
    roomId: room.id,
    position: 'south',
    players: getPlayerViews(room.id),
  });

  // Broadcast updated room list
  io.emit('lobby-state', { rooms: lobbyManager.getRoomList() });
}

/**
 * Handle joining a room
 */
function handleJoinRoom(
  socket: GameSocket,
  io: GameServer,
  data: { roomId: string; position?: PlayerPosition }
): void {
  const result = lobbyManager.joinRoom(
    data.roomId,
    socket.id,
    socket.data.playerName,
    data.position
  );

  if (!result.success) {
    socket.emit('error', { message: result.error!, code: 'JOIN_FAILED' });
    return;
  }

  socket.join(data.roomId);
  socket.data.roomId = data.roomId;
  socket.data.position = result.position!;

  socket.emit('room-joined', {
    roomId: data.roomId,
    position: result.position!,
    players: getPlayerViews(data.roomId),
  });

  // Notify other players in room
  socket.to(data.roomId).emit('room-updated', {
    players: getPlayerViews(data.roomId),
  });

  // Broadcast updated room list
  io.emit('lobby-state', { rooms: lobbyManager.getRoomList() });
}

/**
 * Handle leaving a room
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
    }

    // Clean up game if exists
    activeGames.delete(result.roomId);
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

  if (room.hostId !== socket.id) {
    socket.emit('error', { message: 'Only host can start game', code: 'NOT_HOST' });
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
  data: { card: { suit: string; rank: string }; faceDown: boolean }
): void {
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

  const card = { suit: data.card.suit, rank: data.card.rank } as any;
  const result = gameManager.playCard(position, card, data.faceDown);

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
    faceDown: data.faceDown,
  });

  // Handle trick completion
  if (result.trickComplete) {
    io.to(roomId).emit('trick-complete', {
      winner: result.trickWinner!,
      trickNumber: gameManager.getServerState().currentHand?.tricksPlayed ?? 0,
    });

    // Handle hand completion
    if (result.handComplete) {
      io.to(roomId).emit('hand-complete', {
        winner: result.handWinner!,
        tricks: Object.fromEntries(
          Object.entries(gameManager.getServerState().players)
            .filter(([_, p]) => p !== null)
            .map(([pos, p]) => [pos, p!.tricksWon])
        ) as any,
      });

      // Check if winner is a bot - auto-start next hand
      const room = lobbyManager.getRoom(roomId);
      const winnerPlayer = room?.players.get(result.handWinner!);

      if (winnerPlayer?.isBot) {
        // Bot wins - skip rule creation and start next hand after delay
        setTimeout(() => {
          startNextHandAfterBot(io, roomId, gameManager);
        }, 2000);
      } else {
        // Human wins - enter rule creation phase
        io.to(roomId).emit('rule-creation-phase', { winner: result.handWinner! });
      }
      return; // Don't process bot turns or broadcast state yet
    }

    // Add delay before clearing trick and continuing
    // Wait 2.5s to ensure all clients see the 4th card and animation completes
    setTimeout(() => {
      broadcastGameState(io, roomId, gameManager);
      processBotTurns(io, roomId, gameManager);
    }, 2500);
  } else {
    // No trick complete - broadcast immediately
    broadcastGameState(io, roomId, gameManager);
    processBotTurns(io, roomId, gameManager);
  }
}

/**
 * Handle creating a rule
 */
function handleCreateRule(
  socket: GameSocket,
  io: GameServer,
  data: { rule: any }
): void {
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

  if (!gameManager.isRuleCreationPhase()) {
    socket.emit('error', { message: 'Not in rule creation phase', code: 'WRONG_PHASE' });
    return;
  }

  const winner = gameManager.getHandWinner();
  if (winner !== position) {
    socket.emit('error', { message: 'Only the hand winner can create a rule', code: 'NOT_WINNER' });
    return;
  }

  const result = gameManager.addRule(position, data.rule);

  if (!result.success) {
    socket.emit('error', { message: result.error!, code: 'INVALID_RULE' });
    return;
  }

  // Broadcast the new rule
  io.to(roomId).emit('rule-created', { rule: result.rule! });

  // Start next hand
  gameManager.startNextHand();
  const { trumpSuit, hands } = gameManager.startHand();

  const room = lobbyManager.getRoom(roomId)!;
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
  processBotTurns(io, roomId, gameManager);
}

/**
 * Handle adding a bot
 */
function handleAddBot(
  socket: GameSocket,
  io: GameServer,
  data: { position: PlayerPosition }
): void {
  const roomId = socket.data.roomId;
  if (!roomId) {
    socket.emit('error', { message: 'Not in a room', code: 'NOT_IN_ROOM' });
    return;
  }

  const result = lobbyManager.addBot(roomId, data.position);
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
  data: { position: PlayerPosition }
): void {
  const roomId = socket.data.roomId;
  if (!roomId) {
    socket.emit('error', { message: 'Not in a room', code: 'NOT_IN_ROOM' });
    return;
  }

  if (lobbyManager.removeBot(roomId, data.position)) {
    io.to(roomId).emit('room-updated', {
      players: getPlayerViews(roomId),
    });
  }
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
 * Start next hand after bot wins (skipping rule creation)
 */
function startNextHandAfterBot(
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

      // Add delay to show the completed trick
      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (result.handComplete) {
        io.to(roomId).emit('hand-complete', {
          winner: result.handWinner!,
          tricks: {} as any,
        });

        // Check if winner is a bot
        const winnerPlayer = room.players.get(result.handWinner!);
        if (winnerPlayer?.isBot) {
          // Bot wins - skip rule creation, start next hand after delay
          await new Promise((resolve) => setTimeout(resolve, 2000));
          startNextHandAfterBot(io, roomId, gameManager);
        } else {
          // Human wins - enter rule creation phase
          io.to(roomId).emit('rule-creation-phase', { winner: result.handWinner! });
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
      isConnected: true,
    };
  });
}
