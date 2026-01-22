import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type {
  ClientGameState,
  Card,
  PlayerPosition,
  RuleViolation,
  PlayedCard,
  TrickState,
  GameType,
} from '@fkthepope/shared';

// Bridge-specific client state (matches server's ClientBridgeState)
interface BridgeClientState {
  id: string;
  phase: 'waiting' | 'dealing' | 'bidding' | 'playing' | 'hand_end' | 'game_end';
  players: Record<PlayerPosition, { name: string; isBot: boolean; cardCount: number; tricksWon: number } | null>;
  dealer: PlayerPosition;
  myHand: Card[];
  bids: Array<{ type: string; level?: number; strain?: string; player: PlayerPosition }>;
  contract: { level: number; strain: string; declarer: PlayerPosition; dummy: PlayerPosition; doubled: boolean; redoubled: boolean; defendingTeam: string } | null;
  trumpSuit: string | null;
  currentTrick: { cards: Array<{ card: Card; playedBy: PlayerPosition }>; leadSuit: string | null; leader: PlayerPosition; currentPlayer: PlayerPosition; trickNumber: number; winner?: PlayerPosition } | null;
  completedTricksCount: number;
  scores: Record<string, number>; // 'NS' | 'EW'
  handNumber: number;
  gameNumber: number;
  dummyHand: Card[] | null;
  currentPlayer: PlayerPosition | null;
  // Extra fields for local tracking
  biddingHistory: Array<{ player: PlayerPosition; bid: { type: string; level?: number; strain?: string } }>;
}

// Skitgubbe-specific client state (matches server's ClientSkitgubbeState)
interface SkitgubbeClientState {
  id: string;
  phase: 'waiting' | 'dealing' | 'collection' | 'shedding' | 'game_end';
  players: Record<PlayerPosition, { name: string; isBot: boolean; handCount: number; collectedCount: number; isOut: boolean } | null>;
  playerCount: number;
  playerOrder: PlayerPosition[];

  // My cards
  myHand: Card[];
  myCollectedCards: Card[];

  // Draw pile
  drawPileCount: number;

  // Phase 1 - Duel state
  currentDuel: {
    leader: PlayerPosition;
    leaderCard: Card | null;
    responder: PlayerPosition | null;
    responderCard: Card | null;
  } | null;
  tiePileCount: number;

  // Phase 2 - Trick/pile state
  currentTrick: {
    cards: Array<{ card: Card; playedBy: PlayerPosition }>;
    leadSuit: string;
    leader: PlayerPosition;
  } | null;
  pile: Card[];
  pileTopCard: Card | null;

  // Game state
  currentPlayer: PlayerPosition | null;
  finishOrder: PlayerPosition[];
  loser: PlayerPosition | null;
}

interface GameStore {
  // Connection state
  isConnected: boolean;
  playerId: string | null;
  playerName: string;

  // Room state
  roomId: string | null;
  myPosition: PlayerPosition | null;

  // Game type
  gameType: GameType | null;

  // Game state (type varies by game)
  gameState: ClientGameState | null;

  // Bridge-specific state
  bridgeState: BridgeClientState | null;

  // Skitgubbe-specific state
  skitgubbeState: SkitgubbeClientState | null;

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
  setGameType: (gameType: GameType | null) => void;
  setGameState: (state: ClientGameState | null) => void;
  setGameStatePreservingTrick: (state: ClientGameState | null) => void;
  setBridgeState: (state: BridgeClientState | null) => void;
  setSkitgubbeState: (state: SkitgubbeClientState | null) => void;
  setSelectedCard: (card: Card | null) => void;
  setLastViolation: (violation: RuleViolation | null) => void;
  setWaitingFor: (player: PlayerPosition | null) => void;
  addPlayedCard: (player: PlayerPosition, card: Card, faceDown: boolean) => void;
  addBridgePlayedCard: (player: PlayerPosition, card: Card) => void;
  addSkitgubbePlayedCard: (player: PlayerPosition, card: Card) => void;
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
  gameType: null,
  gameState: null,
  bridgeState: null,
  skitgubbeState: null,
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

  setGameType: (gameType) => set({ gameType }),

  setBridgeState: (state) => set({ bridgeState: state }),

