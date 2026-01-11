import type { Suit } from '@fkthepope/shared';
import './RulesPanel.css';

interface RulesPanelProps {
  trumpSuit: Suit | null;
}

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

const SUIT_NAMES: Record<Suit, string> = {
  hearts: 'Hearts',
  diamonds: 'Diamonds',
  clubs: 'Clubs',
  spades: 'Spades',
};

export function RulesPanel({ trumpSuit }: RulesPanelProps) {
  return (
    <div className="rules-panel">
      {/* Current Trump Display */}
      {trumpSuit && (
        <div className={`trump-display trump-${trumpSuit}`}>
          <span className="trump-label">Trump Suit</span>
          <div className="trump-suit">
            <span className="trump-symbol">{SUIT_SYMBOLS[trumpSuit]}</span>
            <span className="trump-name">{SUIT_NAMES[trumpSuit]}</span>
          </div>
        </div>
      )}

      <h3>How to Play Whist</h3>

      <div className="rules-section">
        <h4>Objective</h4>
        <p>Win the most tricks in each hand. First to reach the target score wins the game.</p>
      </div>

      <div className="rules-section">
        <h4>Setup</h4>
        <ul>
          <li>4 players, each dealt 13 cards</li>
          <li>Trump suit is randomly chosen each hand</li>
        </ul>
      </div>

      <div className="rules-section">
        <h4>Playing</h4>
        <ul>
          <li><strong>Follow suit:</strong> You must play a card of the led suit if you have one</li>
          <li><strong>Trump:</strong> If you can't follow suit, you may play a trump card</li>
          <li><strong>Discard:</strong> If you can't follow suit and have no trumps, play any card</li>
        </ul>
      </div>

      <div className="rules-section">
        <h4>Winning Tricks</h4>
        <ul>
          <li>Highest trump card wins</li>
          <li>If no trumps, highest card of led suit wins</li>
          <li>Winner leads the next trick</li>
        </ul>
      </div>

      <div className="rules-section">
        <h4>Scoring</h4>
        <p>Player with the most tricks wins the hand and scores 1 point.</p>
      </div>
    </div>
  );
}
