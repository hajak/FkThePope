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
  const setPendingJoin = useLobbyStore((s) => s.setPendingJoin);
  const setPendingPlayers = useLobbyStore((s) => s.setPendingPlayers);
  const addPendingPlayer = useLobbyStore((s) => s.addPendingPlayer);
  const addChatMessage = useLobbyStore((s) => s.addChatMessage);
  const clearChatMessages = useLobbyStore((s) => s.clearChatMessages);

  const showToast = useUiStore((s) => s.showToast);
  const setConnectionState = useUiStore((s) => s.setConnectionState);
  const startTrickAnimation = useUiStore((s) => s.startTrickAnimation);
  const clearTrickComplete = useUiStore((s) => s.clearTrickComplete);
  const setIsAnimatingTrick = useUiStore((s) => s.setIsAnimatingTrick);
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

    socket.on('room-joined', ({ roomId, roomName, position, players, isHost }) => {
      setRoom(roomId, position);
      setCurrentRoom({ id: roomId, name: roomName, players, isHost });
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
      setPendingJoin(null);
      clearChatMessages();
      clearSession();
      // Stop video when leaving room
      useVideoStore.getState().stopVideo();
    });

    // Chat events
    socket.on('room-chat', ({ message }) => {
      addChatMessage(message);
    });

    // Player approval events
    socket.on('join-requested', ({ roomId, roomName }) => {
      setPendingJoin({ roomId, roomName });
      showToast(`Waiting for host to approve your join request...`, 'info');
    });

    socket.on('join-request', ({ pending }) => {
      addPendingPlayer(pending);
      showToast(`${pending.playerName} wants to join!`, 'info');
    });

    socket.on('pending-players', ({ pending }) => {
      setPendingPlayers(pending);
    });

    socket.on('join-approved', () => {
      setPendingJoin(null);
      showToast(`You've been approved!`, 'success');
    });

    socket.on('join-rejected', ({ message }) => {
      setPendingJoin(null);
      showToast(message, 'error');
    });

    // Game events
    socket.on('game-started', ({ gameState }) => {
      // Clear any animation state when game starts
      clearTrickComplete();
      setGameState(gameState);
      showToast('Game started!', 'success');
    });

    socket.on('game-state', ({ gameState }) => {
      // Debug: Log game-state arrival
      const currentState = useGameStore.getState();
      console.log('[game-state] Received:', {
        serverTrickCards: gameState.currentHand?.currentTrick?.cards?.length ?? 0,
        localTrickCards: currentState.gameState?.currentHand?.currentTrick?.cards?.length ?? 0,
        isAnimating: isAnimatingRef.current,
        isPreserving: currentState.isPreservingTrick,
      });

      // Use preserving version if we're animating
      if (isAnimatingRef.current) {
        setGameStatePreservingTrick(gameState);
      } else {
        setGameState(gameState);
      }

      // Debug: Log state after update
      const stateAfter = useGameStore.getState();
      console.log('[game-state] After update:', {
        trickCards: stateAfter.gameState?.currentHand?.currentTrick?.cards?.length ?? 0,
      });

      // Stop video when game ends
      if (gameState.phase === 'game_end') {
        useVideoStore.getState().stopVideo();
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
      // Debug: Log card-played event and state before processing
      const stateBefore = useGameStore.getState();
      const uiStateBefore = useUiStore.getState();
      console.log('[card-played] Received:', {
        player,
        card: `${card.rank}${card.suit[0]}`,
        faceDown,
        isPreservingTrick: stateBefore.isPreservingTrick,
        isAnimatingTrick: uiStateBefore.isAnimatingTrick,
        hasGameState: !!stateBefore.gameState,
        hasCurrentHand: !!stateBefore.gameState?.currentHand,
        currentTrickCards: stateBefore.gameState?.currentHand?.currentTrick?.cards?.length ?? 0,
        preservedTrickCards: stateBefore.preservedTrick?.cards?.length ?? 0,
      });

      // ALWAYS clear ALL animation/preservation state when a new card is played.
      // This is critical for multiple reasons:
      // 1. Even if the animation timeout hasn't fired yet, we need to show the new card immediately
      // 2. isAnimatingTrick in UI store controls card positioning - if true, cards are off-screen!
      // 3. Race condition between animation timeout and bot play could cause old trick to show
      clearTrickComplete();
      clearPreservedTrick();
      setIsAnimatingTrick(false); // Critical: this controls card positioning in TrickPile!
      isAnimatingRef.current = false;

      // Add card to trick immediately so it shows before game-state update
      const addPlayedCard = useGameStore.getState().addPlayedCard;
      addPlayedCard(player, card, faceDown);

      // Debug: Log state after processing
      const stateAfter = useGameStore.getState();
      console.log('[card-played] After add:', {
        currentTrickCards: stateAfter.gameState?.currentHand?.currentTrick?.cards?.length ?? 0,
        trickCardsList: stateAfter.gameState?.currentHand?.currentTrick?.cards?.map(c => `${c.playedBy}:${c.card.rank}${c.card.suit[0]}`).join(', ') || 'none',
        isPreservingTrick: stateAfter.isPreservingTrick,
      });
    });

    socket.on('play-rejected', ({ violation }) => {
      setLastViolation(violation);
      showToast(violation.message, 'error');
    });

    socket.on('trick-complete', ({ winner }) => {
      console.log('[trick-complete] Received, winner:', winner);

      // Preserve the trick so it doesn't get cleared by game-state updates
      preserveTrick();
      isAnimatingRef.current = true;

      const state = useGameStore.getState();
      console.log('[trick-complete] Preserved trick with', state.preservedTrick?.cards?.length ?? 0, 'cards');

      // Get player name for the toast
      const gameState = state.gameState;
      const winnerName = gameState?.players[winner]?.name || winner;
      showToast(`${winnerName} wins the trick!`, 'info');

      // Start the trick animation
      startTrickAnimation(winner);

      // Clear preservation after animation completes (matches animation timing +20%)
      setTimeout(() => {
        console.log('[trick-complete] Animation timeout fired, clearing preservation');
        isAnimatingRef.current = false;
        clearPreservedTrick();
      }, 2640);
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

    // Player disconnect/reconnect during game
    socket.on('player-disconnected', ({ playerName }) => {
      showToast(`${playerName} disconnected`, 'warning');
    });

    socket.on('player-reconnected', ({ playerName }) => {
      showToast(`${playerName} reconnected`, 'success');
    });

    socket.on('player-replaced', () => {
      showToast(`Player replaced with bot`, 'info');
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
      socket.off('join-requested');
      socket.off('join-request');
      socket.off('pending-players');
      socket.off('join-approved');
      socket.off('join-rejected');
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
      socket.off('room-chat');
      socket.off('player-disconnected');
      socket.off('player-reconnected');
      socket.off('player-replaced');
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

  const replaceWithBot = useCallback((position: PlayerPosition) => {
    getSocket().emit('replace-with-bot', { position });
  }, []);

  const continueGame = useCallback(() => {
    getSocket().emit('continue-game');
  }, []);

  const approvePlayer = useCallback((socketId: string) => {
    getSocket().emit('approve-player', { socketId });
  }, []);

  const rejectPlayer = useCallback((socketId: string) => {
    getSocket().emit('reject-player', { socketId });
  }, []);

  const cancelJoinRequest = useCallback(() => {
    useLobbyStore.getState().setPendingJoin(null);
  }, []);

  const sendChatMessage = useCallback((message: string) => {
    if (message.trim()) {
      getSocket().emit('chat-message', { message: message.trim() });
    }
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
    replaceWithBot,
    continueGame,
    approvePlayer,
    rejectPlayer,
    cancelJoinRequest,
    sendChatMessage,
  };
}
