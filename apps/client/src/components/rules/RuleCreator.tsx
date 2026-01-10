import { useState } from 'react';
import { useGameActions } from '../../socket/use-socket';
import type { RuleEvent, RulePredicate, RuleEffect } from '@fkthepope/shared';
import './RuleCreator.css';

const RULE_TEMPLATES = [
  {
    id: 'forbid-rank-after-rank',
    name: 'Forbid Rank After Rank',
    description: 'After a specific rank is played, forbid another rank',
    triggerRank: '7',
    forbiddenRank: '3',
  },
  {
    id: 'no-face-cards-first',
    name: 'No Face Cards First Trick',
    description: 'Cannot play face cards (J, Q, K) on the first trick',
  },
  {
    id: 'trump-requires-trump',
    name: 'Trump Tax',
    description: 'After trump is played, next player must play trump if possible',
  },
];

export function RuleCreator() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const { createRule } = useGameActions();

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = RULE_TEMPLATES.find((t) => t.id === templateId);
    if (template) {
      setName(template.name);
      setDescription(template.description);
    }
  };

  const handleSubmit = () => {
    if (!name.trim() || !description.trim()) return;

    // Create rule based on template
    let event: RuleEvent = 'onPlayAttempt';
    let when: RulePredicate;
    let then: RuleEffect[];

    switch (selectedTemplate) {
      case 'forbid-rank-after-rank':
        when = {
          type: 'card',
          target: 'any',
          property: 'rank',
          operator: 'eq',
          value: '7',
        };
        then = [
          {
            type: 'forbidPlay',
            cardMatcher: {
              type: 'card',
              target: 'played',
              property: 'value',
              operator: 'in',
              value: [3, 5, 7, 9, 11, 13],
            },
            message: 'Cannot play odd-ranked cards after a 7!',
          },
        ];
        break;

      case 'no-face-cards-first':
        when = {
          type: 'and',
          predicates: [
            { type: 'trick', property: 'trickNumber', operator: 'eq', value: 1 },
            { type: 'card', target: 'played', property: 'value', operator: 'gte', value: 11 },
          ],
        };
        then = [
          {
            type: 'forbidPlay',
            message: 'Cannot play face cards on the first trick!',
          },
        ];
        break;

      case 'trump-requires-trump':
        when = {
          type: 'trick',
          property: 'hasTrump',
          operator: 'eq',
          value: true,
        };
        then = [
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
        ];
        break;

      default:
        // Generic rule
        when = {
          type: 'trick',
          property: 'cardCount',
          operator: 'gte',
          value: 0,
        };
        then = [
          {
            type: 'forbidPlay',
            message: description,
          },
        ];
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
    // Create a trivial "no-op" rule
    createRule({
      name: 'No Change',
      description: 'The winner chose not to add a new rule.',
      event: 'onHandEnd',
      when: { type: 'trick', property: 'cardCount', operator: 'lt', value: 0 }, // Never triggers
      then: [],
    });
  };

  return (
    <div className="rule-creator-overlay">
      <div className="rule-creator">
        <h2>Create a New Rule</h2>
        <p className="subtitle">You won the hand! Add a rule that will affect future play.</p>

        <div className="template-section">
          <h3>Choose a Template</h3>
          <div className="templates">
            {RULE_TEMPLATES.map((template) => (
              <div
                key={template.id}
                className={`template-card ${selectedTemplate === template.id ? 'selected' : ''}`}
                onClick={() => handleTemplateSelect(template.id)}
              >
                <div className="template-name">{template.name}</div>
                <div className="template-desc">{template.description}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="form-section">
          <label>
            Rule Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., No Sevens Then Odds"
            />
          </label>

          <label>
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this rule does..."
              rows={3}
            />
          </label>
        </div>

        <div className="actions">
          <button className="btn-secondary" onClick={handleSkip}>
            Skip (No Rule)
          </button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!name.trim() || !description.trim()}
          >
            Create Rule
          </button>
        </div>
      </div>
    </div>
  );
}
