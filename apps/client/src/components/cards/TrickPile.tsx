import type { PlayedCard, PlayerPosition } from '@fkthepope/shared';
import { Card, CardBack } from './Card';
import { useUiStore } from '../../stores/ui-store';
import { useGameStore } from '../../stores/game-store';
import './TrickPile.css';

interface TrickPileProps {
  cards: PlayedCard[];
  winner?: PlayerPosition;
}

// Base positions for cards in the trick
const POSITION_OFFSETS: Record<PlayerPosition, { x: number; y: number }> = {
  south: { x: 0, y: 40 },
  west: { x: -50, y: 0 },
  north: { x: 0, y: -40 },
  east: { x: 50, y: 0 },
};

// Where cards fly to when the trick is won (relative to center, toward the winner's seat)
const WIN_DESTINATIONS: Record<PlayerPosition, { x: number; y: number }> = {
  south: { x: 0, y: 200 },
  west: { x: -250, y: 0 },
  north: { x: 0, y: -200 },
  east: { x: 250, y: 0 },
};

export function TrickPile({ cards, winner }: TrickPileProps) {
  const trickWinner = useUiStore((s) => s.trickWinner);
  const isAnimating = useUiStore((s) => s.isAnimatingTrick);
  const myPosition = useGameStore((s) => s.myPosition);

  // Calculate the relative winner position based on player's perspective
  const getRelativeWinDestination = (winnerPos: PlayerPosition): { x: number; y: number } => {
    if (!myPosition) return WIN_DESTINATIONS[winnerPos];

    // Map the absolute position to relative position based on player's seat
    const positions: PlayerPosition[] = ['south', 'west', 'north', 'east'];
    const myIndex = positions.indexOf(myPosition);
    const winnerIndex = positions.indexOf(winnerPos);
    const relativeIndex = (winnerIndex - myIndex + 4) % 4;
    const relativePositions: PlayerPosition[] = ['south', 'east', 'north', 'west'];
    const relativePos = relativePositions[relativeIndex] as PlayerPosition;

    return WIN_DESTINATIONS[relativePos];
  };

  return (
    <div className="trick-pile">
      {cards.map((played) => {
        const baseOffset = POSITION_OFFSETS[played.playedBy];

        // Calculate final position based on animation state
        let transform = `translate(${baseOffset.x}px, ${baseOffset.y}px)`;

        if (isAnimating && trickWinner) {
          const destination = getRelativeWinDestination(trickWinner);
          transform = `translate(${destination.x}px, ${destination.y}px) scale(0.5)`;
        }

        const isWinningCard = winner === played.playedBy || trickWinner === played.playedBy;

        return (
          <div
            key={`${played.card.rank}_${played.card.suit}_${played.playedBy}`}
            className={`trick-card ${isWinningCard ? 'winner' : ''} ${isAnimating ? 'animating' : ''}`}
            style={{ transform }}
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
