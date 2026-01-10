import { useState } from 'react';
import { useGameActions } from '../../socket/use-socket';
import type { RuleEvent, RulePredicate, RuleEffect, Suit, Rank } from '@fkthepope/shared';
import { SUITS, RANKS, SUIT_SYMBOLS, SUIT_NAMES } from '@fkthepope/shared';
import './RuleCreator.css';

type TriggerType = 'rank' | 'suit' | 'specific';
type EffectType = 'forbid-rank' | 'forbid-suit' | 'skip-next';

const RANK_NAMES: Record<Rank, string> = {
  '2': 'Two', '3': 'Three', '4': 'Four', '5': 'Five', '6': 'Six',
  '7': 'Seven', '8': 'Eight', '9': 'Nine', '10': 'Ten',
  'J': 'Jack', 'Q': 'Queen', 'K': 'King', 'A': 'Ace',
};

export function RuleCreator() {
  const [triggerType, setTriggerType] = useState<TriggerType>('rank');
  const [triggerRank, setTriggerRank] = useState<Rank>('7');
  const [triggerSuit, setTriggerSuit] = useState<Suit>('spades');
  const [effectType, setEffectType] = useState<EffectType>('forbid-rank');
  const [effectRank, setEffectRank] = useState<Rank>('3');
  const [effectSuit, setEffectSuit] = useState<Suit>('hearts');

  const { createRule } = useGameActions();

  const generateRuleName = (): string => {
    const triggerName = triggerType === 'rank'
      ? `${RANK_NAMES[triggerRank]}s`
      : triggerType === 'suit'
      ? SUIT_NAMES[triggerSuit]
      : `${RANK_NAMES[triggerRank]} of ${SUIT_NAMES[triggerSuit]}`;

    const effectName = effectType === 'forbid-rank'
      ? `Ban ${RANK_NAMES[effectRank]}s`
      : effectType === 'forbid-suit'
      ? `Ban ${SUIT_NAMES[effectSuit]}`
      : 'Skip Next';

    return `${triggerName} → ${effectName}`;
  };

  const generateDescription = (): string => {
    const triggerDesc = triggerType === 'rank'
      ? `a ${RANK_NAMES[triggerRank]}`
      : triggerType === 'suit'
      ? `a ${SUIT_NAMES[triggerSuit]} card`
      : `the ${RANK_NAMES[triggerRank]} of ${SUIT_NAMES[triggerSuit]}`;

    const effectDesc = effectType === 'forbid-rank'
      ? `${RANK_NAMES[effectRank]}s cannot be played in the same trick`
      : effectType === 'forbid-suit'
      ? `${SUIT_NAMES[effectSuit]} cards cannot be played in the same trick`
      : 'the next player is skipped';

    return `When ${triggerDesc} is played, ${effectDesc}.`;
  };

  const handleSubmit = () => {
    const name = generateRuleName();
    const description = generateDescription();

    const event: RuleEvent = 'onPlayAttempt';
    let when: RulePredicate;
    let then: RuleEffect[];

    // Build the trigger predicate - check the card being played
    if (triggerType === 'rank') {
      when = {
        type: 'card',
        target: 'played',
        property: 'rank',
        operator: 'eq',
        value: triggerRank,
      };
    } else if (triggerType === 'suit') {
      when = {
        type: 'card',
        target: 'played',
        property: 'suit',
        operator: 'eq',
        value: triggerSuit,
      };
    } else {
      when = {
        type: 'and',
        predicates: [
          { type: 'card', target: 'played', property: 'rank', operator: 'eq', value: triggerRank },
          { type: 'card', target: 'played', property: 'suit', operator: 'eq', value: triggerSuit },
        ],
      };
    }

    // Build the effect
    if (effectType === 'forbid-rank') {
      // This becomes "if you play X, you can't also have Y in the trick"
      // For simplicity, we'll make it a requirement effect
      then = [{
        type: 'forbidPlay',
        message: `Playing ${triggerType === 'rank' ? RANK_NAMES[triggerRank] : triggerType === 'suit' ? SUIT_NAMES[triggerSuit] : `${RANK_NAMES[triggerRank]} of ${SUIT_NAMES[triggerSuit]}`} triggers the ${RANK_NAMES[effectRank]} ban!`,
      }];
    } else if (effectType === 'forbid-suit') {
      then = [{
        type: 'forbidPlay',
        message: `Playing ${triggerType === 'rank' ? RANK_NAMES[triggerRank] : triggerType === 'suit' ? SUIT_NAMES[triggerSuit] : `${RANK_NAMES[triggerRank]} of ${SUIT_NAMES[triggerSuit]}`} triggers the ${SUIT_NAMES[effectSuit]} ban!`,
      }];
    } else {
      then = [{ type: 'skipNextPlayer' }];
    }

    createRule({
      name,
      description,
      event,
      when,
      then,
    });
  };

  const handleSkip = () => {
    createRule({
      name: 'No Change',
      description: 'The winner chose not to add a new rule.',
      event: 'onHandEnd',
      when: { type: 'trick', property: 'cardCount', operator: 'lt', value: 0 },
      then: [],
    });
  };

  return (
    <div className="rule-creator-overlay">
      <div className="rule-creator">
        <h2>Create a New Rule</h2>
        <p className="subtitle">You won the hand! Add a rule that will affect future play.</p>

        {/* Trigger Section */}
        <div className="rule-section">
          <h3>When this card is played...</h3>
          <div className="rule-row">
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as TriggerType)}
              className="rule-select"
            >
              <option value="rank">Any card of rank</option>
              <option value="suit">Any card of suit</option>
              <option value="specific">Specific card</option>
            </select>

            {(triggerType === 'rank' || triggerType === 'specific') && (
              <select
                value={triggerRank}
                onChange={(e) => setTriggerRank(e.target.value as Rank)}
                className="rule-select"
              >
                {RANKS.map((rank) => (
                  <option key={rank} value={rank}>{RANK_NAMES[rank]}</option>
                ))}
              </select>
            )}

            {(triggerType === 'suit' || triggerType === 'specific') && (
              <select
                value={triggerSuit}
                onChange={(e) => setTriggerSuit(e.target.value as Suit)}
                className="rule-select"
              >
                {SUITS.map((suit) => (
                  <option key={suit} value={suit}>{SUIT_SYMBOLS[suit]} {SUIT_NAMES[suit]}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Effect Section */}
        <div className="rule-section">
          <h3>Then this happens...</h3>
          <div className="rule-row">
            <select
              value={effectType}
              onChange={(e) => setEffectType(e.target.value as EffectType)}
              className="rule-select"
            >
              <option value="forbid-rank">Block it (if rank matches)</option>
              <option value="forbid-suit">Block it (if suit matches)</option>
              <option value="skip-next">Skip next player</option>
            </select>

            {effectType === 'forbid-rank' && (
              <select
                value={effectRank}
                onChange={(e) => setEffectRank(e.target.value as Rank)}
                className="rule-select"
              >
                {RANKS.map((rank) => (
                  <option key={rank} value={rank}>{RANK_NAMES[rank]}</option>
                ))}
              </select>
            )}

            {effectType === 'forbid-suit' && (
              <select
                value={effectSuit}
                onChange={(e) => setEffectSuit(e.target.value as Suit)}
                className="rule-select"
              >
                {SUITS.map((suit) => (
                  <option key={suit} value={suit}>{SUIT_SYMBOLS[suit]} {SUIT_NAMES[suit]}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Preview */}
        <div className="rule-preview">
          <div className="preview-label">Rule Preview</div>
          <div className="preview-name">{generateRuleName()}</div>
          <div className="preview-desc">{generateDescription()}</div>
        </div>

        <div className="actions">
          <button className="btn-secondary" onClick={handleSkip}>
            Skip (No Rule)
          </button>
          <button className="btn-primary" onClick={handleSubmit}>
            Create Rule
          </button>
        </div>
      </div>
    </div>
  );
}
