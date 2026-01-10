import { useEffect, useCallback } from 'react';
import type { Card, PlayerPosition, Rule } from '@fkthepope/shared';
import { getSocket, connectSocket, disconnectSocket } from './socket-client';
import { useGameStore } from '../stores/game-store';
import { useLobbyStore } from '../stores/lobby-store';
import { useUiStore } from '../stores/ui-store';

/**
 * Main socket hook - sets up all event listeners
 */
export function useSocket() {
  const setConnected = useGameStore((s) => s.setConnected);
  const setRoom = useGameStore((s) => s.setRoom);
  const setGameState = useGameStore((s) => s.setGameState);
  const setLastViolation = useGameStore((s) => s.setLastViolation);
  const setWaitingFor = useGameStore((s) => s.setWaitingFor);
  const reset = useGameStore((s) => s.reset);

  const setRooms = useLobbyStore((s) => s.setRooms);
  const setCurrentRoom = useLobbyStore((s) => s.setCurrentRoom);
  const updateRoomPlayers = useLobbyStore((s) => s.updateRoomPlayers);

  const showToast = useUiStore((s) => s.showToast);
  const setShowRuleCreator = useUiStore((s) => s.setShowRuleCreator);

  useEffect(() => {
    const socket = getSocket();

    // Connection events
    socket.on('connected', ({ playerId }) => {
      setConnected(true, playerId);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('error', ({ message }) => {
      showToast(message, 'error');
    });

    // Lobby events
    socket.on('lobby-state', ({ rooms }) => {
      setRooms(rooms);
    });

    socket.on('room-joined', ({ roomId, position, players }) => {
      setRoom(roomId, position);
      setCurrentRoom({ id: roomId, players });
    });

    socket.on('room-updated', ({ players }) => {
      updateRoomPlayers(players);
    });

    socket.on('room-left', () => {
      reset();
      setCurrentRoom(null);
    });

    // Game events
    socket.on('game-started', ({ gameState }) => {
      setGameState(gameState);
      showToast('Game started!', 'success');
    });

    socket.on('game-state', ({ gameState }) => {
      setGameState(gameState);
    });

    socket.on('hand-started', ({ handNumber, trumpSuit }) => {
      showToast(`Hand ${handNumber} started. Trump: ${trumpSuit}`, 'info');
    });

    socket.on('your-turn', () => {
      showToast('Your turn!', 'info');
    });

    socket.on('waiting-for', ({ player }) => {
      setWaitingFor(player);
    });

    socket.on('card-played', () => {
      // State update happens via game-state event
    });

    socket.on('play-rejected', ({ violation }) => {
      setLastViolation(violation);
      showToast(violation.message, 'error');
    });

    socket.on('trick-complete', ({ winner }) => {
      showToast(`${winner} wins the trick!`, 'info');
    });

    socket.on('hand-complete', ({ winner }) => {
      showToast(`${winner} wins the hand!`, 'success');
    });

    socket.on('rule-creation-phase', ({ winner }) => {
      const myPosition = useGameStore.getState().myPosition;
      if (winner === myPosition) {
        setShowRuleCreator(true);
        showToast('You won! Create a new rule.', 'success');
      } else {
        showToast(`${winner} is creating a rule...`, 'info');
      }
    });

    socket.on('rule-created', ({ rule }) => {
      setShowRuleCreator(false);
      showToast(`New rule: ${rule.name}`, 'info');
    });

    // Connect
    connectSocket();

    return () => {
      socket.off('connected');
      socket.off('disconnect');
      socket.off('error');
      socket.off('lobby-state');
      socket.off('room-joined');
      socket.off('room-updated');
      socket.off('room-left');
      socket.off('game-started');
      socket.off('game-state');
      socket.off('hand-started');
      socket.off('your-turn');
      socket.off('waiting-for');
      socket.off('card-played');
      socket.off('play-rejected');
      socket.off('trick-complete');
      socket.off('hand-complete');
      socket.off('rule-creation-phase');
      socket.off('rule-created');
      disconnectSocket();
    };
  }, []);
}

/**
 * Hook for sending game actions
 */
export function useGameActions() {
  const joinLobby = useCallback((playerName: string) => {
    getSocket().emit('join-lobby', { playerName });
  }, []);

  const createRoom = useCallback((roomName: string) => {
    getSocket().emit('create-room', { roomName });
  }, []);

  const joinRoom = useCallback((roomId: string, position?: PlayerPosition) => {
    getSocket().emit('join-room', { roomId, position });
  }, []);

  const leaveRoom = useCallback(() => {
    getSocket().emit('leave-room');
  }, []);

  const startGame = useCallback(() => {
    getSocket().emit('start-game');
  }, []);

  const playCard = useCallback((card: Card, faceDown: boolean) => {
    getSocket().emit('play-card', { card, faceDown });
  }, []);

  const createRule = useCallback((rule: Omit<Rule, 'id' | 'createdBy' | 'createdAtHand' | 'createdAt' | 'isActive'>) => {
    getSocket().emit('create-rule', { rule });
  }, []);

  const addBot = useCallback((position: PlayerPosition) => {
    getSocket().emit('add-bot', { position });
  }, []);

  const removeBot = useCallback((position: PlayerPosition) => {
    getSocket().emit('remove-bot', { position });
  }, []);

  return {
    joinLobby,
    createRoom,
    joinRoom,
    leaveRoom,
    startGame,
    playCard,
    createRule,
    addBot,
    removeBot,
  };
}
