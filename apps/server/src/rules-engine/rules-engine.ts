import type {
  Rule,
  RuleContext,
  RuleEvent,
  RuleEvaluationResult,
  RuleViolation,
  Card,
} from '@fkthepope/shared';
import { evaluatePredicate } from './predicates.js';
import { applyEffects } from './effects.js';
import { getSuggestedMoves } from '@fkthepope/game-engine';

/**
 * Rules engine that evaluates custom rules against game events
 */
export class RulesEngine {
  /**
   * Evaluate all applicable rules for an event
   */
  evaluate(
    event: RuleEvent,
    rules: Rule[],
    context: RuleContext
  ): RuleEvaluationResult {
    const result: RuleEvaluationResult = {
      allowed: true,
      violations: [],
      appliedEffects: [],
      mustPlayFaceDown: false,
      skipNextPlayer: false,
    };

    // Filter rules for this event that are active
    const applicableRules = rules.filter(
      (rule) => rule.event === event && rule.isActive
    );

    // Evaluate each rule in creation order
    for (const rule of applicableRules) {
      // Check if the rule's condition is met
      const conditionMet = evaluatePredicate(rule.when, context);

      if (!conditionMet) {
        continue; // Rule doesn't apply
      }

      // Apply the rule's effects
      const effectResult = applyEffects(rule.then, context);

      // Collect applied effects
      result.appliedEffects.push(...rule.then);

      if (!effectResult.allowed) {
        result.allowed = false;
        result.violations.push({
          ruleId: rule.id,
          ruleName: rule.name,
          message: effectResult.message ?? rule.description,
          attemptedCard: context.playedCard!,
          suggestedMoves: this.getSuggestions(context),
        });
        // Continue to collect all violations, don't break
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
   * Get suggested legal moves for the current player
   */
  private getSuggestions(context: RuleContext): Card[] {
    if (!context.trick.leadSuit) {
      return context.player.hand; // Any card is fine when leading
    }

    return getSuggestedMoves(
      context.player.hand,
      context.trick.cards.map((c) => ({
        card: c.card,
        playedBy: c.playedBy,
        faceDown: c.faceDown,
        playedAt: 0, // Not important for suggestions
      })),
      context.game.trumpSuit
    );
  }

  /**
   * Validate a rule definition before accepting it
   */
  validateRule(rule: Partial<Rule>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!rule.name || rule.name.trim().length === 0) {
      errors.push('Rule must have a name');
    }

    if (!rule.description || rule.description.trim().length === 0) {
      errors.push('Rule must have a description');
    }

    if (!rule.event) {
      errors.push('Rule must have an event type');
    } else if (!['onPlayAttempt', 'onPlayAccepted', 'onTrickEnd', 'onHandEnd'].includes(rule.event)) {
      errors.push('Invalid event type');
    }

    if (!rule.when) {
      errors.push('Rule must have a condition (when)');
    }

    if (!rule.then || rule.then.length === 0) {
      errors.push('Rule must have at least one effect (then)');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Create example rules for testing
 */
export function createExampleRules(): Rule[] {
  return [
    {
      id: 'example-1',
      name: 'No Sevens Then Odds',
      description: 'After a 7 is played, the next player cannot play an odd-ranked card',
      createdBy: 'north',
      createdAtHand: 1,
      createdAt: Date.now(),
      event: 'onPlayAttempt',
      when: {
        type: 'and',
        predicates: [
          {
            type: 'card',
            target: 'any',
            property: 'rank',
            operator: 'eq',
            value: '7',
          },
        ],
      },
      then: [
        {
          type: 'forbidPlay',
          cardMatcher: {
            type: 'card',
            target: 'played',
            property: 'value',
            operator: 'in',
            value: [3, 5, 7, 9, 11, 13], // Odd rank values
          },
          message: 'Cannot play odd-ranked cards after a 7!',
        },
      ],
      isActive: true,
    },
    {
      id: 'example-2',
      name: 'Trump Tax',
      description: 'After trump is played, next player must play trump if possible',
      createdBy: 'east',
      createdAtHand: 2,
      createdAt: Date.now(),
      event: 'onPlayAttempt',
      when: {
        type: 'trick',
        property: 'hasTrump',
        operator: 'eq',
        value: true,
      },
      then: [
        {
          type: 'requirePlay',
          cardMatcher: {
            type: 'card',
            target: 'played',
            property: 'isTrump',
            operator: 'eq',
            value: true,
          },
          message: 'Must play trump after trump has been played!',
        },
      ],
      isActive: true,
    },
  ];
}
