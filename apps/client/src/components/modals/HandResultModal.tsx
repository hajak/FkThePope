import type { PlayerPosition } from '@fkthepope/shared';
import { useUiStore } from '../../stores/ui-store';
import { useGameStore } from '../../stores/game-store';
import { useGameActions } from '../../socket/use-socket';
import './HandResultModal.css';

export function HandResultModal() {
  const handResult = useUiStore((s) => s.handResult);
  const setHandResult = useUiStore((s) => s.setHandResult);
  const myPosition = useGameStore((s) => s.myPosition);
  const players = useGameStore((s) => s.gameState?.players);
  const { continueGame } = useGameActions();

  if (!handResult) return null;

  const { winner, tricks } = handResult;
  const isWinner = winner === myPosition;
  const winnerTricks = tricks[winner] ?? 0;
  const positions: PlayerPosition[] = ['north', 'east', 'south', 'west'];

  const getPlayerName = (pos: PlayerPosition) => {
    const player = players?.[pos];
    const seatNum = positions.indexOf(pos) + 1;
    if (!player) return `Seat ${seatNum}`;
    if (pos === myPosition) return `${player.name} (You)`;
    return player.name;
  };

  const winnerName = getPlayerName(winner);

  // Sort positions by tricks won (descending)
  const sortedPositions = [...positions].sort(
    (a, b) => (tricks[b] ?? 0) - (tricks[a] ?? 0)
  );

  const handleContinue = () => {
    continueGame();
    setHandResult(null);
  };

  return (
    <div className="modal-overlay">
      <div className="hand-result-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className={isWinner ? 'winner-text' : ''}>
          {isWinner
            ? `You won the hand with ${winnerTricks} tricks!`
            : `${winnerName} wins with ${winnerTricks} tricks!`}
        </h2>

        <div className="hand-scores">
          {sortedPositions.map((pos) => (
            <div
              key={pos}
              className={`score-row ${pos === winner ? 'winner' : ''} ${pos === myPosition ? 'me' : ''}`}
            >
              <span className="position-name">
                {getPlayerName(pos)}
              </span>
              <span className="tricks-count">
                {tricks[pos] ?? 0} tricks
              </span>
            </div>
          ))}
        </div>

        <button className="btn-primary" onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
