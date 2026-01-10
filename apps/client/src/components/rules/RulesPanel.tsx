import type { Rule } from '@fkthepope/shared';
import { useActiveRules } from '../../stores/game-store';
import { useUiStore } from '../../stores/ui-store';
import './RulesPanel.css';

export function RulesPanel() {
  const rules = useActiveRules();
  const showPanel = useUiStore((s) => s.showRulesPanel);
  const setShowPanel = useUiStore((s) => s.setShowRulesPanel);

  if (!showPanel) {
    return (
      <button
        className="rules-toggle-btn"
        onClick={() => setShowPanel(true)}
      >
        Rules ({rules.length})
      </button>
    );
  }

  return (
    <div className="rules-panel">
      <div className="rules-header">
        <h3>Active Rules</h3>
        <button
          className="close-btn"
          onClick={() => setShowPanel(false)}
        >
          &times;
        </button>
      </div>

      <div className="rules-list">
        {rules.length === 0 ? (
          <p className="no-rules">No custom rules yet.</p>
        ) : (
          rules.map((rule) => (
            <RuleCard key={rule.id} rule={rule} />
          ))
        )}
      </div>
    </div>
  );
}

function RuleCard({ rule }: { rule: Rule }) {
  return (
    <div className="rule-card">
      <div className="rule-name">{rule.name}</div>
      <div className="rule-description">{rule.description}</div>
      <div className="rule-meta">
        <span>Added by {rule.createdBy}</span>
        <span>Hand #{rule.createdAtHand}</span>
      </div>
    </div>
  );
}
