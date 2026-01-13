import type { Card as CardType } from '@fkthepope/shared';
import { SUIT_SYMBOLS, SUIT_NAMES, RANK_NAMES } from '@fkthepope/shared';
import './Card.css';

interface CardProps {
  card: CardType;
  faceDown?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  size?: 'mini' | 'small' | 'medium' | 'large';
  tabIndex?: number;
}

export function Card({
  card,
  faceDown = false,
  selected = false,
  disabled = false,
  onClick,
  onKeyDown,
  size = 'medium',
  tabIndex,
}: CardProps) {
  const suitSymbol = SUIT_SYMBOLS[card.suit];
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';

  // Generate accessible label for the card
  const cardLabel = `${RANK_NAMES[card.rank]} of ${SUIT_NAMES[card.suit]}`;
  const stateLabel = selected ? ', selected' : disabled ? ', not playable' : '';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (onKeyDown) {
      onKeyDown(e);
    }
    // Handle Enter and Space for activation
    if ((e.key === 'Enter' || e.key === ' ') && onClick && !disabled) {
      e.preventDefault();
      onClick();
    }
  };

  if (faceDown) {
    return (
      <div
        className={`card card-back card-${size} ${selected ? 'selected' : ''}`}
        onClick={!disabled ? onClick : undefined}
        role="img"
        aria-label="Face-down card"
      >
        <div className="card-pattern" />
      </div>
    );
  }

  return (
    <div
      className={`card card-${size} ${isRed ? 'red' : 'black'} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${onClick ? 'clickable' : ''}`}
      onClick={!disabled && onClick ? onClick : undefined}
      onKeyDown={handleKeyDown}
      role="button"
      aria-label={cardLabel + stateLabel}
      aria-pressed={selected}
      aria-disabled={disabled}
      tabIndex={tabIndex ?? (onClick && !disabled ? 0 : -1)}
    >
      <div className="card-corner top-left" aria-hidden="true">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit">{suitSymbol}</span>
      </div>
      <div className="card-center" aria-hidden="true">
        <span className="card-center-rank">{card.rank}</span>
        <span className="card-suit-large">{suitSymbol}</span>
      </div>
      <div className="card-corner bottom-right" aria-hidden="true">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit">{suitSymbol}</span>
      </div>
    </div>
  );
}

interface CardBackProps {
  size?: 'mini' | 'small' | 'medium' | 'large';
}

export function CardBack({ size = 'medium' }: CardBackProps) {
  return (
    <div
      className={`card card-back card-${size}`}
      role="img"
      aria-label="Face-down card"
    >
      <div className="card-pattern" />
    </div>
  );
}
