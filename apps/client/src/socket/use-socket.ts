import { useEffect, useCallback, useRef } from 'react';
import type { Card, PlayerPosition } from '@fkthepope/shared';
import { getSocket, connectSocket, disconnectSocket, onConnectionChange, storeSession, clearSession } from './socket-client';
import { useGameStore } from '../stores/game-store';
import { useLobbyStore } from '../stores/lobby-store';
import { useUiStore } from '../stores/ui-store';
import { useVideoStore } from '../stores/video-store';

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
  const setConnectionState = useUiStore((s) => s.setConnectionState);
  const startTrickAnimation = useUiStore((s) => s.startTrickAnimation);
  const clearTrickComplete = useUiStore((s) => s.clearTrickComplete);
  const setHandResult = useUiStore((s) => s.setHandResult);
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

    socket.on('room-joined', ({ roomId, roomName, position, players }) => {
      setRoom(roomId, position);
      setCurrentRoom({ id: roomId, name: roomName, players });
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
      // Clear any animation state when game starts
      clearTrickComplete();
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
      // Clear any lingering animation state from previous hand
      clearTrickComplete();
      clearPreservedTrick();
      isAnimatingRef.current = false;
      showToast(`Hand ${handNumber} started. Trump: ${trumpSuit}`, 'info');
    });

    socket.on('your-turn', () => {
      showToast('Your turn!', 'info');
    });

    socket.on('waiting-for', ({ player }) => {
      setWaitingFor(player);
    });

    socket.on('card-played', ({ player, card, faceDown }) => {
      // Clear trickComplete flag when a new card is played
      // This makes cards visible again for the new trick
      const trickComplete = useUiStore.getState().trickComplete;
      if (trickComplete) {
        clearTrickComplete();
      }

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

    socket.on('hand-complete', ({ winner, tricks }) => {
      setHandResult({ winner, tricks });
    });

    // WebRTC signaling events
    socket.on('webrtc-offer', async ({ from, offer }) => {
      await useVideoStore.getState().handleOffer(from, offer);
    });

    socket.on('webrtc-answer', async ({ from, answer }) => {
      await useVideoStore.getState().handleAnswer(from, answer);
    });

    socket.on('webrtc-ice-candidate', async ({ from, candidate }) => {
      await useVideoStore.getState().handleIceCandidate(from, candidate);
    });

    // Player mute status
    socket.on('player-mute-status', ({ player, isMuted }) => {
      useVideoStore.getState().setPlayerMuteStatus(player, isMuted);
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
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('webrtc-ice-candidate');
      socket.off('player-mute-status');
      unsubscribeConnection();
      cleanup();
      useVideoStore.getState().cleanup();
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

  const addBot = useCallback((position: PlayerPosition) => {
    getSocket().emit('add-bot', { position });
  }, []);

  const removeBot = useCallback((position: PlayerPosition) => {
    getSocket().emit('remove-bot', { position });
  }, []);

  const continueGame = useCallback(() => {
    getSocket().emit('continue-game');
  }, []);

  return {
    joinLobby,
    createRoom,
    joinRoom,
    leaveRoom,
    startGame,
    playCard,
    addBot,
    removeBot,
    continueGame,
  };
}
