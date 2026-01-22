import { useEffect, useCallback, useRef } from 'react';
import type { Card, PlayerPosition, GameType, ClientGameState } from '@fkthepope/shared';
import { getSocket, connectSocket, disconnectSocket, onConnectionChange, storeSession, clearSession } from './socket-client';
import { useGameStore } from '../stores/game-store';
import { useLobbyStore } from '../stores/lobby-store';
import { useUiStore } from '../stores/ui-store';
import { useVideoStore } from '../stores/video-store';

// Type for Bridge bid
interface BridgeBid {
  type: string;
  level?: number;
  strain?: string;
}

/**
 * Main socket hook - sets up all event listeners
 */
export function useSocket() {
  const setConnected = useGameStore((s) => s.setConnected);
  const setRoom = useGameStore((s) => s.setRoom);
  const setGameType = useGameStore((s) => s.setGameType);
  const setGameState = useGameStore((s) => s.setGameState);
  const setGameStatePreservingTrick = useGameStore((s) => s.setGameStatePreservingTrick);
  const setBridgeState = useGameStore((s) => s.setBridgeState);
  const setSkitgubbeState = useGameStore((s) => s.setSkitgubbeState);
  const setLastViolation = useGameStore((s) => s.setLastViolation);
  const setWaitingFor = useGameStore((s) => s.setWaitingFor);
  const preserveTrick = useGameStore((s) => s.preserveTrick);
  const clearPreservedTrick = useGameStore((s) => s.clearPreservedTrick);
  const addBridgePlayedCard = useGameStore((s) => s.addBridgePlayedCard);
  const addSkitgubbePlayedCard = useGameStore((s) => s.addSkitgubbePlayedCard);
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

    socket.on('room-joined', ({ roomId, roomName, gameType, maxPlayers, position, players, isHost }) => {
      setRoom(roomId, position);
      setCurrentRoom({ id: roomId, name: roomName, gameType, maxPlayers, players, isHost });
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
    socket.on('game-started', ({ gameState, gameType }) => {
      // Clear any animation state when game starts
      clearTrickComplete();
      setGameType(gameType);

      if (gameType === 'whist' || !gameType) {
        setGameState(gameState as ClientGameState);
        setBridgeState(null);
        setSkitgubbeState(null);
      } else if (gameType === 'bridge') {
        // Add extra tracking fields for local state
        const bridgeState = gameState as any;
        setBridgeState({
          ...bridgeState,
          biddingHistory: (bridgeState.bids || []).map((bid: any) => ({
            player: bid.player,
            bid: { type: bid.type, level: bid.level, strain: bid.strain },
          })),
        });
        setGameState(null);
        setSkitgubbeState(null);
      } else if (gameType === 'skitgubbe') {
        // Add extra tracking fields for local state
        const skitgubbeState = gameState as any;
        const handCounts: Record<string, number> = {};
        const playersOut: string[] = [];
        for (const pos of ['north', 'east', 'south', 'west']) {
          const p = skitgubbeState.players?.[pos];
          if (p) {
            handCounts[pos] = p.cardCount || 0;
            if (p.isOut) playersOut.push(pos);
          }
        }
        setSkitgubbeState({
          ...skitgubbeState,
          handCounts,
          playersOut,
        });
        setGameState(null);
        setBridgeState(null);
      }
      showToast('Game started!', 'success');
    });

    socket.on('game-state', ({ gameState, gameType }) => {
      const currentGameType = gameType ?? useGameStore.getState().gameType;

      if (currentGameType === 'whist' || !currentGameType) {
        const typedState = gameState as ClientGameState;
        if (isAnimatingRef.current) {
          setGameStatePreservingTrick(typedState);
        } else {
          setGameState(typedState);
        }
        if (typedState?.phase === 'game_end') {
          useVideoStore.getState().stopVideo();
        }
      } else if (currentGameType === 'bridge') {
        const bridgeState = gameState as any;
        setBridgeState({
          ...bridgeState,
          biddingHistory: (bridgeState.bids || []).map((bid: any) => ({
            player: bid.player,
            bid: { type: bid.type, level: bid.level, strain: bid.strain },
          })),
        });
        if (bridgeState?.phase === 'game_end' || bridgeState?.phase === 'hand_end') {
          useVideoStore.getState().stopVideo();
        }
      } else if (currentGameType === 'skitgubbe') {
        const skitgubbeState = gameState as any;
        const handCounts: Record<string, number> = {};
        const playersOut: string[] = [];
        for (const pos of ['north', 'east', 'south', 'west']) {
          const p = skitgubbeState.players?.[pos];
          if (p) {
            handCounts[pos] = p.cardCount || 0;
            if (p.isOut) playersOut.push(pos);
          }
        }
        setSkitgubbeState({
          ...skitgubbeState,
          handCounts,
          playersOut,
        });
        if (skitgubbeState?.phase === 'game_end') {
          useVideoStore.getState().stopVideo();
        }
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
      // Clear all animation/preservation state to ensure cards render on-screen
      clearTrickComplete();
      clearPreservedTrick();
      setIsAnimatingTrick(false);
      isAnimatingRef.current = false;

      const currentGameType = useGameStore.getState().gameType;
      if (currentGameType === 'bridge') {
        addBridgePlayedCard(player, card);
      } else if (currentGameType === 'skitgubbe') {
        addSkitgubbePlayedCard(player, card);
      } else {
        useGameStore.getState().addPlayedCard(player, card, faceDown);
      }
    });

    socket.on('play-rejected', ({ violation }) => {
      setLastViolation(violation);
      showToast(violation.message, 'error');
    });

    socket.on('trick-complete', ({ winner }) => {
      preserveTrick();
      isAnimatingRef.current = true;

      const winnerName = useGameStore.getState().gameState?.players[winner]?.name || winner;
      showToast(`${winnerName} wins the trick!`, 'info');
      startTrickAnimation(winner);

      setTimeout(() => {
        isAnimatingRef.current = false;
        clearPreservedTrick();
      }, 2640);
    });

    socket.on('hand-complete', ({ winner, tricks }) => {
      setHandResult({ winner, tricks });
    });

    // Bridge-specific events
    socket.on('bridge-bid-made', ({ player, bidType, level, strain }) => {
      const bid: BridgeBid = { type: bidType };
      if (level !== undefined) bid.level = level;
      if (strain !== undefined) bid.strain = strain;

      const bridgeState = useGameStore.getState().bridgeState;
      if (bridgeState) {
        setBridgeState({
          ...bridgeState,
          biddingHistory: [...bridgeState.biddingHistory, { player, bid }],
        });
      }

      const playerName = bridgeState?.players[player]?.name || player;
      if (bidType === 'pass') {
        showToast(`${playerName} passed`, 'info');
      } else if (bidType === 'double') {
        showToast(`${playerName} doubled!`, 'info');
      } else if (bidType === 'redouble') {
        showToast(`${playerName} redoubled!`, 'info');
      } else if (level && strain) {
        showToast(`${playerName} bid ${level}${strain}`, 'info');
      }
    });

    socket.on('bridge-bidding-complete', ({ contract, passed }) => {
      if (passed) {
        showToast('All passed - no contract', 'info');
      } else if (contract) {
        const c = contract as any;
        showToast(`Contract: ${c.level}${c.strain} by ${c.declarer}`, 'success');
      }
      const bridgeState = useGameStore.getState().bridgeState;
      if (bridgeState) {
        setBridgeState({
          ...bridgeState,
          contract: contract as any,
          phase: passed ? 'game_end' : 'playing',
        });
      }
    });

    socket.on('bridge-dummy-revealed', ({ dummyPosition, dummyHand }) => {
      const bridgeState = useGameStore.getState().bridgeState;
      if (bridgeState) {
        setBridgeState({
          ...bridgeState,
          dummyHand,
        });
      }
      showToast(`Dummy (${dummyPosition}) hand revealed`, 'info');
    });

    // Skitgubbe-specific events
    socket.on('skitgubbe-duel-card', ({ player, card, isLeader }) => {
      const skitgubbeState = useGameStore.getState().skitgubbeState;
      const playerName = skitgubbeState?.players[player]?.name || player;
      if (isLeader) {
        showToast(`${playerName} leads with ${card.rank} of ${card.suit}`, 'info');
      } else {
        showToast(`${playerName} responds with ${card.rank} of ${card.suit}`, 'info');
      }
    });

    socket.on('skitgubbe-duel-result', ({ winner, isTie }) => {
      const skitgubbeState = useGameStore.getState().skitgubbeState;
      if (isTie) {
        showToast(`It's a tie! Cards go to the tie pile.`, 'info');
      } else if (winner) {
        const winnerName = skitgubbeState?.players[winner]?.name || winner;
        showToast(`${winnerName} wins the duel!`, 'success');
      }
    });

    socket.on('skitgubbe-draw', ({ player }) => {
      const skitgubbeState = useGameStore.getState().skitgubbeState;
      const playerName = skitgubbeState?.players[player]?.name || player;
      showToast(`${playerName} draws a card`, 'info');
    });

    socket.on('skitgubbe-phase-change', ({ phase }) => {
      if (phase === 'shedding') {
        showToast(`Collection phase complete! Now shed your cards - follow suit to beat!`, 'success');
      }
    });

    socket.on('skitgubbe-trick-card', ({ player, card }) => {
      const skitgubbeState = useGameStore.getState().skitgubbeState;
      const playerName = skitgubbeState?.players[player]?.name || player;
      showToast(`${playerName} plays ${card.rank} of ${card.suit}`, 'info');
    });

    socket.on('skitgubbe-trick-result', ({ winner }) => {
      const skitgubbeState = useGameStore.getState().skitgubbeState;
      const winnerName = skitgubbeState?.players[winner]?.name || winner;
      showToast(`${winnerName} takes the trick`, 'info');
    });

    socket.on('skitgubbe-pickup', ({ player, cardsPickedUp }) => {
      const skitgubbeState = useGameStore.getState().skitgubbeState;
      const playerName = skitgubbeState?.players[player]?.name || player;
      showToast(`${playerName} picks up ${cardsPickedUp} cards`, 'info');
    });

    socket.on('skitgubbe-player-out', ({ player }) => {
      const skitgubbeState = useGameStore.getState().skitgubbeState;
      const playerName = skitgubbeState?.players[player]?.name || player;
      showToast(`${playerName} is out!`, 'success');
      if (skitgubbeState) {
        setSkitgubbeState({
          ...skitgubbeState,
          finishOrder: [...skitgubbeState.finishOrder, player],
        });
      }
    });

    // Game ended (all games)
    socket.on('game-ended', ({ loser, winner }) => {
      const gameType = useGameStore.getState().gameType;
      if (gameType === 'skitgubbe' && loser) {
        const skitgubbeState = useGameStore.getState().skitgubbeState;
        const loserName = skitgubbeState?.players[loser]?.name || loser;
        showToast(`${loserName} is the Skitgubbe!`, 'info');
        if (skitgubbeState) {
          setSkitgubbeState({
            ...skitgubbeState,
            phase: 'game_end',
            loser,
          });
        }
      } else if (winner) {
        showToast(`Game over! Winner: ${winner}`, 'success');
      }
      useVideoStore.getState().stopVideo();
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

    socket.on('player-kicked', () => {
      showToast(`Player was kicked from the room`, 'info');
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
      socket.off('bridge-bid-made');
      socket.off('bridge-bidding-complete');
      socket.off('bridge-dummy-revealed');
      socket.off('skitgubbe-duel-card');
      socket.off('skitgubbe-duel-result');
      socket.off('skitgubbe-draw');
      socket.off('skitgubbe-phase-change');
      socket.off('skitgubbe-trick-card');
      socket.off('skitgubbe-trick-result');
      socket.off('skitgubbe-pickup');
      socket.off('skitgubbe-player-out');
      socket.off('game-ended');
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('webrtc-ice-candidate');
      socket.off('player-mute-status');
      socket.off('room-chat');
      socket.off('player-disconnected');
      socket.off('player-reconnected');
      socket.off('player-replaced');
      socket.off('player-kicked');
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

  const createRoom = useCallback((roomName: string, gameType: GameType = 'whist') => {
    getSocket().emit('create-room', { roomName, gameType });
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

  const kickPlayer = useCallback((position: PlayerPosition) => {
    getSocket().emit('kick-player', { position });
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

  // Bridge-specific actions
  const bridgeBid = useCallback((bidType: 'bid' | 'pass' | 'double' | 'redouble', level?: number, strain?: string) => {
    const now = Date.now();
    if (now - lastPlayTimeRef.current < DEBOUNCE_MS) {
      return;
    }
    lastPlayTimeRef.current = now;

    getSocket().emit('bridge-bid', { bidType, level, strain });
  }, []);

  const bridgePlay = useCallback((card: Card, fromDummy?: boolean) => {
    const now = Date.now();
    if (now - lastPlayTimeRef.current < DEBOUNCE_MS) {
      return;
    }
    lastPlayTimeRef.current = now;

    getSocket().emit('bridge-play', { card, fromDummy });
  }, []);

  // Skitgubbe-specific actions
  // Phase 1: Play a card in a duel
  const skitgubbeDuel = useCallback((card: Card) => {
    const now = Date.now();
    if (now - lastPlayTimeRef.current < DEBOUNCE_MS) {
      return;
    }
    lastPlayTimeRef.current = now;

    getSocket().emit('skitgubbe-duel', { card });
  }, []);

  // Phase 1: Draw a card instead of playing
  const skitgubbeDraw = useCallback(() => {
    const now = Date.now();
    if (now - lastPlayTimeRef.current < DEBOUNCE_MS) {
      return;
    }
    lastPlayTimeRef.current = now;

    getSocket().emit('skitgubbe-draw');
  }, []);

  // Phase 2: Play a card in shedding phase
  const skitgubbePlay = useCallback((card: Card) => {
    const now = Date.now();
    if (now - lastPlayTimeRef.current < DEBOUNCE_MS) {
      return;
    }
    lastPlayTimeRef.current = now;

    getSocket().emit('skitgubbe-play', { card });
  }, []);

  // Phase 2: Pick up the pile
  const skitgubbePickup = useCallback(() => {
    const now = Date.now();
    if (now - lastPlayTimeRef.current < DEBOUNCE_MS) {
      return;
    }
    lastPlayTimeRef.current = now;

    getSocket().emit('skitgubbe-pickup');
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
    kickPlayer,
    continueGame,
    approvePlayer,
    rejectPlayer,
    cancelJoinRequest,
    sendChatMessage,
    bridgeBid,
    bridgePlay,
    skitgubbeDuel,
    skitgubbeDraw,
    skitgubbePlay,
    skitgubbePickup,
  };
}
