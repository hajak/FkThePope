import type { Card, PlayerPosition, Suit, Rule } from '@fkthepope/shared';

/**
 * All possible game actions
 */
export type GameAction =
  | { type: 'ADD_PLAYER'; playerId: string; name: string; position: PlayerPosition; isBot?: boolean }
  | { type: 'REMOVE_PLAYER'; position: PlayerPosition }
  | { type: 'START_HAND'; trumpSuit: Suit; hands: Record<PlayerPosition, Card[]>; firstLeader: PlayerPosition }
  | { type: 'PLAY_CARD'; position: PlayerPosition; card: Card; faceDown: boolean }
  | { type: 'COMPLETE_TRICK'; winner: PlayerPosition }
  | { type: 'COMPLETE_HAND'; winner: PlayerPosition }
  | { type: 'ADD_RULE'; rule: Rule }
  | { type: 'START_NEXT_HAND' }
  | { type: 'END_GAME' }
  | { type: 'SET_PLAYER_CONNECTED'; position: PlayerPosition; connected: boolean };
