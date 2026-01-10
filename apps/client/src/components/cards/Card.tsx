import type { Card as CardType } from '@fkthepope/shared';
import { SUIT_SYMBOLS } from '@fkthepope/shared';
import './Card.css';

interface CardProps {
  card: CardType;
  faceDown?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: 'small' | 'medium' | 'large';
}

export function Card({
  card,
  faceDown = false,
  selected = false,
  disabled = false,
  onClick,
  size = 'medium',
}: CardProps) {
  const suitSymbol = SUIT_SYMBOLS[card.suit];
  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';

  if (faceDown) {
    return (
      <div
        className={`card card-back card-${size} ${selected ? 'selected' : ''}`}
        onClick={!disabled ? onClick : undefined}
      >
        <div className="card-pattern" />
      </div>
    );
  }

  return (
    <div
      className={`card card-${size} ${isRed ? 'red' : 'black'} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${onClick ? 'clickable' : ''}`}
      onClick={!disabled && onClick ? onClick : undefined}
    >
      <div className="card-corner top-left">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit">{suitSymbol}</span>
      </div>
      <div className="card-center">
        <span className="card-suit-large">{suitSymbol}</span>
      </div>
      <div className="card-corner bottom-right">
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit">{suitSymbol}</span>
      </div>
    </div>
  );
}

interface CardBackProps {
  size?: 'small' | 'medium' | 'large';
}

export function CardBack({ size = 'medium' }: CardBackProps) {
  return (
    <div className={`card card-back card-${size}`}>
      <div className="card-pattern" />
    </div>
  );
}
