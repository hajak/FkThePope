import { useEffect, useCallback, useRef } from 'react';
import type { Card, PlayerPosition, Rule } from '@fkthepope/shared';
import { getSocket, connectSocket, disconnectSocket, onConnectionChange, storeSession, clearSession } from './socket-client';
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
  const setGameStatePreservingTrick = useGameStore((s) => s.setGameStatePreservingTrick);
  const setLastViolation = useGameStore((s) => s.setLastViolation);
  const setWaitingFor = useGameStore((s) => s.setWaitingFor);
  const preserveTrick = useGameStore((s) => s.preserveTrick);
  const clearPreservedTrick = useGameStore((s) => s.clearPreservedTrick);
  const reset = useGameStore((s) => s.reset);

  const setRooms = useLobbyStore((s) => s.setRooms);
  const setCurrentRoom = useLobbyStore((s) => s.setCurrentRoom);
  const updateRoomPlayers = useLobbyStore((s) => s.updateRoomPlayers);

  const showToast = useUiStore((s) => s.showToast);
  const setShowRuleCreator = useUiStore((s) => s.setShowRuleCreator);
  const setConnectionState = useUiStore((s) => s.setConnectionState);
  const startTrickAnimation = useUiStore((s) => s.startTrickAnimation);
  const cleanup = useUiStore((s) => s.cleanup);

  // Track if we're in trick animation to preserve cards
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    const socket = getSocket();

    // Subscribe to connection state changes
    const unsubscribeConnection = onConnectionChange((connected, reconnecting) => {
      setConnectionState(connected, reconnecting);
      if (reconnecting) {
        showToast('Reconnecting to server...', 'warning');
      } else if (connected) {
        showToast('Connected!', 'success');
      }
    });

    // Connection events
    socket.on('connected', ({ playerId }) => {
      setConnected(true, playerId);
      setConnectionState(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
      setConnectionState(false);
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
      // Store session for reconnection
      const playerName = useGameStore.getState().playerName;
      storeSession(roomId, position, playerName);
    });

    socket.on('room-updated', ({ players }) => {
      updateRoomPlayers(players);
    });

    socket.on('room-left', () => {
      reset();
      setCurrentRoom(null);
      clearSession();
    });

    // Game events
    socket.on('game-started', ({ gameState }) => {
      setGameState(gameState);
      showToast('Game started!', 'success');
    });

    socket.on('game-state', ({ gameState }) => {
      // Use preserving version if we're animating
      if (isAnimatingRef.current) {
        setGameStatePreservingTrick(gameState);
      } else {
        setGameState(gameState);
      }
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

    socket.on('card-played', ({ player, card, faceDown }) => {
      // Add card to trick immediately so it shows before game-state update
      const addPlayedCard = useGameStore.getState().addPlayedCard;
      addPlayedCard(player, card, faceDown);
    });

    socket.on('play-rejected', ({ violation }) => {
      setLastViolation(violation);
      showToast(violation.message, 'error');
    });

    socket.on('trick-complete', ({ winner }) => {
      // Preserve the trick so it doesn't get cleared by game-state updates
      preserveTrick();
      isAnimatingRef.current = true;

      showToast(`${winner} wins the trick!`, 'info');

      // Start the trick animation
      startTrickAnimation(winner);

      // Clear preservation after animation completes (matches animation timing)
      setTimeout(() => {
        isAnimatingRef.current = false;
        clearPreservedTrick();
      }, 2000);
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
      unsubscribeConnection();
      cleanup();
      disconnectSocket();
    };
  }, []);
}

/**
 * Hook for sending game actions with debouncing for rapid selections
 */
export function useGameActions() {
  const lastPlayTimeRef = useRef(0);
  const DEBOUNCE_MS = 300;

  const joinLobby = useCallback((playerName: string) => {
    getSocket().emit('join-lobby', { playerName });
    // Store player name for reconnection
    storeSession(null, null, playerName);
  }, []);

  const createRoom = useCallback((roomName: string) => {
    getSocket().emit('create-room', { roomName });
  }, []);

  const joinRoom = useCallback((roomId: string, position?: PlayerPosition) => {
    getSocket().emit('join-room', { roomId, position });
  }, []);

  const leaveRoom = useCallback(() => {
    getSocket().emit('leave-room');
    clearSession();
  }, []);

  const startGame = useCallback(() => {
    getSocket().emit('start-game');
  }, []);

  const playCard = useCallback((card: Card, faceDown: boolean) => {
    // Debounce rapid card plays
    const now = Date.now();
    if (now - lastPlayTimeRef.current < DEBOUNCE_MS) {
      return;
    }
    lastPlayTimeRef.current = now;

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
