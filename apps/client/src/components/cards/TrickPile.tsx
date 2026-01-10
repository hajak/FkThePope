import type { PlayedCard, PlayerPosition } from '@fkthepope/shared';
import { Card, CardBack } from './Card';
import './TrickPile.css';

interface TrickPileProps {
  cards: PlayedCard[];
  winner?: PlayerPosition;
}

const POSITION_OFFSETS: Record<PlayerPosition, { x: number; y: number }> = {
  south: { x: 0, y: 40 },
  west: { x: -50, y: 0 },
  north: { x: 0, y: -40 },
  east: { x: 50, y: 0 },
};

export function TrickPile({ cards, winner }: TrickPileProps) {
  return (
    <div className="trick-pile">
      {cards.map((played) => {
        const offset = POSITION_OFFSETS[played.playedBy];
        const isWinner = winner === played.playedBy;

        return (
          <div
            key={`${played.card.rank}_${played.card.suit}_${played.playedBy}`}
            className={`trick-card ${isWinner ? 'winner' : ''}`}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px)`,
            }}
          >
            {played.faceDown ? (
              <CardBack size="small" />
            ) : (
              <Card card={played.card} size="small" />
            )}
          </div>
        );
      })}
    </div>
  );
}
