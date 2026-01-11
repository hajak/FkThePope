import { useRef, useEffect } from 'react';
import type { PlayerPosition, PlayerView, TrickState, Suit } from '@fkthepope/shared';
import { TrickPile } from '../cards/TrickPile';
import { CardBack } from '../cards/Card';
import './GameTable.css';

interface VideoPlaceholderProps {
  stream: MediaStream | null | undefined;
  isMuted?: boolean;
  isLocalPlayer?: boolean;
}

function VideoPlaceholder({ stream, isMuted, isLocalPlayer }: VideoPlaceholderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="video-placeholder">
      {stream ? (
        <video ref={videoRef} autoPlay muted={isLocalPlayer} playsInline />
      ) : (
        <div className="no-video">
          <div className="video-icon">📹</div>
        </div>
      )}
      {isMuted && (
        <div className="mute-indicator" title="Muted">
          🔇
        </div>
      )}
    </div>
  );
}

function BotPlaceholder() {
  return (
    <div className="video-placeholder bot-placeholder">
      <div className="no-video">
        <div className="bot-icon">🤖</div>
      </div>
    </div>
  );
}

interface GameTableProps {
  players: Record<PlayerPosition, PlayerView | null>;
  currentTrick: TrickState | null;
  myPosition: PlayerPosition;
  trumpSuit: Suit | null; // Kept for potential future use
  waitingFor: PlayerPosition | null;
  videoStreams?: Record<PlayerPosition, MediaStream | null>;
  playerMuteStatus?: Record<PlayerPosition, boolean>;
  isLocalMuted?: boolean;
}

const SEAT_ORDER: PlayerPosition[] = ['south', 'west', 'north', 'east'];

export function GameTable({
  players,
  currentTrick,
  myPosition,
  trumpSuit: _trumpSuit,
  waitingFor,
  videoStreams,
  playerMuteStatus,
  isLocalMuted,
}: GameTableProps) {
  // Rotate seats so myPosition is always at bottom
  const myIndex = SEAT_ORDER.indexOf(myPosition);
  const rotatedSeats = [
    ...SEAT_ORDER.slice(myIndex),
    ...SEAT_ORDER.slice(0, myIndex),
  ];

  const getRelativePosition = (index: number): string => {
    // Clockwise from player: me (bottom), left, across (top), right
    const positions = ['bottom', 'left', 'top', 'right'];
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
            {/* Video placeholder for humans, bot emoji for bots */}
            {player && (
              player.isBot ? (
                <BotPlaceholder />
              ) : (
                <VideoPlaceholder
                  stream={videoStreams?.[position]}
                  isMuted={position === myPosition ? isLocalMuted : playerMuteStatus?.[position]}
                  isLocalPlayer={position === myPosition}
                />
              )
            )}
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
                        <CardBack size="mini" />
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
