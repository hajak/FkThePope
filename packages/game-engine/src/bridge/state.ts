import type { Card, Suit, PlayerPosition } from '@fkthepope/shared';

/**
 * Bridge game phases
 */
export type BridgePhase = 'waiting' | 'dealing' | 'bidding' | 'playing' | 'hand_end' | 'game_end';

/**
 * Partnership teams
 */
export type Partnership = 'NS' | 'EW'; // North-South or East-West

/**
 * Get partnership for a position
 */
export function getPartnership(position: PlayerPosition): Partnership {
  return position === 'north' || position === 'south' ? 'NS' : 'EW';
}

/**
 * Bridge bid levels (1-7)
 */
export type BidLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Bridge bid strains (suits + no trump)
 */
export type BidStrain = Suit | 'notrump';

/**
 * Strain rank for comparison (clubs lowest, notrump highest)
 */
export const STRAIN_RANK: Record<BidStrain, number> = {
  clubs: 1,
  diamonds: 2,
  hearts: 3,
  spades: 4,
  notrump: 5,
};

/**
 * A bid in Bridge
 */
export interface Bid {
  type: 'bid' | 'pass' | 'double' | 'redouble';
  level?: BidLevel;
  strain?: BidStrain;
  player: PlayerPosition;
}

/**
 * Contract information after bidding
 */
export interface Contract {
  level: BidLevel;
  strain: BidStrain;
  declarer: PlayerPosition;
  dummy: PlayerPosition;
  doubled: boolean;
  redoubled: boolean;
  defendingTeam: Partnership;
}

/**
 * Bridge played card
 */
export interface BridgePlayedCard {
  card: Card;
  playedBy: PlayerPosition;
}

/**
 * Bridge trick
 */
export interface BridgeTrick {
  cards: BridgePlayedCard[];
  leadSuit: Suit | null;
  leader: PlayerPosition;
  currentPlayer: PlayerPosition;
  trickNumber: number;
  winner?: PlayerPosition;
}

/**
 * Bridge player
 */
export interface BridgePlayer {
  id: string;
  name: string;
  position: PlayerPosition;
  isBot: boolean;
  hand: Card[];
  tricksWon: number;
}

/**
 * Bridge game state
 */
export interface BridgeState {
  id: string;
  phase: BridgePhase;
  players: Record<PlayerPosition, BridgePlayer | null>;
  dealer: PlayerPosition;

  // Bidding
  bids: Bid[];
  consecutivePasses: number;
  lastBid: Bid | null;
  contract: Contract | null;

  // Playing
  trumpSuit: Suit | null;
  currentTrick: BridgeTrick | null;
  completedTricks: BridgeTrick[];

  // Scoring
  scores: Record<Partnership, number>;

  // Game tracking
  handNumber: number;
  gameNumber: number;
}

/**
 * Bridge action types
 */
export type BridgeAction =
  | { type: 'ADD_PLAYER'; player: { id: string; name: string; position: PlayerPosition; isBot: boolean } }
  | { type: 'START_HAND'; hands: Record<PlayerPosition, Card[]>; dealer: PlayerPosition }
  | { type: 'MAKE_BID'; position: PlayerPosition; bid: Bid }
  | { type: 'END_BIDDING'; contract: Contract | null }
  | { type: 'START_PLAY' }
  | { type: 'PLAY_CARD'; position: PlayerPosition; card: Card }
  | { type: 'COMPLETE_TRICK'; winner: PlayerPosition }
  | { type: 'END_HAND'; declarerTricks: number }
  | { type: 'END_GAME' };

/**
 * Create initial Bridge state
 */
export function createInitialBridgeState(gameId: string): BridgeState {
  return {
    id: gameId,
    phase: 'waiting',
    players: {
      north: null,
      east: null,
      south: null,
      west: null,
    },
    dealer: 'south',
    bids: [],
    consecutivePasses: 0,
    lastBid: null,
    contract: null,
    trumpSuit: null,
    currentTrick: null,
    completedTricks: [],
    scores: {
      NS: 0,
      EW: 0,
    },
    handNumber: 1,
    gameNumber: 1,
  };
}

/**
 * Client view of Bridge state
 */
export interface ClientBridgeState {
  id: string;
  phase: BridgePhase;
  players: Record<PlayerPosition, {
    name: string;
    isBot: boolean;
    cardCount: number;
    tricksWon: number;
  } | null>;
  dealer: PlayerPosition;
  myHand: Card[];
  bids: Bid[];
  contract: Contract | null;
  trumpSuit: Suit | null;
  currentTrick: BridgeTrick | null;
  completedTricksCount: number;
  scores: Record<Partnership, number>;
  handNumber: number;
  gameNumber: number;
  // Dummy's hand is visible during play
  dummyHand: Card[] | null;
  currentPlayer: PlayerPosition | null;
}

/**
 * Convert full state to client state
 */
export function toClientBridgeState(
  state: BridgeState,
  viewerPosition: PlayerPosition
): ClientBridgeState {
  const players: ClientBridgeState['players'] = {
    north: null,
    east: null,
    south: null,
    west: null,
  };

  for (const pos of ['north', 'east', 'south', 'west'] as PlayerPosition[]) {
    const player = state.players[pos];
    if (player) {
      players[pos] = {
        name: player.name,
        isBot: player.isBot,
        cardCount: player.hand.length,
        tricksWon: player.tricksWon,
      };
    }
  }

  // Dummy's hand is visible during play phase
  let dummyHand: Card[] | null = null;
  if (state.phase === 'playing' && state.contract) {
    const dummyPosition = state.contract.dummy;
    const dummy = state.players[dummyPosition];
    if (dummy) {
      dummyHand = dummy.hand;
    }
  }

  return {
    id: state.id,
    phase: state.phase,
    players,
    dealer: state.dealer,
    myHand: state.players[viewerPosition]?.hand ?? [],
    bids: state.bids,
    contract: state.contract,
    trumpSuit: state.trumpSuit,
    currentTrick: state.currentTrick,
    completedTricksCount: state.completedTricks.length,
    scores: state.scores,
    handNumber: state.handNumber,
    gameNumber: state.gameNumber,
    dummyHand,
    currentPlayer: state.currentTrick?.currentPlayer ?? null,
  };
}
