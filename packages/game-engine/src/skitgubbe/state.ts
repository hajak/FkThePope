import type { Card, Suit, PlayerPosition } from '@fkthepope/shared';

/**
 * Skitgubbe game phases
 * - collection: Phase 1 - 2-card duels to collect strong cards
 * - shedding: Phase 2 - Get rid of cards following suit rules (no trump)
 */
export type SkitgubbePhase = 'waiting' | 'dealing' | 'collection' | 'shedding' | 'game_end';

/**
 * A player in Skitgubbe
 */
export interface SkitgubbePlayer {
  id: string;
  name: string;
  position: PlayerPosition;
  isBot: boolean;
  hand: Card[];
  collectedCards: Card[];  // Won during collection phase
  isOut: boolean;
}

/**
 * Duel card in Phase 1
 */
export interface DuelCard {
  card: Card;
  playedBy: PlayerPosition;
}

/**
 * Current duel state in Phase 1
 */
export interface DuelState {
  leader: PlayerPosition;     // Who led the duel
  leaderCard: Card | null;    // Leader's card
  responderCard: Card | null; // Responder's card
  responder: PlayerPosition | null;
}

/**
 * Trick card in Phase 2
 */
export interface TrickCard {
  card: Card;
  playedBy: PlayerPosition;
}

/**
 * Current trick state in Phase 2
 */
export interface TrickState {
  cards: TrickCard[];
  leadSuit: Suit;
  leader: PlayerPosition;
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

  // Draw pile
  drawPile: Card[];

  // Phase 1 - Collection
  currentDuel: DuelState | null;
  tiePile: Card[];  // Accumulated cards from ties

  // Phase 2 - Shedding
  currentTrick: TrickState | null;
  pile: Card[];  // Cards to beat / pick up

  // Current player
  currentPlayer: PlayerPosition | null;

  // Game result
  finishOrder: PlayerPosition[];  // Players who finished (first = winner)
  loser: PlayerPosition | null;
}

/**
 * Played card for display
 */
export interface SkitgubbePlayedCard {
  card: Card;
  playedBy: PlayerPosition;
}

/**
 * Skitgubbe action types
 */
export type SkitgubbeAction =
  | { type: 'ADD_PLAYER'; player: { id: string; name: string; position: PlayerPosition; isBot: boolean } }
  | { type: 'START_GAME'; deal: Record<PlayerPosition, Card[]>; drawPile: Card[] }
  // Phase 1 actions
  | { type: 'PLAY_DUEL_CARD'; position: PlayerPosition; card: Card }
  | { type: 'DRAW_CARD'; position: PlayerPosition }
  | { type: 'RESOLVE_DUEL' }
  // Phase transition
  | { type: 'START_SHEDDING' }
  // Phase 2 actions
  | { type: 'PLAY_TRICK_CARD'; position: PlayerPosition; card: Card }
  | { type: 'PICK_UP_PILE'; position: PlayerPosition }
  | { type: 'RESOLVE_TRICK' }
  // Game end
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
    drawPile: [],
    currentDuel: null,
    tiePile: [],
    currentTrick: null,
    pile: [],
    currentPlayer: null,
    finishOrder: [],
    loser: null,
  };
}

/**
 * Client view of a player
 */
export interface ClientPlayerView {
  name: string;
  isBot: boolean;
  handCount: number;
  collectedCount: number;
  isOut: boolean;
}

/**
 * Client view of Skitgubbe state
 */
export interface ClientSkitgubbeState {
  id: string;
  phase: SkitgubbePhase;
  players: Record<PlayerPosition, ClientPlayerView | null>;
  playerCount: number;
  playerOrder: PlayerPosition[];

  // My cards
  myHand: Card[];
  myCollectedCards: Card[];

  // Draw pile info
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
    cards: TrickCard[];
    leadSuit: Suit;
    leader: PlayerPosition;
  } | null;
  pile: Card[];
  pileTopCard: Card | null;

  // Game state
  currentPlayer: PlayerPosition | null;
  finishOrder: PlayerPosition[];
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
        handCount: player.hand.length,
        collectedCount: player.collectedCards.length,
        isOut: player.isOut,
      };
    }
  }

  const myPlayer = state.players[viewerPosition];
  const pileTopCard = state.pile.length > 0 ? state.pile[state.pile.length - 1] ?? null : null;

  return {
    id: state.id,
    phase: state.phase,
    players,
    playerCount: state.playerCount,
    playerOrder: state.playerOrder,
    myHand: myPlayer?.hand ?? [],
    myCollectedCards: myPlayer?.collectedCards ?? [],
    drawPileCount: state.drawPile.length,
    currentDuel: state.currentDuel ? {
      leader: state.currentDuel.leader,
      leaderCard: state.currentDuel.leaderCard,
      responder: state.currentDuel.responder,
      responderCard: state.currentDuel.responderCard,
    } : null,
    tiePileCount: state.tiePile.length,
    currentTrick: state.currentTrick ? {
      cards: state.currentTrick.cards,
      leadSuit: state.currentTrick.leadSuit,
      leader: state.currentTrick.leader,
    } : null,
    pile: state.pile,
    pileTopCard,
    currentPlayer: state.currentPlayer,
    finishOrder: state.finishOrder,
    loser: state.loser,
  };
}
