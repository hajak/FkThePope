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

/**
 * Helper: Check if a trick is complete (has 4 cards)
 */
function isTrickComplete(trick: TrickState | null | undefined): boolean {
  return (trick?.cards?.length ?? 0) >= 4;
}

/**
 * Helper: Merge local cards into server state when we have more recent cards locally.
 * Returns the trick to use, or null if no merging needed.
 */
function mergeLocalCards(
  localTrick: TrickState | null | undefined,
  serverTrick: TrickState | null | undefined,
  localHandNum: number | undefined,
  serverHandNum: number | undefined
): TrickState | null {
  // Don't merge if different hands
  if (localHandNum !== serverHandNum) return null;

  // Don't merge if local trick is complete (4 cards) - it should be cleared
  if (isTrickComplete(localTrick)) return null;

  // Don't merge if no local cards
  const localCards = localTrick?.cards ?? [];
  if (localCards.length === 0) return null;

  const serverCards = serverTrick?.cards ?? [];

  // Only merge if we have MORE cards locally than server
  if (localCards.length <= serverCards.length) return null;

  // Build merged cards: start with server cards, add any local cards not in server
  const mergedCards = [...serverCards];
  for (const localCard of localCards) {
    const alreadyInServer = serverCards.some(sc => sc.playedBy === localCard.playedBy);
    if (!alreadyInServer) {
      mergedCards.push(localCard);
    }
  }

  // If no new cards were added, no need to merge
  if (mergedCards.length === serverCards.length) return null;

  // Return merged trick
  const firstCard = mergedCards[0];
  if (!firstCard) return null;

  return {
    cards: mergedCards,
    leadSuit: serverTrick?.leadSuit ?? localTrick?.leadSuit ?? firstCard.card.suit,
    leader: serverTrick?.leader ?? localTrick?.leader ?? firstCard.playedBy,
    currentPlayer: serverTrick?.currentPlayer ?? localTrick?.currentPlayer ?? firstCard.playedBy,
    trickNumber: serverTrick?.trickNumber ?? localTrick?.trickNumber ?? 1,
    winner: serverTrick?.winner ?? localTrick?.winner,
  };
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

    const currentState = get();
    const localHand = currentState.gameState?.currentHand;
    const serverHand = state.currentHand;

    // Merge local cards that server doesn't have yet (handles network latency)
    if (localHand && serverHand) {
      const mergedTrick = mergeLocalCards(
        localHand.currentTrick,
        serverHand.currentTrick,
        localHand.number,
        serverHand.number
      );

      if (mergedTrick) {
        set({
          gameState: {
            ...state,
            currentHand: {
              ...serverHand,
              currentTrick: mergedTrick,
            },
          },
        });
        return;
      }
    }

    set({ gameState: state });
  },

  // Set game state but preserve current trick if we're animating
  // NOTE: We no longer overwrite currentTrick with preservedTrick here.
  // The useCurrentTrick hook handles displaying the preserved trick during animation.
  // This allows new cards played during animation to still be stored in gameState.
  setGameStatePreservingTrick: (state) => {
    // Always use the normal setGameState - it will merge local cards properly.
    // The useCurrentTrick hook will return preservedTrick when animating,
    // so the display will show the completed trick while we store the new one.
    get().setGameState(state);
  },

  setSelectedCard: (card) => set({ selectedCard: card }),

  setLastViolation: (violation) => set({ lastViolation: violation }),

  setWaitingFor: (player) => set({ waitingFor: player }),

  addPlayedCard: (player, card, faceDown) =>
    set((state) => {
      if (!state.gameState?.currentHand) {
        return state;
      }

      const currentHand = state.gameState.currentHand;
      const currentTrick = currentHand.currentTrick;
      const newCard: PlayedCard = { card, playedBy: player, faceDown, playedAt: Date.now() };

      const needFreshTrick = !currentTrick || isTrickComplete(currentTrick);

      if (needFreshTrick) {
        const trickNumber = (currentHand.completedTricks?.length ?? 0) + 1;
        return {
          gameState: {
            ...state.gameState,
            currentHand: {
              ...currentHand,
              currentTrick: {
                cards: [newCard],
                leadSuit: card.suit,
                leader: player,
                currentPlayer: player,
                trickNumber,
              },
            },
          },
        };
      }

      // Skip if player already has a card in this trick
      if (currentTrick.cards.some((c) => c.playedBy === player)) {
        return state;
      }

      return {
        gameState: {
          ...state.gameState,
          currentHand: {
            ...currentHand,
            currentTrick: {
              ...currentTrick,
              cards: [...currentTrick.cards, newCard],
            },
          },
        },
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
