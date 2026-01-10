import type { Card, PlayerPosition, Rank, Suit } from './card.js';

/**
 * Events that can trigger rule evaluation
 */
export type RuleEvent =
  | 'onPlayAttempt' // Before a card is played
  | 'onPlayAccepted' // After a card is accepted
  | 'onTrickEnd' // When a trick is resolved
  | 'onHandEnd'; // When a hand is complete

/**
 * Operators for comparing values in predicates
 */
export type PredicateOperator =
  | 'eq' // Equal
  | 'neq' // Not equal
  | 'gt' // Greater than
  | 'lt' // Less than
  | 'gte' // Greater than or equal
  | 'lte' // Less than or equal
  | 'in' // Value is in array
  | 'notIn'; // Value is not in array

/**
 * Predicate that checks card properties
 */
export interface CardPredicate {
  type: 'card';
  target: 'played' | 'any' | 'winning'; // Which card to check
  property: 'suit' | 'rank' | 'value' | 'isTrump';
  operator: PredicateOperator;
  value: string | number | boolean | string[] | number[];
}

/**
 * Predicate that checks player properties
 */
export interface PlayerPredicate {
  type: 'player';
  target: 'current' | 'next' | 'leader' | 'any';
  property: 'position' | 'tricksWon' | 'cardsInHand' | 'hasSuit';
  operator: PredicateOperator;
  value: string | number | boolean | string[];
}

/**
 * Predicate that checks trick state
 */
export interface TrickPredicate {
  type: 'trick';
  property: 'cardCount' | 'leadSuit' | 'hasTrump' | 'hasDiscard' | 'trickNumber';
  operator: PredicateOperator;
  value: string | number | boolean;
}

/**
 * Compound predicate combining other predicates
 */
export interface CompoundPredicate {
  type: 'and' | 'or' | 'not';
  predicates: RulePredicate[];
}

/**
 * Any type of predicate
 */
export type RulePredicate =
  | CardPredicate
  | PlayerPredicate
  | TrickPredicate
  | CompoundPredicate;

/**
 * Effect that forbids playing certain cards
 */
export interface ForbidPlayEffect {
  type: 'forbidPlay';
  cardMatcher?: CardPredicate; // If not specified, forbids the attempted card
  message: string;
}

/**
 * Effect that requires playing certain cards
 */
export interface RequirePlayEffect {
  type: 'requirePlay';
  cardMatcher: CardPredicate;
  message: string;
}

/**
 * Effect that skips the next player
 */
export interface SkipNextPlayerEffect {
  type: 'skipNextPlayer';
}

/**
 * Effect that forces a card to be played face-down
 */
export interface ForceDiscardEffect {
  type: 'forceDiscard';
  message: string;
}

/**
 * Effect that reverses play order
 */
export interface ReverseOrderEffect {
  type: 'reverseOrder';
}

/**
 * All possible rule effects
 */
export type RuleEffect =
  | ForbidPlayEffect
  | RequirePlayEffect
  | SkipNextPlayerEffect
  | ForceDiscardEffect
  | ReverseOrderEffect;

/**
 * A complete rule definition
 */
export interface Rule {
  id: string;
  name: string;
  description: string;
  createdBy: PlayerPosition;
  createdAtHand: number;
  createdAt: number; // Timestamp
  event: RuleEvent;
  when: RulePredicate;
  then: RuleEffect[];
  isActive: boolean;
}

/**
 * Result when a rule is violated
 */
export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  message: string;
  attemptedCard: Card;
  suggestedMoves?: Card[];
}

/**
 * Result of evaluating rules for a play attempt
 */
export interface RuleEvaluationResult {
  allowed: boolean;
  violations: RuleViolation[];
  appliedEffects: RuleEffect[];
  mustPlayFaceDown: boolean;
  skipNextPlayer: boolean;
}

/**
 * Context passed to rule evaluation
 */
export interface RuleContext {
  playedCard?: Card;
  playedFaceDown?: boolean;
  player: {
    position: PlayerPosition;
    hand: Card[];
    tricksWon: number;
  };
  trick: {
    cards: Array<{ card: Card; playedBy: PlayerPosition; faceDown: boolean }>;
    leadSuit: Suit | null;
    trickNumber: number;
  };
  game: {
    trumpSuit: Suit;
    handNumber: number;
  };
}

/**
 * Built-in rule templates for the rule creator UI
 */
export const RULE_TEMPLATES = {
  forbidRankAfterRank: {
    name: 'Forbid Rank After Rank',
    description: 'After a specific rank is played, forbid another rank',
    event: 'onPlayAttempt' as RuleEvent,
  },
  trumpTax: {
    name: 'Trump Tax',
    description: 'After trump is played, next player must play trump if possible',
    event: 'onPlayAttempt' as RuleEvent,
  },
  noAcesAfterDiscard: {
    name: 'No Aces After Discard',
    description: 'Cannot play an Ace if a discard has occurred in the trick',
    event: 'onPlayAttempt' as RuleEvent,
  },
  skipOnKing: {
    name: 'Skip on King',
    description: 'When a King wins a trick, skip the next player',
    event: 'onTrickEnd' as RuleEvent,
  },
} as const;
