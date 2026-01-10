import { describe, it, expect } from 'vitest';
import { RulesEngine } from './rules-engine.js';
import { evaluatePredicate } from './predicates.js';
import type { Rule, RuleContext, CardPredicate } from '@fkthepope/shared';

describe('RulesEngine', () => {
  const engine = new RulesEngine();

  describe('validateRule', () => {
    it('should reject rules without a name', () => {
      const result = engine.validateRule({
        description: 'Test rule',
        event: 'onPlayAttempt',
        when: { type: 'trick', property: 'cardCount', operator: 'gte', value: 0 },
        then: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Rule must have a name');
    });

    it('should accept valid rules', () => {
      const result = engine.validateRule({
        name: 'Test Rule',
        description: 'A test rule',
        event: 'onPlayAttempt',
        when: { type: 'trick', property: 'cardCount', operator: 'gte', value: 0 },
        then: [{ type: 'forbidPlay', message: 'Test' }],
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('evaluate', () => {
    const baseContext: RuleContext = {
      playedCard: { suit: 'hearts', rank: '7' },
      playedFaceDown: false,
      player: {
        position: 'north',
        hand: [{ suit: 'hearts', rank: '7' }, { suit: 'spades', rank: 'A' }],
        tricksWon: 2,
      },
      trick: {
        cards: [],
        leadSuit: null,
        trickNumber: 3,
      },
      game: {
        trumpSuit: 'spades',
        handNumber: 1,
      },
    };

    it('should allow play when no rules apply', () => {
      const result = engine.evaluate('onPlayAttempt', [], baseContext);
      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should forbid play when rule condition matches', () => {
      const rule: Rule = {
        id: 'test-rule',
        name: 'No 7s on trick 3',
        description: 'Cannot play 7s on trick 3',
        createdBy: 'south',
        createdAtHand: 1,
        createdAt: Date.now(),
        event: 'onPlayAttempt',
        when: {
          type: 'and',
          predicates: [
            { type: 'card', target: 'played', property: 'rank', operator: 'eq', value: '7' },
            { type: 'trick', property: 'trickNumber', operator: 'eq', value: 3 },
          ],
        },
        then: [{ type: 'forbidPlay', message: 'Cannot play 7 on trick 3!' }],
        isActive: true,
      };

      const result = engine.evaluate('onPlayAttempt', [rule], baseContext);
      expect(result.allowed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]?.message).toBe('Cannot play 7 on trick 3!');
    });

    it('should skip inactive rules', () => {
      const rule: Rule = {
        id: 'test-rule',
        name: 'Inactive Rule',
        description: 'Should not apply',
        createdBy: 'south',
        createdAtHand: 1,
        createdAt: Date.now(),
        event: 'onPlayAttempt',
        when: { type: 'trick', property: 'cardCount', operator: 'gte', value: 0 },
        then: [{ type: 'forbidPlay', message: 'Should not see this' }],
        isActive: false,
      };

      const result = engine.evaluate('onPlayAttempt', [rule], baseContext);
      expect(result.allowed).toBe(true);
    });
  });
});

describe('evaluatePredicate', () => {
  const context: RuleContext = {
    playedCard: { suit: 'hearts', rank: 'K' },
    playedFaceDown: false,
    player: {
      position: 'east',
      hand: [{ suit: 'hearts', rank: 'K' }, { suit: 'diamonds', rank: '5' }],
      tricksWon: 3,
    },
    trick: {
      cards: [
        { card: { suit: 'hearts', rank: '7' }, playedBy: 'north', faceDown: false },
      ],
      leadSuit: 'hearts',
      trickNumber: 5,
    },
    game: {
      trumpSuit: 'spades',
      handNumber: 2,
    },
  };

  it('should evaluate card predicates', () => {
    const predicate: CardPredicate = {
      type: 'card',
      target: 'played',
      property: 'rank',
      operator: 'eq',
      value: 'K',
    };
    expect(evaluatePredicate(predicate, context)).toBe(true);
  });

  it('should evaluate trick predicates', () => {
    expect(
      evaluatePredicate(
        { type: 'trick', property: 'leadSuit', operator: 'eq', value: 'hearts' },
        context
      )
    ).toBe(true);

    expect(
      evaluatePredicate(
        { type: 'trick', property: 'trickNumber', operator: 'gt', value: 3 },
        context
      )
    ).toBe(true);
  });

  it('should evaluate compound predicates', () => {
    expect(
      evaluatePredicate(
        {
          type: 'and',
          predicates: [
            { type: 'trick', property: 'leadSuit', operator: 'eq', value: 'hearts' },
            { type: 'player', target: 'current', property: 'tricksWon', operator: 'gte', value: 2 },
          ],
        },
        context
      )
    ).toBe(true);

    expect(
      evaluatePredicate(
        {
          type: 'or',
          predicates: [
            { type: 'trick', property: 'leadSuit', operator: 'eq', value: 'diamonds' },
            { type: 'trick', property: 'trickNumber', operator: 'eq', value: 5 },
          ],
        },
        context
      )
    ).toBe(true);
  });
});
