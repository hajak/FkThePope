import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type {
  ClientGameState,
  Card,
  PlayerPosition,
  RuleViolation,
  PlayedCard,
  TrickState,
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

  // Preserved trick state for animation (prevents race condition)
  preservedTrick: TrickState | null;
  isPreservingTrick: boolean;

  // UI state
  selectedCard: Card | null;
  lastViolation: RuleViolation | null;
  waitingFor: PlayerPosition | null;

  // Actions
  setConnected: (connected: boolean, playerId?: string) => void;
  setPlayerName: (name: string) => void;
  setRoom: (roomId: string | null, position: PlayerPosition | null) => void;
  setGameState: (state: ClientGameState | null) => void;
  setGameStatePreservingTrick: (state: ClientGameState | null) => void;
  setSelectedCard: (card: Card | null) => void;
  setLastViolation: (violation: RuleViolation | null) => void;
  setWaitingFor: (player: PlayerPosition | null) => void;
  addPlayedCard: (player: PlayerPosition, card: Card, faceDown: boolean) => void;
  preserveTrick: () => void;
  clearPreservedTrick: () => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  // Initial state
  isConnected: false,
  playerId: null,
  playerName: '',
  roomId: null,
  myPosition: null,
  gameState: null,
  preservedTrick: null,
  isPreservingTrick: false,
  selectedCard: null,
  lastViolation: null,
  waitingFor: null,

  // Actions
  setConnected: (connected, playerId) =>
    set({ isConnected: connected, playerId: playerId ?? null }),

  setPlayerName: (name) => set({ playerName: name }),

  setRoom: (roomId, position) =>
    set({ roomId, myPosition: position }),

  setGameState: (state) => {
    if (!state) {
      set({ gameState: state });
      return;
    }

    // Merge current trick cards to avoid race condition where card-played arrives
    // before game-state and then game-state overwrites the card
    const currentState = get();
    const existingTrick = currentState.gameState?.currentHand?.currentTrick;
    const newTrick = state.currentHand?.currentTrick;

    // If we have existing trick cards that aren't in the new state, preserve them
    if (existingTrick?.cards?.length && state.currentHand) {
      const existingCards = existingTrick.cards;
      const newCards = newTrick?.cards ?? [];

      // Merge: add any cards from existing trick that aren't in new trick
      const mergedCards = [...newCards];
      for (const existingCard of existingCards) {
        if (!mergedCards.some(c => c.playedBy === existingCard.playedBy)) {
          mergedCards.push(existingCard);
        }
      }

      // Only merge if we have more cards locally
      if (mergedCards.length > newCards.length && mergedCards[0]) {
        const firstCard = mergedCards[0];
        set({
          gameState: {
            ...state,
            currentHand: {
              ...state.currentHand,
              currentTrick: {
                cards: mergedCards,
                leadSuit: newTrick?.leadSuit ?? firstCard.card.suit,
                leader: newTrick?.leader ?? firstCard.playedBy,
                currentPlayer: newTrick?.currentPlayer ?? mergedCards[mergedCards.length - 1]?.playedBy ?? firstCard.playedBy,
                trickNumber: newTrick?.trickNumber ?? (state.currentHand.completedTricks?.length ?? 0) + 1,
                winner: newTrick?.winner,
              },
            },
          },
        });
        return;
      }
    }

    set({ gameState: state });
  },

  // Set game state but preserve current trick if we're animating
  setGameStatePreservingTrick: (state) => {
    const { isPreservingTrick, preservedTrick } = get();

    if (!state) {
      set({ gameState: state });
      return;
    }

    // If we're preserving the trick, merge the preserved trick into the new state
    if (isPreservingTrick && preservedTrick && state.currentHand) {
      set({
        gameState: {
          ...state,
          currentHand: {
            ...state.currentHand,
            currentTrick: preservedTrick,
          },
        },
      });
    } else {
      set({ gameState: state });
    }
  },

  setSelectedCard: (card) => set({ selectedCard: card }),

  setLastViolation: (violation) => set({ lastViolation: violation }),

  setWaitingFor: (player) => set({ waitingFor: player }),

  addPlayedCard: (player, card, faceDown) =>
    set((state) => {
      // Need at least gameState and currentHand to add a card
      if (!state.gameState?.currentHand) return state;

      const newCard: PlayedCard = { card, playedBy: player, faceDown, playedAt: Date.now() };

      // Get current trick or initialize an empty one (handles race condition)
      const currentTrick = state.gameState.currentHand.currentTrick ?? {
        cards: [],
        leadSuit: card.suit, // First card sets the lead suit
        leader: player, // First player to play leads
        currentPlayer: player,
        trickNumber: (state.gameState.currentHand.completedTricks?.length ?? 0) + 1,
      };

      const currentCards = currentTrick.cards;

      // Don't add if already present
      if (currentCards.some((c) => c.playedBy === player)) return state;

      const updatedTrick = {
        ...currentTrick,
        cards: [...currentCards, newCard],
      };

      return {
        gameState: {
          ...state.gameState,
          currentHand: {
            ...state.gameState.currentHand,
            currentTrick: updatedTrick,
          },
        },
        // Don't update preserved trick - it should be a frozen snapshot for animation
      };
    }),

  preserveTrick: () => {
    const { gameState } = get();
    const currentTrick = gameState?.currentHand?.currentTrick ?? null;
    set({ preservedTrick: currentTrick, isPreservingTrick: true });
  },

  clearPreservedTrick: () => {
    set({ preservedTrick: null, isPreservingTrick: false });
  },

  reset: () =>
    set({
      roomId: null,
      myPosition: null,
      gameState: null,
      preservedTrick: null,
      isPreservingTrick: false,
      selectedCard: null,
      lastViolation: null,
      waitingFor: null,
    }),
}));

// Memoized selectors using shallow comparison for complex objects
export const useIsMyTurn = () =>
  useGameStore((state) => {
    if (!state.gameState || !state.myPosition) return false;
    // Use waitingFor from server's waiting-for event - more reliable than currentTrick.currentPlayer
    // because it updates immediately when turn changes, before game-state arrives
    return state.waitingFor === state.myPosition;
  });

export const useMyHand = () =>
  useGameStore(useShallow((state) => state.gameState?.myHand ?? []));

export const useLegalMoves = () =>
  useGameStore(useShallow((state) => state.gameState?.legalMoves ?? []));

export const useCurrentTrick = () =>
  useGameStore(useShallow((state) => {
    // Return preserved trick if we're animating, otherwise current trick
    if (state.isPreservingTrick && state.preservedTrick) {
      return state.preservedTrick;
    }
    return state.gameState?.currentHand?.currentTrick ?? null;
  }));

export const useActiveRules = () =>
  useGameStore(useShallow((state) => state.gameState?.rules ?? []));

export const useScores = () =>
  useGameStore(
    useShallow((state) => state.gameState?.scores ?? { north: 0, east: 0, south: 0, west: 0 })
  );

export const useTrumpSuit = () =>
  useGameStore((state) => state.gameState?.currentHand?.trumpSuit ?? null);

export const useGamePhase = () =>
  useGameStore((state) => state.gameState?.phase ?? 'waiting');

// Selector for connection and room info
export const useConnectionInfo = () =>
  useGameStore(
    useShallow((state) => ({
      isConnected: state.isConnected,
      playerId: state.playerId,
      roomId: state.roomId,
      myPosition: state.myPosition,
    }))
  );
