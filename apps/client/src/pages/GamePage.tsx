import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore, useMyHand, useLegalMoves, useIsMyTurn, useTrumpSuit, useCurrentTrick, useScores } from '../stores/game-store';
import { useGameActions } from '../socket/use-socket';
import { useVideoStore } from '../stores/video-store';
import { GameTable } from '../components/layout/GameTable';
import { Hand } from '../components/cards/Hand';
import { HandResultModal } from '../components/modals/HandResultModal';
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
  const scores = useScores();

  const { playCard, leaveRoom } = useGameActions();

  // UI state
  const [showStats, setShowStats] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [showRules, setShowRules] = useState(false);

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

  const handleQuit = () => {
    setShowQuitConfirm(false);
    leaveRoom();
  };


  // Get player names for stats display
  const playerNames = gameState.players;

  return (
    <div className="game-page">
      {/* Game header - simplified */}
      <header className="game-header">
        <div className="game-logo">
          <span className="logo-cards">
            <span className="logo-card red">A</span>
            <span className="logo-card black">A</span>
          </span>
          <h1>Whist Online</h1>
        </div>

        {/* Trump suit display - centered */}
        <div className="header-center">
          {trumpSuit && (
            <div className={`trump-badge trump-${trumpSuit}`}>
              <span className={`trump-icon suit-${trumpSuit}`}>
                {trumpSuit === 'hearts' ? '♥' : trumpSuit === 'diamonds' ? '♦' : trumpSuit === 'clubs' ? '♣' : '♠'}
              </span>
              <span className={`trump-text suit-${trumpSuit}`}>Trump suit</span>
            </div>
          )}
        </div>

        {/* Top right controls */}
        <div className="header-controls">
          <button
            className="header-btn stats-btn"
            onClick={() => setShowStats(true)}
            title="View game statistics"
          >
            Stats
          </button>

          <button
            className="header-btn rules-btn"
            onClick={() => setShowRules(true)}
            title="View game rules"
          >
            Rules
          </button>

          {/* Video controls */}
          {localStream ? (
            <div className="video-controls-inline">
              <button
                className={`header-btn icon-btn ${!isVideoEnabled ? 'off' : ''}`}
                onClick={toggleVideo}
                title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
              >
                {isVideoEnabled ? '📹' : '📷'}
              </button>
              <button
                className={`header-btn icon-btn ${!isAudioEnabled ? 'off' : ''}`}
                onClick={toggleAudio}
                title={isAudioEnabled ? 'Mute' : 'Unmute'}
              >
                {isAudioEnabled ? '🎤' : '🔇'}
              </button>
              <button
                className="header-btn icon-btn stop-btn"
                onClick={stopVideo}
                title="End video"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              className="header-btn video-start-btn"
              onClick={startVideo}
              title="Start video call"
            >
              Start Video
            </button>
          )}

          <div className="header-spacer"></div>

          <button
            className="header-btn quit-btn"
            onClick={() => setShowQuitConfirm(true)}
            title="Leave game"
          >
            Quit
          </button>
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

      {/* Player hand */}
      <div className="hand-area">
        <Hand
          cards={myHand}
          legalMoves={legalMoves}
          selectedCard={selectedCard}
          onCardSelect={handleCardSelect}
          isMyTurn={isMyTurn}
        />

        {/* Play buttons */}
        <div className="play-actions-container">
          {selectedCard && isMyTurn ? (
            <div className="play-actions">
              <button
                className="btn-primary play-btn"
                onClick={() => handlePlayCard(false)}
              >
                Play Card
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

      {/* Stats Modal */}
      {showStats && (
        <div className="modal-overlay" onClick={() => setShowStats(false)}>
          <div className="modal-content stats-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Game Statistics</h2>
            <div className="stats-table">
              <div className="stats-header">
                <span>Player</span>
                <span>Hands Won</span>
              </div>
              {(['north', 'east', 'south', 'west'] as PlayerPosition[]).map((pos) => {
                const player = playerNames[pos];
                if (!player) return null;
                return (
                  <div key={pos} className={`stats-row ${pos === myPosition ? 'my-row' : ''}`}>
                    <span className="stats-name">
                      {player.name}
                      {pos === myPosition && ' (You)'}
                    </span>
                    <span className="stats-score">{scores[pos]}</span>
                  </div>
                );
              })}
            </div>
            <button className="btn-primary" onClick={() => setShowStats(false)}>
              Back to Game
            </button>
          </div>
        </div>
      )}

      {/* Quit Confirmation Modal */}
      {showQuitConfirm && (
        <div className="modal-overlay" onClick={() => setShowQuitConfirm(false)}>
          <div className="modal-content quit-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Leave Game?</h2>
            <p>Are you sure you want to quit? You will return to the lobby.</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowQuitConfirm(false)}>
                Cancel
              </button>
              <button className="btn-danger" onClick={handleQuit}>
                Quit Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rules Modal */}
      {showRules && (
        <div className="modal-overlay" onClick={() => setShowRules(false)}>
          <div className="modal-content rules-modal" onClick={(e) => e.stopPropagation()}>
            <h2>How to Play Whist</h2>

            <div className="rules-content">
              <div className="rule-section">
                <h4>Objective</h4>
                <p>Win the most tricks in each hand. The player with the most tricks wins the hand and scores 1 point.</p>
              </div>

              <div className="rule-section">
                <h4>Setup</h4>
                <ul>
                  <li>4 players, each dealt 13 cards</li>
                  <li>Trump suit is randomly chosen each hand</li>
                </ul>
              </div>

              <div className="rule-section">
                <h4>Playing</h4>
                <ul>
                  <li><strong>Follow suit:</strong> You must play a card of the led suit if you have one</li>
                  <li><strong>Trump:</strong> If you can't follow suit, you may play a trump card</li>
                  <li><strong>Discard:</strong> If you can't follow and have no trumps, play any card</li>
                </ul>
              </div>

              <div className="rule-section">
                <h4>Winning Tricks</h4>
                <ul>
                  <li>Highest trump card wins</li>
                  <li>If no trumps played, highest card of led suit wins</li>
                  <li>Winner leads the next trick</li>
                </ul>
              </div>
            </div>

            <button className="btn-primary" onClick={() => setShowRules(false)}>
              Back to Game
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
