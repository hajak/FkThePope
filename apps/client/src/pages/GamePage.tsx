import { useEffect, useMemo, useRef } from 'react';
import { useGameStore, useMyHand, useLegalMoves, useIsMyTurn, useTrumpSuit, useCurrentTrick } from '../stores/game-store';
import { useGameActions } from '../socket/use-socket';
import { useVideoStore } from '../stores/video-store';
import { GameTable } from '../components/layout/GameTable';
import { Hand } from '../components/cards/Hand';
import { HandResultModal } from '../components/modals/HandResultModal';
import { RulesPanel } from '../components/rules/RulesPanel';
import type { Card, PlayerPosition } from '@fkthepope/shared';
import './GamePage.css';

export function GamePage() {
  const gameState = useGameStore((s) => s.gameState);
  const myPosition = useGameStore((s) => s.myPosition);
  const selectedCard = useGameStore((s) => s.selectedCard);
  const setSelectedCard = useGameStore((s) => s.setSelectedCard);
  const waitingFor = useGameStore((s) => s.waitingFor);

  const myHand = useMyHand();
  const legalMoves = useLegalMoves();
  const isMyTurn = useIsMyTurn();
  const trumpSuit = useTrumpSuit();
  const currentTrick = useCurrentTrick();

  const { playCard } = useGameActions();

  // Video state
  const localStream = useVideoStore((s) => s.localStream);
  const remoteStreams = useVideoStore((s) => s.remoteStreams);
  const isVideoEnabled = useVideoStore((s) => s.isVideoEnabled);
  const isAudioEnabled = useVideoStore((s) => s.isAudioEnabled);
  const playerMuteStatus = useVideoStore((s) => s.playerMuteStatus);
  const startVideo = useVideoStore((s) => s.startVideo);
  const stopVideo = useVideoStore((s) => s.stopVideo);
  const toggleVideo = useVideoStore((s) => s.toggleVideo);
  const toggleAudio = useVideoStore((s) => s.toggleAudio);
  const sendOffer = useVideoStore((s) => s.sendOffer);

  // Combine local stream with remote streams for display
  const videoStreams = useMemo(() => {
    const streams: Record<PlayerPosition, MediaStream | null> = {
      ...remoteStreams,
    };
    if (myPosition) {
      streams[myPosition] = localStream;
    }
    return streams;
  }, [localStream, remoteStreams, myPosition]);

  // Track which players we've already sent offers to
  const offeredToRef = useRef<Set<PlayerPosition>>(new Set());

  // Start video calls when we have local stream - only send offers once per player
  useEffect(() => {
    if (localStream && myPosition && gameState) {
      const positions: PlayerPosition[] = ['north', 'east', 'south', 'west'];
      positions.forEach(pos => {
        if (
          pos !== myPosition &&
          gameState.players[pos] &&
          !gameState.players[pos]?.isBot &&
          !offeredToRef.current.has(pos)
        ) {
          offeredToRef.current.add(pos);
          sendOffer(pos);
        }
      });
    }
  }, [localStream, myPosition, gameState, sendOffer]);

  // Clear offered tracking when local stream stops
  useEffect(() => {
    if (!localStream) {
      offeredToRef.current.clear();
    }
  }, [localStream]);

  if (!gameState || !myPosition) {
    return <div className="game-page">Loading...</div>;
  }

  const handleCardSelect = (card: Card | null) => {
    setSelectedCard(card);
  };

  const handlePlayCard = (faceDown: boolean) => {
    if (selectedCard) {
      playCard(selectedCard, faceDown);
      setSelectedCard(null);
    }
  };


  return (
    <div className="game-page">
      {/* Game header */}
      <header className="game-header">
        <div className="game-logo">
          <span className="logo-cards">
            <span className="logo-card red">A</span>
            <span className="logo-card black">A</span>
          </span>
          <h1>Whist Online</h1>
        </div>
        <div className="game-stats">
          <div className="stat-group">
            <span className="stat-label">Hand {gameState.currentHand?.number ?? '-'}</span>
            <span className="stat-divider">|</span>
            <span className="stat-label">Trick {currentTrick?.trickNumber ?? '-'}/13</span>
          </div>
          {trumpSuit && (
            <div className={`trump-badge trump-${trumpSuit}`}>
              <span className={`trump-icon suit-${trumpSuit}`}>
                {trumpSuit === 'hearts' ? '♥' : trumpSuit === 'diamonds' ? '♦' : trumpSuit === 'clubs' ? '♣' : '♠'}
              </span>
              <span className={`trump-name suit-${trumpSuit}`}>
                {trumpSuit.charAt(0).toUpperCase() + trumpSuit.slice(1)}
              </span>
            </div>
          )}
          <div className="score-display">
            <span className="score-label">Score</span>
            <span className="score-value">{gameState.scores[myPosition] ?? 0}</span>
          </div>
        </div>
      </header>

      {/* Main table area */}
      <div className="table-area">
        <GameTable
          players={gameState.players}
          currentTrick={currentTrick}
          myPosition={myPosition}
          trumpSuit={trumpSuit}
          waitingFor={waitingFor}
          videoStreams={videoStreams}
          playerMuteStatus={playerMuteStatus}
          isLocalMuted={!isAudioEnabled}
        />
      </div>

      {/* Video controls */}
      <div className="video-controls">
        {localStream ? (
          <>
            <button
              className={`btn-secondary video-btn ${!isVideoEnabled ? 'off' : ''}`}
              onClick={toggleVideo}
              title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              {isVideoEnabled ? '📹' : '📷'}
            </button>
            <button
              className={`btn-secondary video-btn ${!isAudioEnabled ? 'off' : ''}`}
              onClick={toggleAudio}
              title={isAudioEnabled ? 'Mute' : 'Unmute'}
            >
              {isAudioEnabled ? '🎤' : '🔇'}
            </button>
            <button
              className="btn-secondary video-btn stop"
              onClick={stopVideo}
              title="Stop video call"
            >
              End
            </button>
          </>
        ) : (
          <button
            className="btn-primary video-btn start"
            onClick={startVideo}
            title="Start video call"
          >
            Start Video
          </button>
        )}
      </div>

      {/* Player hand */}
      <div className="hand-area">
        <Hand
          cards={myHand}
          legalMoves={legalMoves}
          selectedCard={selectedCard}
          onCardSelect={handleCardSelect}
          isMyTurn={isMyTurn}
        />

        {/* Play buttons - always reserve space */}
        <div className="play-actions-container">
          {selectedCard && isMyTurn ? (
            <div className="play-actions">
              <button
                className="btn-primary"
                onClick={() => handlePlayCard(false)}
              >
                Play
              </button>
            </div>
          ) : !isMyTurn ? (
            <div className="waiting-message">
              Waiting for {waitingFor}...
            </div>
          ) : (
            <div className="play-actions-placeholder">
              Select a card to play
            </div>
          )}
        </div>
      </div>

      {/* Hand result modal */}
      <HandResultModal />

      {/* Rules panel */}
      <RulesPanel trumpSuit={trumpSuit} />
    </div>
  );
}