  setSkitgubbeState: (state) => set({ skitgubbeState: state }),

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

  addBridgePlayedCard: (player, card) =>
    set((state) => {
      if (!state.bridgeState) return state;
      const currentTrick = state.bridgeState.currentTrick;
      const newCard = { card, playedBy: player };

      if (!currentTrick || currentTrick.cards.length >= 4) {
        return {
          bridgeState: {
            ...state.bridgeState,
            currentTrick: {
              cards: [newCard],
              leadSuit: card.suit,
              leader: player,
              currentPlayer: player,
              trickNumber: (state.bridgeState.completedTricksCount || 0) + 1,
            },
          },
        };
      }

      if (currentTrick.cards.some((c) => c.playedBy === player)) {
        return state;
      }

      return {
        bridgeState: {
          ...state.bridgeState,
          currentTrick: {
            ...currentTrick,
            cards: [...currentTrick.cards, newCard],
          },
        },
      };
    }),

  addSkitgubbePlayedCard: (player, card) =>
    set((state) => {
      if (!state.skitgubbeState) return state;
      const newCard = { card, playedBy: player };

      return {
        skitgubbeState: {
          ...state.skitgubbeState,
          lastPlayedCards: [newCard],
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
      gameType: null,
      gameState: null,
      bridgeState: null,
      skitgubbeState: null,
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

// Game type selector
export const useGameType = () => useGameStore((state) => state.gameType);

// Bridge selectors
export const useBridgeState = () => useGameStore((state) => state.bridgeState);
export const useBridgePhase = () => useGameStore((state) => state.bridgeState?.phase ?? null);
export const useBridgeContract = () => useGameStore((state) => state.bridgeState?.contract ?? null);
export const useBridgeBiddingHistory = () =>
  useGameStore(useShallow((state) => state.bridgeState?.biddingHistory ?? []));
export const useBridgeDummyHand = () =>
  useGameStore(useShallow((state) => state.bridgeState?.dummyHand ?? null));
export const useBridgeTricksWon = () =>
  useGameStore(useShallow((state) => {
    if (!state.bridgeState) return { ns: 0, ew: 0 };
    const ns = (state.bridgeState.players.north?.tricksWon || 0) + (state.bridgeState.players.south?.tricksWon || 0);
    const ew = (state.bridgeState.players.east?.tricksWon || 0) + (state.bridgeState.players.west?.tricksWon || 0);
    return { ns, ew };
  }));
export const useBridgeMyHand = () =>
  useGameStore(useShallow((state) => state.bridgeState?.myHand ?? []));

// Skitgubbe selectors
export const useSkitgubbeState = () => useGameStore((state) => state.skitgubbeState);
export const useSkitgubbePhase = () => useGameStore((state) => state.skitgubbeState?.phase ?? null);
export const useSkitgubbePile = () =>
  useGameStore(useShallow((state) => state.skitgubbeState?.pile ?? []));
export const useSkitgubbePileTopCard = () =>
  useGameStore((state) => state.skitgubbeState?.pileTopCard ?? null);
export const useSkitgubbeFinishOrder = () =>
  useGameStore(useShallow((state) => state.skitgubbeState?.finishOrder ?? []));
export const useSkitgubbeMyHand = () =>
  useGameStore(useShallow((state) => state.skitgubbeState?.myHand ?? []));
export const useSkitgubbeMyCollectedCards = () =>
  useGameStore(useShallow((state) => state.skitgubbeState?.myCollectedCards ?? []));
// Skitgubbe has no trump - selectors return null for compatibility
export const useSkitgubbeTrumpSuit = () => null;
export const useSkitgubbeTrumpCard = () => null;
export const useSkitgubbeCurrentDuel = () =>
  useGameStore(useShallow((state) => state.skitgubbeState?.currentDuel ?? null));
export const useSkitgubbeDrawPileCount = () =>
  useGameStore((state) => state.skitgubbeState?.drawPileCount ?? 0);
export const useSkitgubbeTiePileCount = () =>
  useGameStore((state) => state.skitgubbeState?.tiePileCount ?? 0);
export const useSkitgubbeCurrentTrick = () =>
  useGameStore(useShallow((state) => state.skitgubbeState?.currentTrick ?? null));
