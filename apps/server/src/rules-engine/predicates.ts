import type {
  RulePredicate,
  CardPredicate,
  PlayerPredicate,
  TrickPredicate,
  CompoundPredicate,
  RuleContext,
  PredicateOperator,
  Card,
} from '@fkthepope/shared';
import { getRankValue, hasSuit } from '@fkthepope/shared';

/**
 * Evaluate a predicate against the current game context
 */
export function evaluatePredicate(
  predicate: RulePredicate,
  context: RuleContext
): boolean {
  switch (predicate.type) {
    case 'card':
      return evaluateCardPredicate(predicate, context);
    case 'player':
      return evaluatePlayerPredicate(predicate, context);
    case 'trick':
      return evaluateTrickPredicate(predicate, context);
    case 'and':
    case 'or':
    case 'not':
      return evaluateCompoundPredicate(predicate, context);
    default:
      return false;
  }
}

/**
 * Evaluate a card predicate
 */
function evaluateCardPredicate(
  predicate: CardPredicate,
  context: RuleContext
): boolean {
  // Get the card to check based on target
  let card: Card | undefined;

  switch (predicate.target) {
    case 'played':
      card = context.playedCard;
      break;
    case 'winning':
      // Find the currently winning card in the trick
      card = findWinningCard(context);
      break;
    case 'any':
      // Check if any card in the trick matches
      return context.trick.cards.some((pc) =>
        evaluateCardProperty(pc.card, predicate)
      );
  }

  if (!card) return false;
  return evaluateCardProperty(card, predicate);
}

/**
 * Evaluate a property of a card against a predicate
 */
function evaluateCardProperty(card: Card, predicate: CardPredicate): boolean {
  let actualValue: string | number | boolean;

  switch (predicate.property) {
    case 'suit':
      actualValue = card.suit;
      break;
    case 'rank':
      actualValue = card.rank;
      break;
    case 'value':
      actualValue = getRankValue(card.rank);
      break;
    case 'isTrump':
      // Need context for this, but we handle it separately
      return false; // Handled at higher level
    default:
      return false;
  }

  return compareValues(actualValue, predicate.operator, predicate.value);
}

/**
 * Find the currently winning card in a trick
 */
function findWinningCard(context: RuleContext): Card | undefined {
  if (context.trick.cards.length === 0) return undefined;

  const leadSuit = context.trick.leadSuit;
  const trumpSuit = context.game.trumpSuit;

  let winning = context.trick.cards[0]!;

  for (const pc of context.trick.cards.slice(1)) {
    if (pc.faceDown) continue; // Discards can't win

    const isWinningTrump = winning.card.suit === trumpSuit && !winning.faceDown;
    const isCurrentTrump = pc.card.suit === trumpSuit;

    if (isCurrentTrump && !isWinningTrump) {
      winning = pc;
    } else if (isCurrentTrump && isWinningTrump) {
      if (getRankValue(pc.card.rank) > getRankValue(winning.card.rank)) {
        winning = pc;
      }
    } else if (!isWinningTrump && pc.card.suit === leadSuit) {
      if (getRankValue(pc.card.rank) > getRankValue(winning.card.rank)) {
        winning = pc;
      }
    }
  }

  return winning.faceDown ? undefined : winning.card;
}

/**
 * Evaluate a player predicate
 */
function evaluatePlayerPredicate(
  predicate: PlayerPredicate,
  context: RuleContext
): boolean {
  let actualValue: string | number | boolean;

  switch (predicate.property) {
    case 'position':
      actualValue = context.player.position;
      break;
    case 'tricksWon':
      actualValue = context.player.tricksWon;
      break;
    case 'cardsInHand':
      actualValue = context.player.hand.length;
      break;
    case 'hasSuit':
      // Special case: check if player has a specific suit
      if (typeof predicate.value === 'string') {
        return hasSuit(context.player.hand, predicate.value as any);
      }
      return false;
    default:
      return false;
  }

  return compareValues(actualValue, predicate.operator, predicate.value);
}

/**
 * Evaluate a trick predicate
 */
function evaluateTrickPredicate(
  predicate: TrickPredicate,
  context: RuleContext
): boolean {
  let actualValue: string | number | boolean;

  switch (predicate.property) {
    case 'cardCount':
      actualValue = context.trick.cards.length;
      break;
    case 'leadSuit':
      actualValue = context.trick.leadSuit ?? '';
      break;
    case 'hasTrump':
      actualValue = context.trick.cards.some(
        (pc) => pc.card.suit === context.game.trumpSuit && !pc.faceDown
      );
      break;
    case 'hasDiscard':
      actualValue = context.trick.cards.some((pc) => pc.faceDown);
      break;
    case 'trickNumber':
      actualValue = context.trick.trickNumber;
      break;
    default:
      return false;
  }

  return compareValues(actualValue, predicate.operator, predicate.value);
}

/**
 * Evaluate a compound predicate (and/or/not)
 */
function evaluateCompoundPredicate(
  predicate: CompoundPredicate,
  context: RuleContext
): boolean {
  switch (predicate.type) {
    case 'and':
      return predicate.predicates.every((p) => evaluatePredicate(p, context));
    case 'or':
      return predicate.predicates.some((p) => evaluatePredicate(p, context));
    case 'not':
      return !predicate.predicates.every((p) => evaluatePredicate(p, context));
    default:
      return false;
  }
}

/**
 * Compare a value against an expected value using an operator
 */
function compareValues(
  actual: string | number | boolean,
  operator: PredicateOperator,
  expected: string | number | boolean | string[] | number[]
): boolean {
  switch (operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'in':
      return Array.isArray(expected) && (expected as (string | number | boolean)[]).includes(actual);
    case 'notIn':
      return Array.isArray(expected) && !(expected as (string | number | boolean)[]).includes(actual);
    default:
      return false;
  }
}

/**
 * Check if a rank is odd
 */
export function isOddRank(value: number): boolean {
  return value % 2 === 1;
}
