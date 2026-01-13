import { useRef, useEffect, useState } from 'react';
import type { PlayerPosition, PlayerView, TrickState, Suit } from '@fkthepope/shared';
import { TrickPile } from '../cards/TrickPile';
import { CardBack } from '../cards/Card';
import './GameTable.css';

const DISCONNECT_REPLACE_DELAY = 20000; // 20 seconds before "Replace with Bot" appears

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
  onReplaceWithBot?: (position: PlayerPosition) => void;
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
  onReplaceWithBot,
}: GameTableProps) {
  // Track which disconnected players can be replaced (after 20 seconds)
  const [canReplace, setCanReplace] = useState<Record<PlayerPosition, boolean>>({
    north: false,
    east: false,
    south: false,
    west: false,
  });

  // Set up timers for disconnect replacement eligibility
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    SEAT_ORDER.forEach((pos) => {
      const player = players[pos];
      if (player && !player.isBot && !player.isConnected && player.disconnectedAt) {
        const elapsed = Date.now() - player.disconnectedAt;
        const remaining = DISCONNECT_REPLACE_DELAY - elapsed;

        if (remaining <= 0) {
          // Already past delay
          setCanReplace((prev) => ({ ...prev, [pos]: true }));
        } else {
          // Set timer for when replace becomes available
          const timer = setTimeout(() => {
            setCanReplace((prev) => ({ ...prev, [pos]: true }));
          }, remaining);
          timers.push(timer);
        }
      } else {
        // Player connected or is a bot, reset replace eligibility
        setCanReplace((prev) => ({ ...prev, [pos]: false }));
      }
    });

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [players]);

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
        const isDisconnected = player && !player.isBot && !player.isConnected;

        return (
          <div
            key={position}
            className={`seat seat-${relPos} ${isCurrentTurn ? 'current-turn' : ''} ${isDisconnected ? 'disconnected' : ''}`}
          >
            {/* Video placeholder for humans, bot emoji for bots */}
            {player && (
              player.isBot ? (
                <BotPlaceholder />
              ) : isDisconnected ? (
                <div className="video-placeholder disconnected-placeholder">
                  <div className="no-video">
                    <div className="disconnect-icon">⚠️</div>
                    <div className="disconnect-label">Disconnected</div>
                  </div>
                </div>
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
                  <span className={`seat-name ${isDisconnected ? 'name-disconnected' : ''}`}>{player.name}</span>
                  <span className="seat-tricks">{player.tricksWon} tricks</span>
                </div>
                {isDisconnected && canReplace[position] && onReplaceWithBot && (
                  <button
                    className="replace-bot-btn"
                    onClick={() => onReplaceWithBot(position)}
                  >
                    Replace with Bot
                  </button>
                )}
                {relPos !== 'bottom' && !isDisconnected && (
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
