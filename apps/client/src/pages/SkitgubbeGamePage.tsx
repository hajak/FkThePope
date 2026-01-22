import { useEffect, useState, useRef } from 'react';
import { useGameStore, useSkitgubbeState } from '../stores/game-store';
import { useGameActions } from '../socket/use-socket';
import { useVideoStore } from '../stores/video-store';
import { Hand } from '../components/cards/Hand';
import { APP_VERSION } from '../socket/socket-client';
import type { Card, PlayerPosition } from '@fkthepope/shared';
import './SkitgubbeGamePage.css';

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  spades: '\u2660',
};

const SUIT_COLORS: Record<string, string> = {
  hearts: 'red',
  diamonds: 'red',
  clubs: 'black',
  spades: 'black',
};

// Delay to show cards before pickup animation
const PICKUP_DISPLAY_DELAY_MS = 1500;
// Animation duration for player out
const PLAYER_OUT_ANIMATION_MS = 2000;

export function SkitgubbeGamePage() {
  const myPosition = useGameStore((s) => s.myPosition);
  const waitingFor = useGameStore((s) => s.waitingFor);
  const selectedCard = useGameStore((s) => s.selectedCard);
  const setSelectedCard = useGameStore((s) => s.setSelectedCard);

  const skitgubbeState = useSkitgubbeState();

  const { skitgubbeDuel, skitgubbeDraw, skitgubbePlay, skitgubbePickup, leaveRoom } = useGameActions();

  // UI state
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showGameOverModal, setShowGameOverModal] = useState(false);

  // Pickup animation state - preserve pile/trick to show briefly before clearing
  const [pickupDisplay, setPickupDisplay] = useState<{
    pile: Card[];
    trick: Array<{ card: Card; playedBy: PlayerPosition }>;
    player: PlayerPosition;
  } | null>(null);
  const [isPickupAnimating, setIsPickupAnimating] = useState(false);

  // Player out animation state
  const [playerOutAnimation, setPlayerOutAnimation] = useState<PlayerPosition | null>(null);

  // Track previous state to detect pickup events
  const prevPileRef = useRef<Card[]>([]);
  const prevTrickRef = useRef<Array<{ card: Card; playedBy: PlayerPosition }>>([]);

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

  // Delay showing game over modal
  const GAME_END_DISPLAY_DELAY = 2500;
  useEffect(() => {
    if (skitgubbeState?.phase === 'game_end' && skitgubbeState?.loser) {
      const timer = setTimeout(() => {
        setShowGameOverModal(true);
      }, GAME_END_DISPLAY_DELAY);
      return () => clearTimeout(timer);
    } else {
      setShowGameOverModal(false);
    }
  }, [skitgubbeState?.phase, skitgubbeState?.loser]);

  // Detect pickup events - when pile suddenly clears while someone's hand grows
  useEffect(() => {
    if (!skitgubbeState) return;

    const currentPile = skitgubbeState.pile ?? [];
    const currentTrick = skitgubbeState.currentTrick?.cards ?? [];
    const prevPile = prevPileRef.current;
    const prevTrick = prevTrickRef.current;

    // Detect if a pickup just happened: pile was non-empty and now is empty
    const pileWasCleared = prevPile.length > 0 && currentPile.length === 0;
    const trickWasCleared = prevTrick.length > 0 && currentTrick.length === 0;

    if ((pileWasCleared || trickWasCleared) && skitgubbeState.phase === 'shedding') {
      // Someone picked up - show animation
      const currentPlayer = skitgubbeState.currentPlayer;
      if (currentPlayer) {
        setPickupDisplay({
          pile: prevPile,
          trick: prevTrick,
          player: currentPlayer,
        });
        setIsPickupAnimating(true);

        // Clear after delay
        setTimeout(() => {
          setPickupDisplay(null);
          setIsPickupAnimating(false);
        }, PICKUP_DISPLAY_DELAY_MS);
      }
    }

    // Update refs
    prevPileRef.current = currentPile;
    prevTrickRef.current = currentTrick;
  }, [skitgubbeState?.pile, skitgubbeState?.currentTrick?.cards, skitgubbeState?.phase]);

  // Detect player out events - when finishOrder grows
  const prevFinishOrderRef = useRef<PlayerPosition[]>([]);
  useEffect(() => {
    if (!skitgubbeState) return;

    const currentFinishOrder = skitgubbeState.finishOrder ?? [];
    const prevFinishOrder = prevFinishOrderRef.current;

    if (currentFinishOrder.length > prevFinishOrder.length) {
      // New player is out
      const newOutPlayer = currentFinishOrder[currentFinishOrder.length - 1];
      if (newOutPlayer) {
        setPlayerOutAnimation(newOutPlayer);
        setTimeout(() => {
          setPlayerOutAnimation(null);
        }, PLAYER_OUT_ANIMATION_MS);
      }
    }

    prevFinishOrderRef.current = currentFinishOrder;
  }, [skitgubbeState?.finishOrder]);

  if (!skitgubbeState || !myPosition) {
    return <div className="skitgubbe-game-page">Loading...</div>;
  }

  const isMyTurn = waitingFor === myPosition;
  const isCollection = skitgubbeState.phase === 'collection';
  const isShedding = skitgubbeState.phase === 'shedding';
  const isComplete = skitgubbeState.phase === 'game_end';
  const amIOut = skitgubbeState.finishOrder.includes(myPosition);

  const handleCardSelect = (card: Card | null) => {
    setSelectedCard(card);
  };

  const handlePlayCard = () => {
    if (!selectedCard) return;

    if (isCollection) {
      skitgubbeDuel(selectedCard);
    } else if (isShedding) {
      skitgubbePlay(selectedCard);
    }
    setSelectedCard(null);
  };

  const handleDraw = () => {
    skitgubbeDraw();
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

  const renderCardDisplay = (card: Card | null, className?: string) => {
    if (!card) return null;
    const color = SUIT_COLORS[card.suit] || 'black';
    return (
      <div className={`card-display suit-${card.suit} ${className || ''}`} style={{ color }}>
        <span className="card-rank">{card.rank}</span>
        <span className="card-suit">{SUIT_SYMBOLS[card.suit]}</span>
      </div>
    );
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
            {isCollection && 'Phase 1: Collection'}
            {isShedding && 'Phase 2: Shedding'}
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
        {/* Game info panel */}
        <div className="game-info-panel">
          {isCollection && (
            <div className="draw-pile-info">
              <div className="draw-pile-card">{skitgubbeState.drawPileCount}</div>
              <span>Draw Pile</span>
            </div>
          )}
          {isCollection && skitgubbeState.tiePileCount > 0 && (
            <div className="tie-pile-info">
              <span>Tie Pile: {skitgubbeState.tiePileCount} cards</span>
            </div>
          )}
        </div>

        {/* Player positions with center area */}
        <div className="skitgubbe-seats">
          {(['north', 'east', 'south', 'west'] as PlayerPosition[]).map((pos) => {
            const player = skitgubbeState.players[pos];
            if (!player) return null;

            const isCurrentTurn = waitingFor === pos;
            const isMe = pos === myPosition;
            const isOut = player.isOut || skitgubbeState.finishOrder.includes(pos);
            const isLoser = skitgubbeState.loser === pos;
            const totalCards = player.handCount + player.collectedCount;

            return (
              <div
                key={pos}
                className={`skitgubbe-seat seat-${pos} ${isCurrentTurn ? 'current-turn' : ''} ${isMe ? 'my-seat' : ''} ${isOut ? 'out' : ''} ${isLoser ? 'loser' : ''} ${playerOutAnimation === pos ? 'just-out' : ''}`}
              >
                <div className="seat-label">
                  {player.name}
                  {player.isBot && <span className="bot-badge">Bot</span>}
                </div>
                {isOut && !isLoser && <span className="out-badge">Out!</span>}
                {isLoser && <span className="loser-badge">Skitgubbe!</span>}
                {!isOut && !isMe && (
                  <div className="card-count">
                    {isCollection ? (
                      <span>{player.handCount} in hand, {player.collectedCount} collected</span>
                    ) : (
                      <span>{totalCards} cards</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Center area - Duel or Trick display */}
          <div className="center-area">
            {isCollection && skitgubbeState.currentDuel && (
              <div className="duel-display">
                <h4>Duel</h4>
                <div className="duel-cards">
                  <div className="duel-card leader">
                    {skitgubbeState.currentDuel.leaderCard ? (
                      renderCardDisplay(skitgubbeState.currentDuel.leaderCard)
                    ) : (
                      <div className="card-placeholder">?</div>
                    )}
                    <span className="player-label">{getPlayerName(skitgubbeState.currentDuel.leader)}</span>
                  </div>
                  <span className="vs">vs</span>
                  <div className="duel-card responder">
                    {skitgubbeState.currentDuel.responderCard ? (
                      renderCardDisplay(skitgubbeState.currentDuel.responderCard)
                    ) : (
                      <div className="card-placeholder">?</div>
                    )}
                    {skitgubbeState.currentDuel.responder && (
                      <span className="player-label">{getPlayerName(skitgubbeState.currentDuel.responder)}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {isShedding && (
              <div className="trick-display">
                {/* Show pickup animation OR current trick */}
                {isPickupAnimating && pickupDisplay ? (
                  <div className={`pickup-animation ${isPickupAnimating ? 'animating' : ''}`}>
                    <div className="pickup-header">
                      <span className="pickup-label">{getPlayerName(pickupDisplay.player)} picks up!</span>
                    </div>
                    <div className="pickup-cards">
                      {/* Show trick cards that were picked up */}
                      {pickupDisplay.trick.map((tc, i) => (
                        <div key={`trick-${i}`} className="pickup-card">
                          {renderCardDisplay(tc.card)}
                        </div>
                      ))}
                      {/* Show pile cards that were picked up */}
                      {pickupDisplay.pile.slice(-6).map((card, i) => (
                        <div key={`pile-${i}`} className="pickup-card">
                          {renderCardDisplay(card)}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {skitgubbeState.currentTrick && skitgubbeState.currentTrick.cards.length > 0 && (
                      <div className="current-trick">
                        <h4>Current Trick</h4>
                        <div className="trick-cards">
                          {skitgubbeState.currentTrick.cards.map((tc, i) => (
                            <div key={i} className="trick-card">
                              {renderCardDisplay(tc.card)}
                              <span className="player-label">{getPlayerName(tc.playedBy)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {skitgubbeState.pile.length > 0 && (
                      <div className="pile-display">
                        <h4>Pile ({skitgubbeState.pile.length} cards)</h4>
                        <div className="pile-top">
                          {skitgubbeState.pile.slice(-3).map((card, i) => (
                            <div
                              key={i}
                              className={`pile-card card-display suit-${card.suit}`}
                              style={{ transform: `rotate(${(i - 1) * 5}deg)`, color: SUIT_COLORS[card.suit] }}
                            >
                              <span className="card-rank">{card.rank}</span>
                              <span className="card-suit">{SUIT_SYMBOLS[card.suit]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Game over message */}
        {showGameOverModal && skitgubbeState.loser && (
          <div className="game-over">
            <h2>Game Over!</h2>
            <p>{getPlayerName(skitgubbeState.loser)} is the Skitgubbe!</p>
            <button className="btn-primary" onClick={handleQuit}>
              Return to Lobby
            </button>
          </div>
        )}
      </div>

      {/* Player hand and actions */}
      {!amIOut && !isComplete && (
        <div className="hand-area">
          <div className="play-actions-container">
            {isMyTurn ? (
              <div className="play-actions">
                {isCollection && (
                  <>
                    {selectedCard ? (
                      <button className="btn-primary play-btn" onClick={handlePlayCard}>
                        Play Card
                      </button>
                    ) : (
                      <span className="select-hint">Select a card to play</span>
                    )}
                    {skitgubbeState.drawPileCount > 0 && (
                      <button className="btn-secondary draw-btn" onClick={handleDraw}>
                        Draw Card
                      </button>
                    )}
                  </>
                )}
                {isShedding && (
                  <>
                    {selectedCard ? (
                      <button className="btn-primary play-btn" onClick={handlePlayCard}>
                        Play Card
                      </button>
                    ) : (
                      <span className="select-hint">Select a card to play</span>
                    )}
                    {(skitgubbeState.pile.length > 0 || (skitgubbeState.currentTrick && skitgubbeState.currentTrick.cards.length > 0)) && (
                      <button className="btn-secondary pickup-btn" onClick={handlePickup}>
                        Pick Up Pile
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="waiting-message">
                Waiting for {getPlayerName(waitingFor || 'north')}...
              </div>
            )}
          </div>

          {/* My cards */}
          {isCollection && (
            <div className="my-cards-section">
              <div className="hand-label">Your Hand ({skitgubbeState.myHand.length})</div>
              <Hand
                cards={skitgubbeState.myHand}
                legalMoves={isMyTurn ? skitgubbeState.myHand.map(c => ({ card: c, canPlayFaceDown: false, canPlayFaceUp: true })) : []}
                selectedCard={selectedCard}
                onCardSelect={handleCardSelect}
                isMyTurn={isMyTurn}
              />
              {skitgubbeState.myCollectedCards.length > 0 && (
                <div className="collected-info">
                  Collected: {skitgubbeState.myCollectedCards.length} cards
                </div>
              )}
            </div>
          )}
          {isShedding && (
            <div className="my-cards-section">
              <Hand
                cards={skitgubbeState.myHand}
                legalMoves={isMyTurn ? skitgubbeState.myHand.map(c => ({ card: c, canPlayFaceDown: false, canPlayFaceUp: true })) : []}
                selectedCard={selectedCard}
                onCardSelect={handleCardSelect}
                isMyTurn={isMyTurn}
              />
            </div>
          )}
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
                <h4>Phase 1: Collection</h4>
                <ul>
                  <li>Each player starts with 3 cards</li>
                  <li>Players take turns in 2-card duels</li>
                  <li>Higher card wins (Ace high, 2 low)</li>
                  <li>Equal cards = tie - both cards go to tie pile</li>
                  <li>Winner collects both cards (and any tie pile)</li>
                  <li>Draw to maintain 3 cards in hand</li>
                  <li>You can draw instead of playing a card</li>
                </ul>
              </div>

              <div className="rule-section">
                <h4>Phase 2: Shedding</h4>
                <ul>
                  <li>All collected cards go into your hand</li>
                  <li>Play cards in tricks (one per player)</li>
                  <li>Must follow suit if possible</li>
                  <li>To beat a card, play a higher card of the same suit</li>
                  <li>If you can't beat, pick up the pile</li>
                  <li>Trick winner leads next</li>
                  <li>First to empty hand wins (is out)</li>
                  <li>Last player with cards = Skitgubbe!</li>
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
