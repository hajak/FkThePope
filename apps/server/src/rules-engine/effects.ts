import type {
  RuleEffect,
  RuleContext,
  Card,
  CardPredicate,
} from '@fkthepope/shared';
import { evaluatePredicate } from './predicates.js';

/**
 * Result of applying effects to a play attempt
 */
export interface EffectResult {
  allowed: boolean;
  message?: string;
  mustPlayFaceDown: boolean;
  skipNextPlayer: boolean;
}

/**
 * Apply effects to determine if a play is allowed
 */
export function applyEffects(
  effects: RuleEffect[],
  context: RuleContext
): EffectResult {
  const result: EffectResult = {
    allowed: true,
    mustPlayFaceDown: false,
    skipNextPlayer: false,
  };

  for (const effect of effects) {
    const effectResult = applyEffect(effect, context);

    if (!effectResult.allowed) {
      result.allowed = false;
      result.message = effectResult.message;
      break; // First violation stops processing
    }

    if (effectResult.mustPlayFaceDown) {
      result.mustPlayFaceDown = true;
    }

    if (effectResult.skipNextPlayer) {
      result.skipNextPlayer = true;
    }
  }

  return result;
}

/**
 * Apply a single effect
 */
function applyEffect(
  effect: RuleEffect,
  context: RuleContext
): EffectResult {
  switch (effect.type) {
    case 'forbidPlay':
      return handleForbidPlay(effect, context);

    case 'requirePlay':
      return handleRequirePlay(effect, context);

    case 'forceDiscard':
      return handleForceDiscard(effect, context);

    case 'skipNextPlayer':
      return {
        allowed: true,
        skipNextPlayer: true,
        mustPlayFaceDown: false,
      };

    case 'reverseOrder':
      // This would be handled at the game manager level
      return {
        allowed: true,
        skipNextPlayer: false,
        mustPlayFaceDown: false,
      };

    default:
      return {
        allowed: true,
        skipNextPlayer: false,
        mustPlayFaceDown: false,
      };
  }
}

/**
 * Handle forbidPlay effect
 */
function handleForbidPlay(
  effect: { type: 'forbidPlay'; cardMatcher?: CardPredicate; message: string },
  context: RuleContext
): EffectResult {
  // If no card matcher, forbid the attempted card
  if (!effect.cardMatcher) {
    return {
      allowed: false,
      message: effect.message,
      mustPlayFaceDown: false,
      skipNextPlayer: false,
    };
  }

  // Check if the played card matches the forbidden pattern
  if (context.playedCard) {
    const matches = evaluateCardMatcher(effect.cardMatcher, context.playedCard, context);
    if (matches) {
      return {
        allowed: false,
        message: effect.message,
        mustPlayFaceDown: false,
        skipNextPlayer: false,
      };
    }
  }

  return {
    allowed: true,
    mustPlayFaceDown: false,
    skipNextPlayer: false,
  };
}

/**
 * Handle requirePlay effect
 */
function handleRequirePlay(
  effect: { type: 'requirePlay'; cardMatcher: CardPredicate; message: string },
  context: RuleContext
): EffectResult {
  // Check if player has any cards matching the requirement
  const hasMatchingCard = context.player.hand.some((card) =>
    evaluateCardMatcher(effect.cardMatcher, card, context)
  );

  if (!hasMatchingCard) {
    // Player doesn't have required cards, so requirement doesn't apply
    return {
      allowed: true,
      mustPlayFaceDown: false,
      skipNextPlayer: false,
    };
  }

  // Player has required cards, check if played card matches
  if (context.playedCard) {
    const playedMatches = evaluateCardMatcher(
      effect.cardMatcher,
      context.playedCard,
      context
    );

    if (!playedMatches) {
      return {
        allowed: false,
        message: effect.message,
        mustPlayFaceDown: false,
        skipNextPlayer: false,
      };
    }
  }

  return {
    allowed: true,
    mustPlayFaceDown: false,
    skipNextPlayer: false,
  };
}

/**
 * Handle forceDiscard effect
 */
function handleForceDiscard(
  effect: { type: 'forceDiscard'; message: string },
  context: RuleContext
): EffectResult {
  // If player is playing face-up, check if they're allowed
  if (!context.playedFaceDown) {
    return {
      allowed: false,
      message: effect.message,
      mustPlayFaceDown: true,
      skipNextPlayer: false,
    };
  }

  return {
    allowed: true,
    mustPlayFaceDown: true,
    skipNextPlayer: false,
  };
}

/**
 * Evaluate if a card matches a card predicate
 */
function evaluateCardMatcher(
  matcher: CardPredicate,
  card: Card,
  context: RuleContext
): boolean {
  // Create a temporary context with this card as the played card
  const tempContext: RuleContext = {
    ...context,
    playedCard: card,
  };

  return evaluatePredicate({ ...matcher, target: 'played' }, tempContext);
}
