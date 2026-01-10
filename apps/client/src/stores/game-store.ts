import { create } from 'zustand';
import type {
  ClientGameState,
  Card,
  PlayerPosition,
  RuleViolation,
  PlayedCard,
} from '@fkthepope/shared';

interface GameStore {
  // Connection state
  isConnected: boolean;
  playerId: string | null;
  playerName: string;

  // Room state
  roomId: string | null;
  myPosition: PlayerPosition | null;

  // Game state
  gameState: ClientGameState | null;

  // UI state
  selectedCard: Card | null;
  lastViolation: RuleViolation | null;
  waitingFor: PlayerPosition | null;

  // Actions
  setConnected: (connected: boolean, playerId?: string) => void;
  setPlayerName: (name: string) => void;
  setRoom: (roomId: string | null, position: PlayerPosition | null) => void;
  setGameState: (state: ClientGameState | null) => void;
  setSelectedCard: (card: Card | null) => void;
  setLastViolation: (violation: RuleViolation | null) => void;
  setWaitingFor: (player: PlayerPosition | null) => void;
  addPlayedCard: (player: PlayerPosition, card: Card, faceDown: boolean) => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  // Initial state
  isConnected: false,
  playerId: null,
  playerName: '',
  roomId: null,
  myPosition: null,
  gameState: null,
  selectedCard: null,
  lastViolation: null,
  waitingFor: null,

  // Actions
  setConnected: (connected, playerId) =>
    set({ isConnected: connected, playerId: playerId ?? null }),

  setPlayerName: (name) => set({ playerName: name }),

  setRoom: (roomId, position) =>
    set({ roomId, myPosition: position }),

  setGameState: (state) => set({ gameState: state }),

  setSelectedCard: (card) => set({ selectedCard: card }),

  setLastViolation: (violation) => set({ lastViolation: violation }),

  setWaitingFor: (player) => set({ waitingFor: player }),

  addPlayedCard: (player, card, faceDown) =>
    set((state) => {
      if (!state.gameState?.currentHand?.currentTrick) return state;

      const newCard: PlayedCard = { card, playedBy: player, faceDown, playedAt: Date.now() };
      const currentCards = state.gameState.currentHand.currentTrick.cards;

      // Don't add if already present
      if (currentCards.some((c) => c.playedBy === player)) return state;

      return {
        gameState: {
          ...state.gameState,
          currentHand: {
            ...state.gameState.currentHand,
            currentTrick: {
              ...state.gameState.currentHand.currentTrick,
              cards: [...currentCards, newCard],
            },
          },
        },
      };
    }),

  reset: () =>
    set({
      roomId: null,
      myPosition: null,
      gameState: null,
      selectedCard: null,
      lastViolation: null,
      waitingFor: null,
    }),
}));

// Derived selectors
export const useIsMyTurn = () =>
  useGameStore((state) => {
    if (!state.gameState || !state.myPosition) return false;
    const currentTrick = state.gameState.currentHand?.currentTrick;
    return currentTrick?.currentPlayer === state.myPosition;
  });

export const useMyHand = () =>
  useGameStore((state) => state.gameState?.myHand ?? []);

export const useLegalMoves = () =>
  useGameStore((state) => state.gameState?.legalMoves ?? []);

export const useCurrentTrick = () =>
  useGameStore((state) => state.gameState?.currentHand?.currentTrick ?? null);

export const useActiveRules = () =>
  useGameStore((state) => state.gameState?.rules ?? []);

export const useScores = () =>
  useGameStore((state) => state.gameState?.scores ?? { north: 0, east: 0, south: 0, west: 0 });

export const useTrumpSuit = () =>
  useGameStore((state) => state.gameState?.currentHand?.trumpSuit ?? null);

export const useGamePhase = () =>
  useGameStore((state) => state.gameState?.phase ?? 'waiting');
