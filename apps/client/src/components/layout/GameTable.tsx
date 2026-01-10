import type { PlayerPosition, PlayerView, TrickState, Suit } from '@fkthepope/shared';
import { TrickPile } from '../cards/TrickPile';
import { CardBack } from '../cards/Card';
import './GameTable.css';

interface GameTableProps {
  players: Record<PlayerPosition, PlayerView | null>;
  currentTrick: TrickState | null;
  myPosition: PlayerPosition;
  trumpSuit: Suit | null; // Kept for potential future use
  waitingFor: PlayerPosition | null;
}

const SEAT_ORDER: PlayerPosition[] = ['south', 'west', 'north', 'east'];

export function GameTable({
  players,
  currentTrick,
  myPosition,
  trumpSuit: _trumpSuit,
  waitingFor,
}: GameTableProps) {
  // Rotate seats so myPosition is always at bottom
  const myIndex = SEAT_ORDER.indexOf(myPosition);
  const rotatedSeats = [
    ...SEAT_ORDER.slice(myIndex),
    ...SEAT_ORDER.slice(0, myIndex),
  ];

  const getRelativePosition = (index: number): string => {
    const positions = ['bottom', 'right', 'top', 'left'];
    return positions[index] ?? 'bottom';
  };

  return (
    <div className="game-table">
      {/* Center trick area */}
      <div className="table-center">
        {currentTrick && (
          <TrickPile
            cards={currentTrick.cards}
            winner={currentTrick.winner}
          />
        )}
      </div>

      {/* Player seats */}
      {rotatedSeats.map((position, index) => {
        const player = players[position];
        const relPos = getRelativePosition(index);
        const isCurrentTurn = waitingFor === position;

        return (
          <div
            key={position}
            className={`seat seat-${relPos} ${isCurrentTurn ? 'current-turn' : ''}`}
          >
            {player && (
              <>
                <div className="seat-info">
                  <span className="seat-name">{player.name}</span>
                  <span className="seat-tricks">{player.tricksWon} tricks</span>
                </div>
                {relPos !== 'bottom' && (
                  <div className="seat-cards">
                    {Array.from({ length: Math.min(player.cardCount, 5) }).map((_, i) => (
                      <div key={i} className="mini-card">
                        <CardBack size="small" />
                      </div>
                    ))}
                    {player.cardCount > 5 && (
                      <span className="card-count">+{player.cardCount - 5}</span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
