import { useEffect, useState, useRef } from 'react';
import { useGameStore, useSkitgubbeState } from '../stores/game-store';
import { useGameActions } from '../socket/use-socket';
import { useVideoStore } from '../stores/video-store';
import { Hand } from '../components/cards/Hand';
import { APP_VERSION } from '../socket/socket-client';
import type { Card, PlayerPosition } from '@fkthepope/shared';
import './SkitgubbeGamePage.css';

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

// Duration to show completed trick before clearing (ms)
const TRICK_DISPLAY_DURATION = 1500;

interface DisplayedTrick {
  cards: Array<{ card: Card; playedBy: PlayerPosition }>;
  winner?: PlayerPosition;
}

export function SkitgubbeGamePage() {
  const myPosition = useGameStore((s) => s.myPosition);
  const waitingFor = useGameStore((s) => s.waitingFor);
  const selectedCard = useGameStore((s) => s.selectedCard);
  const setSelectedCard = useGameStore((s) => s.setSelectedCard);

  const skitgubbeState = useSkitgubbeState();

  const { skitgubbePlay, skitgubbePickup, leaveRoom } = useGameActions();

  // UI state
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [showRules, setShowRules] = useState(false);

  // Trick display state - preserve completed tricks briefly
  const [displayedTrick, setDisplayedTrick] = useState<DisplayedTrick | null>(null);
  const lastTrickRef = useRef<DisplayedTrick | null>(null);
  const trickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Video state
  const localStream = useVideoStore((s) => s.localStream);
  const stopVideo = useVideoStore((s) => s.stopVideo);

  // Cleanup video on unmount
  useEffect(() => {
    return () => {
      if (localStream) {
        stopVideo();
      }
    };
  }, []);

  // Manage trick display - preserve completed tricks briefly before clearing
  useEffect(() => {
    const currentTrick = skitgubbeState?.currentTrick;
    const currentCards = currentTrick?.cards || [];

    // If we have cards in current trick, show them and remember them
    if (currentCards.length > 0) {
      const trick: DisplayedTrick = {
        cards: currentCards,
        winner: currentTrick?.winner,
      };
      setDisplayedTrick(trick);
      lastTrickRef.current = trick;

      // Clear any pending timeout
      if (trickTimeoutRef.current) {
        clearTimeout(trickTimeoutRef.current);
        trickTimeoutRef.current = null;
      }
    } else if (lastTrickRef.current && lastTrickRef.current.cards.length >= 2) {
      // Trick just completed (was 2 cards, now 0) - keep showing for a bit
      if (!trickTimeoutRef.current) {
        trickTimeoutRef.current = setTimeout(() => {
          setDisplayedTrick(null);
          lastTrickRef.current = null;
          trickTimeoutRef.current = null;
        }, TRICK_DISPLAY_DURATION);
      }
    } else {
      // No previous trick to preserve
      setDisplayedTrick(null);
      lastTrickRef.current = null;
    }

    return () => {
      if (trickTimeoutRef.current) {
        clearTimeout(trickTimeoutRef.current);
      }
    };
  }, [skitgubbeState?.currentTrick]);

  if (!skitgubbeState || !myPosition) {
    return <div className="skitgubbe-game-page">Loading...</div>;
  }

  const isMyTurn = waitingFor === myPosition;
  const isPhase1 = skitgubbeState.phase === 'phase1';
  const isPhase2 = skitgubbeState.phase === 'phase2';
  const isComplete = skitgubbeState.phase === 'game_end';
  const amIOut = skitgubbeState.playersOut.includes(myPosition);

  const handleCardSelect = (card: Card | null) => {
    setSelectedCard(card);
  };

  const handlePlayCard = () => {
    if (selectedCard) {
      skitgubbePlay(selectedCard);
      setSelectedCard(null);
    }
  };

  const handlePickup = () => {
    skitgubbePickup();
  };

  const handleQuit = () => {
    setShowQuitConfirm(false);
    leaveRoom();
  };

  const getPlayerName = (position: PlayerPosition): string => {
    return skitgubbeState.players[position]?.name || position;
  };

  return (
    <div className="skitgubbe-game-page">
      {/* Header */}
      <header className="game-header">
        <div className="game-logo">
          <span className="logo-cards">
            <span className="logo-card red">A</span>
            <span className="logo-card black">A</span>
          </span>
          <h1>Skitgubbe</h1>
        </div>

        <div className="header-center">
          <div className="phase-display">
            {isPhase1 && 'Phase 1: Trick-Taking'}
            {isPhase2 && 'Phase 2: Shed Your Cards!'}
            {isComplete && 'Game Over'}
          </div>
        </div>

        <div className="header-controls">
          <button
            className="header-btn rules-btn"
            onClick={() => setShowRules(true)}
            title="View game rules"
          >
            Rules
          </button>
          <button
            className="header-btn quit-btn"
            onClick={() => setShowQuitConfirm(true)}
            title="Leave game"
          >
            Quit
          </button>
        </div>
      </header>

      {/* Main game area */}
      <div className="skitgubbe-table">
        {/* Game info */}
        <div className="game-info">
          {isPhase1 && skitgubbeState.stockCount > 0 && (
            <div className="stock-info">
              <span className="stock-count">{skitgubbeState.stockCount}</span>
              <span className="stock-label">cards in stock</span>
            </div>
          )}
          {isPhase2 && (
            <div className="pile-info">
              <span className="pile-count">{skitgubbeState.pile?.cards?.length || 0}</span>
              <span className="pile-label">cards in pile</span>
            </div>
          )}
        </div>

        {/* Player positions with center area in grid */}
        <div className="skitgubbe-seats">
          {(['north', 'east', 'south', 'west'] as PlayerPosition[]).map((pos) => {
            const player = skitgubbeState.players[pos];
            if (!player) return null;

            const isCurrentTurn = waitingFor === pos;
            const isMe = pos === myPosition;
            const isOut = skitgubbeState.playersOut.includes(pos);
            const isLoser = skitgubbeState.loser === pos;
            const cardCount = skitgubbeState.handCounts[pos] || 0;

            return (
              <div
                key={pos}
                className={`skitgubbe-seat seat-${pos} ${isCurrentTurn ? 'current-turn' : ''} ${isMe ? 'my-seat' : ''} ${isOut ? 'out' : ''} ${isLoser ? 'loser' : ''}`}
              >
                <div className="seat-label">
                  {player.name}
                  {player.isBot && <span className="bot-badge">Bot</span>}
                </div>
                {isOut && !isLoser && <span className="out-badge">Out!</span>}
                {isLoser && <span className="loser-badge">Skitgubbe!</span>}
                {!isOut && !isMe && (
                  <div className="card-count">{cardCount} cards</div>
                )}
              </div>
            );
          })}

          {/* Center area - inside grid */}
          <div className="center-area">
          {isPhase1 && displayedTrick && displayedTrick.cards.length > 0 && (
            <div className="current-trick">
              <h4>Current Trick</h4>
              <div className="trick-cards">
                {displayedTrick.cards.map(({ card, playedBy }) => (
                  <div key={`${playedBy}-${card.suit}-${card.rank}`} className={`trick-card from-${playedBy}`}>
                    <div className={`card-display suit-${card.suit}`}>
                      <span className="card-rank">{card.rank}</span>
                      <span className="card-suit">{SUIT_SYMBOLS[card.suit]}</span>
                    </div>
                    <span className="card-player">{getPlayerName(playedBy)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isPhase2 && skitgubbeState.pile && (
            <div className="pile-display">
              <h4>Pile ({skitgubbeState.pile.cards?.length || 0} cards)</h4>
              {(skitgubbeState.pile.cards?.length || 0) > 0 && (
                <div className="pile-top">
                  {skitgubbeState.pile.cards.slice(-3).map((card, i) => (
                    <div key={i} className={`pile-card card-display suit-${card.suit}`} style={{ transform: `rotate(${(i - 1) * 5}deg)` }}>
                      <span className="card-rank">{card.rank}</span>
                      <span className="card-suit">{SUIT_SYMBOLS[card.suit]}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          </div>
        </div>

        {/* Game over message */}
        {isComplete && skitgubbeState.loser && (
          <div className="game-over">
            <h2>Game Over!</h2>
            <p>{getPlayerName(skitgubbeState.loser)} is the Skitgubbe!</p>
            <button className="btn-primary" onClick={handleQuit}>
              Return to Lobby
            </button>
          </div>
        )}
      </div>

      {/* Player hand */}
      {!amIOut && !isComplete && (
        <div className="hand-area">
          <div className="play-actions-container">
            {isMyTurn ? (
              <div className="play-actions">
                {selectedCard ? (
                  <button className="btn-primary play-btn" onClick={handlePlayCard}>
                    Play Card
                  </button>
                ) : (
                  <span className="select-hint">Select a card to play</span>
                )}
                {isPhase2 && (
                  <button className="btn-secondary pickup-btn" onClick={handlePickup}>
                    Pick Up Pile
                  </button>
                )}
              </div>
            ) : (
              <div className="waiting-message">
                Waiting for {getPlayerName(waitingFor || 'north')}...
              </div>
            )}
          </div>

          <Hand
            cards={skitgubbeState.myHand}
            legalMoves={isMyTurn ? skitgubbeState.myHand.map(c => ({ card: c, canPlayFaceDown: false, canPlayFaceUp: true })) : []}
            selectedCard={selectedCard}
            onCardSelect={handleCardSelect}
            isMyTurn={isMyTurn}
          />
        </div>
      )}

      {/* Player is out message */}
      {amIOut && !isComplete && (
        <div className="hand-area out-message">
          <p>You're out! Watch the others finish.</p>
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
            <h2>How to Play Skitgubbe</h2>

            <div className="rules-content">
              <div className="rule-section">
                <h4>Objective</h4>
                <p>Don't be the last player with cards - they become the "Skitgubbe" (dirty old man)!</p>
              </div>

              <div className="rule-section">
                <h4>Phase 1: Trick-Taking</h4>
                <ul>
                  <li>Players take turns playing cards</li>
                  <li>Highest card wins the trick</li>
                  <li>Equal cards = stunsa (both stay, play again)</li>
                  <li>Winner takes the trick and draws from stock</li>
                  <li>Continues until stock is empty</li>
                </ul>
              </div>

              <div className="rule-section">
                <h4>Phase 2: Shedding</h4>
                <ul>
                  <li>Play cards to the pile or pick it up</li>
                  <li>Match or beat the top card's rank</li>
                  <li>Same rank = next player skipped</li>
                  <li>First to empty hand wins (is out)</li>
                  <li>Last player with cards loses!</li>
                </ul>
              </div>
            </div>

            <div className="version-info">Version {APP_VERSION}</div>

            <button className="btn-primary" onClick={() => setShowRules(false)}>
              Back to Game
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
