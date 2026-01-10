import type { PlayedCard, PlayerPosition } from '@fkthepope/shared';
import { Card, CardBack } from './Card';
import { useUiStore } from '../../stores/ui-store';
import { useGameStore } from '../../stores/game-store';
import './TrickPile.css';

interface TrickPileProps {
  cards: PlayedCard[];
  winner?: PlayerPosition;
}

// Visual positions for cards in the trick (relative to screen)
// bottom = my card, left = player to my left, top = across, right = player to my right
const VISUAL_OFFSETS: Record<string, { x: number; y: number }> = {
  bottom: { x: 0, y: 40 },
  left: { x: -50, y: 0 },
  top: { x: 0, y: -40 },
  right: { x: 50, y: 0 },
};

// Where cards fly to when the trick is won
const WIN_DESTINATIONS: Record<string, { x: number; y: number }> = {
  bottom: { x: 0, y: 200 },
  left: { x: -250, y: 0 },
  top: { x: 0, y: -200 },
  right: { x: 250, y: 0 },
};

// Seat order for position calculations (clockwise)
const SEAT_ORDER: PlayerPosition[] = ['south', 'west', 'north', 'east'];

export function TrickPile({ cards, winner }: TrickPileProps) {
  const trickWinner = useUiStore((s) => s.trickWinner);
  const isAnimating = useUiStore((s) => s.isAnimatingTrick);
  const myPosition = useGameStore((s) => s.myPosition);

  // Convert absolute player position to visual position on screen
  const getVisualPosition = (playerPos: PlayerPosition): string => {
    if (!myPosition) return 'bottom';

    const myIndex = SEAT_ORDER.indexOf(myPosition);
    const playerIndex = SEAT_ORDER.indexOf(playerPos);
    const relativeIndex = (playerIndex - myIndex + 4) % 4;

    // Clockwise from me: bottom (me), left, top, right
    const visualPositions = ['bottom', 'left', 'top', 'right'];
    return visualPositions[relativeIndex] ?? 'bottom';
  };

  return (
    <div className="trick-pile">
      {cards.map((played) => {
        const visualPos = getVisualPosition(played.playedBy);
        const baseOffset = VISUAL_OFFSETS[visualPos] ?? { x: 0, y: 0 };

        // Calculate final position based on animation state
        let transform = `translate(${baseOffset.x}px, ${baseOffset.y}px)`;

        if (isAnimating && trickWinner) {
          const winnerVisualPos = getVisualPosition(trickWinner);
          const destination = WIN_DESTINATIONS[winnerVisualPos] ?? { x: 0, y: 0 };
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
