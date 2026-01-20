import type { Card, Suit, PlayerPosition } from '@fkthepope/shared';

/**
 * Skitgubbe game phases
 * - phase1: Trick-taking phase where players draw from stock
 * - phase2: Shedding phase where players try to get rid of cards
 */
export type SkitgubbePhase = 'waiting' | 'dealing' | 'phase1' | 'phase2' | 'game_end';

/**
 * Played card in Skitgubbe
 */
export interface SkitgubbePlayedCard {
  card: Card;
  playedBy: PlayerPosition;
}

/**
 * A player in Skitgubbe
 */
export interface SkitgubbePlayer {
  id: string;
  name: string;
  position: PlayerPosition;
  isBot: boolean;
  hand: Card[];
  isOut: boolean;
}

/**
 * Phase 1 trick state (two players compete per trick)
 */
export interface SkitgubbeTrick {
  cards: SkitgubbePlayedCard[];
  leadPlayer: PlayerPosition;
  followPlayer: PlayerPosition;
  winner?: PlayerPosition;
}

/**
 * Phase 2 pile state (cards to beat or pick up)
 */
export interface SkitgubbePile {
  cards: Card[];
  topCard: Card | null;
}

/**
 * Full Skitgubbe game state
 */
export interface SkitgubbeState {
  id: string;
  phase: SkitgubbePhase;
  players: Record<PlayerPosition, SkitgubbePlayer | null>;
  playerCount: number;
  playerOrder: PlayerPosition[];

  // Stock pile (draw pile)
  stock: Card[];

  // Discard pile (cards out of play)
  discard: Card[];

  // Trump suit (revealed at end of phase 1)
  trumpSuit: Suit | null;
  trumpCard: Card | null;

  // Phase 1: trick state
  currentTrick: SkitgubbeTrick | null;

  // Phase 2: pile state
  pile: SkitgubbePile | null;

  // Current player
  currentPlayer: PlayerPosition | null;

  // Game result
  loser: PlayerPosition | null;
}

/**
 * Skitgubbe action types
 */
export type SkitgubbeAction =
  | { type: 'ADD_PLAYER'; player: { id: string; name: string; position: PlayerPosition; isBot: boolean } }
  | { type: 'START_GAME'; hands: Record<PlayerPosition, Card[]>; stock: Card[]; trumpCard: Card }
  | { type: 'PLAY_CARD_PHASE1'; position: PlayerPosition; card: Card }
  | { type: 'COMPLETE_TRICK'; winner: PlayerPosition }
  | { type: 'DRAW_CARDS' }
  | { type: 'START_PHASE2' }
  | { type: 'PLAY_CARD_PHASE2'; position: PlayerPosition; card: Card }
  | { type: 'PICK_UP_PILE'; position: PlayerPosition }
  | { type: 'PLAYER_OUT'; position: PlayerPosition }
  | { type: 'GAME_END'; loser: PlayerPosition };

/**
 * Create initial Skitgubbe state
 */
export function createInitialSkitgubbeState(gameId: string, playerCount: number): SkitgubbeState {
  const allPositions: PlayerPosition[] = ['south', 'west', 'north', 'east'];
  const positions: PlayerPosition[] = allPositions.slice(0, playerCount);

  return {
    id: gameId,
    phase: 'waiting',
    players: {
      north: null,
      east: null,
      south: null,
      west: null,
    },
    playerCount,
    playerOrder: positions,
    stock: [],
    discard: [],
    trumpSuit: null,
    trumpCard: null,
    currentTrick: null,
    pile: null,
    currentPlayer: null,
    loser: null,
  };
}

/**
 * Client view of Skitgubbe state (hides other players' hands)
 */
export interface ClientSkitgubbeState {
  id: string;
  phase: SkitgubbePhase;
  players: Record<PlayerPosition, {
    name: string;
    isBot: boolean;
    cardCount: number;
    isOut: boolean;
  } | null>;
  playerCount: number;
  playerOrder: PlayerPosition[];
  myHand: Card[];
  stockCount: number;
  discardCount: number;
  trumpSuit: Suit | null;
  trumpCard: Card | null;
  currentTrick: SkitgubbeTrick | null;
  pile: SkitgubbePile | null;
  currentPlayer: PlayerPosition | null;
  loser: PlayerPosition | null;
}

/**
 * Convert full state to client state
 */
export function toClientSkitgubbeState(
  state: SkitgubbeState,
  viewerPosition: PlayerPosition
): ClientSkitgubbeState {
  const players: ClientSkitgubbeState['players'] = {
    north: null,
    east: null,
    south: null,
    west: null,
  };

  for (const pos of state.playerOrder) {
    const player = state.players[pos];
    if (player) {
      players[pos] = {
        name: player.name,
        isBot: player.isBot,
        cardCount: player.hand.length,
        isOut: player.isOut,
      };
    }
  }

  return {
    id: state.id,
    phase: state.phase,
    players,
    playerCount: state.playerCount,
    playerOrder: state.playerOrder,
    myHand: state.players[viewerPosition]?.hand ?? [],
    stockCount: state.stock.length,
    discardCount: state.discard.length,
    trumpSuit: state.trumpSuit,
    trumpCard: state.trumpCard,
    currentTrick: state.currentTrick,
    pile: state.pile,
    currentPlayer: state.currentPlayer,
    loser: state.loser,
  };
}
