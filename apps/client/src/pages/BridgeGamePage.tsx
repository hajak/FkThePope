import { useEffect, useState } from 'react';
import { useGameStore, useBridgeState } from '../stores/game-store';
import { useGameActions } from '../socket/use-socket';
import { useVideoStore } from '../stores/video-store';
import { Hand } from '../components/cards/Hand';
import { APP_VERSION } from '../socket/socket-client';
import type { Card, PlayerPosition } from '@fkthepope/shared';
import './BridgeGamePage.css';

const STRAINS = ['C', 'D', 'H', 'S', 'NT'] as const;
const STRAIN_SYMBOLS: Record<string, string> = {
  'C': '♣',
  'D': '♦',
  'H': '♥',
  'S': '♠',
  'NT': 'NT',
};
const LEVELS = [1, 2, 3, 4, 5, 6, 7] as const;

export function BridgeGamePage() {
  const myPosition = useGameStore((s) => s.myPosition);
  const waitingFor = useGameStore((s) => s.waitingFor);
  const selectedCard = useGameStore((s) => s.selectedCard);
  const setSelectedCard = useGameStore((s) => s.setSelectedCard);

  const bridgeState = useBridgeState();

  const { bridgeBid, bridgePlay, leaveRoom } = useGameActions();

  // UI state
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [showRules, setShowRules] = useState(false);

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

  if (!bridgeState || !myPosition) {
    return <div className="bridge-game-page">Loading...</div>;
  }

  const isMyTurn = waitingFor === myPosition;
  const isBiddingPhase = bridgeState.phase === 'bidding';
  const isPlayingPhase = bridgeState.phase === 'playing';
  const contract = bridgeState.contract;
  const isDeclarer = contract?.declarer === myPosition;
  const isDummy = contract?.dummy === myPosition;
  const canControlDummy = isDeclarer && isPlayingPhase;

  const handleCardSelect = (card: Card | null) => {
    setSelectedCard(card);
  };

  const handlePlayCard = (fromDummy?: boolean) => {
    if (selectedCard) {
      bridgePlay(selectedCard, fromDummy);
      setSelectedCard(null);
    }
  };

  const handleBid = (bidType: 'bid' | 'pass' | 'double' | 'redouble', level?: number, strain?: string) => {
    bridgeBid(bidType, level, strain);
  };

  const handleQuit = () => {
    setShowQuitConfirm(false);
    leaveRoom();
  };

  const getPlayerName = (position: PlayerPosition): string => {
    return bridgeState.players[position]?.name || position;
  };

  const getPartnership = (position: PlayerPosition): 'ns' | 'ew' => {
    return position === 'north' || position === 'south' ? 'ns' : 'ew';
  };

  const myPartnership = getPartnership(myPosition);

  // Get last bid for double/redouble validation
  const lastContractBid = [...bridgeState.biddingHistory].reverse().find(b => b.bid.type === 'bid');
  const lastBid = bridgeState.biddingHistory[bridgeState.biddingHistory.length - 1];
  const canDouble = lastContractBid && getPartnership(lastContractBid.player) !== myPartnership && lastBid?.bid.type !== 'double';
  const canRedouble = lastBid?.bid.type === 'double' && getPartnership(lastBid.player) !== myPartnership;

  // Card display helpers
  const renderHand = (cards: Card[], isClickable: boolean) => (
    <Hand
      cards={cards}
      legalMoves={isClickable ? cards.map(c => ({ card: c, canPlayFaceDown: false, canPlayFaceUp: true })) : []}
      selectedCard={selectedCard}
      onCardSelect={handleCardSelect}
      isMyTurn={isClickable}
    />
  );

  return (
    <div className="bridge-game-page">
      {/* Header */}
      <header className="game-header">
        <div className="game-logo">
          <span className="logo-cards">
            <span className="logo-card red">A</span>
            <span className="logo-card black">A</span>
          </span>
          <h1>Bridge</h1>
        </div>

        <div className="header-center">
          {contract && (
            <div className="contract-display">
              <span className="contract-level">{contract.level}</span>
              <span className={`contract-strain strain-${contract.strain.toLowerCase()}`}>
                {STRAIN_SYMBOLS[contract.strain] || contract.strain}
              </span>
              {contract.doubled && <span className="doubled">X</span>}
              {contract.redoubled && <span className="redoubled">XX</span>}
              <span className="contract-by">by {getPlayerName(contract.declarer)}</span>
            </div>
          )}
          {!contract && isBiddingPhase && (
            <div className="phase-display">Bidding Phase</div>
          )}
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
      <div className="bridge-table">
        {/* Score display */}
        <div className="score-display">
          <div className={`score-team ${myPartnership === 'ns' ? 'my-team' : ''}`}>
            <span className="team-label">N/S</span>
            <span className="team-tricks">{bridgeState.tricksWon.ns} tricks</span>
          </div>
          <div className={`score-team ${myPartnership === 'ew' ? 'my-team' : ''}`}>
            <span className="team-label">E/W</span>
            <span className="team-tricks">{bridgeState.tricksWon.ew} tricks</span>
          </div>
        </div>

        {/* Player positions */}
        <div className="bridge-seats">
          {(['north', 'east', 'south', 'west'] as PlayerPosition[]).map((pos) => {
            const player = bridgeState.players[pos];
            const isCurrentTurn = waitingFor === pos;
            const isMe = pos === myPosition;

            return (
              <div
                key={pos}
                className={`bridge-seat seat-${pos} ${isCurrentTurn ? 'current-turn' : ''} ${isMe ? 'my-seat' : ''}`}
              >
                <div className="seat-label">
                  {player?.name || pos}
                  {contract?.declarer === pos && <span className="role-badge declarer">D</span>}
                  {contract?.dummy === pos && <span className="role-badge dummy">Dummy</span>}
                </div>
                {player?.isBot && <span className="bot-badge">Bot</span>}
              </div>
            );
          })}
        </div>

        {/* Current trick */}
        {bridgeState.currentTrick && (
          <div className="bridge-trick">
            {bridgeState.currentTrick.cards.map(({ card, playedBy }) => (
              <div key={`${playedBy}-${card.suit}-${card.rank}`} className={`trick-card from-${playedBy}`}>
                <div className={`card-mini suit-${card.suit}`}>
                  {card.rank}
                  <span className="card-suit">
                    {card.suit === 'hearts' ? '♥' : card.suit === 'diamonds' ? '♦' : card.suit === 'clubs' ? '♣' : '♠'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bidding panel */}
        {isBiddingPhase && (
          <div className="bidding-panel">
            <h3>Bidding</h3>

            {/* Bidding history */}
            <div className="bidding-history">
              {bridgeState.biddingHistory.map((entry, i) => (
                <div key={i} className={`bid-entry player-${entry.player}`}>
                  <span className="bid-player">{getPlayerName(entry.player)}:</span>
                  {entry.bid.type === 'pass' ? (
                    <span className="bid-pass">Pass</span>
                  ) : entry.bid.type === 'double' ? (
                    <span className="bid-double">X</span>
                  ) : entry.bid.type === 'redouble' ? (
                    <span className="bid-redouble">XX</span>
                  ) : (
                    <span className={`bid-contract strain-${entry.bid.strain?.toLowerCase()}`}>
                      {entry.bid.level}{STRAIN_SYMBOLS[entry.bid.strain || '']}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Bidding controls */}
            {isMyTurn && (
              <div className="bidding-controls">
                <div className="bid-grid">
                  {LEVELS.map((level) => (
                    <div key={level} className="bid-row">
                      {STRAINS.map((strain) => {
                        const isValid = !lastContractBid ||
                          level > (lastContractBid.bid.level || 0) ||
                          (level === lastContractBid.bid.level && STRAINS.indexOf(strain) > STRAINS.indexOf((lastContractBid.bid.strain || 'C') as typeof strain));
                        return (
                          <button
                            key={strain}
                            className={`bid-btn strain-${strain.toLowerCase()}`}
                            disabled={!isValid}
                            onClick={() => handleBid('bid', level, strain)}
                          >
                            {level}{STRAIN_SYMBOLS[strain]}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="bid-actions">
                  <button className="bid-btn pass-btn" onClick={() => handleBid('pass')}>
                    Pass
                  </button>
                  {canDouble && (
                    <button className="bid-btn double-btn" onClick={() => handleBid('double')}>
                      Double
                    </button>
                  )}
                  {canRedouble && (
                    <button className="bid-btn redouble-btn" onClick={() => handleBid('redouble')}>
                      Redouble
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dummy hand display (for playing phase) */}
        {isPlayingPhase && bridgeState.dummyHand && contract && (
          <div className="dummy-hand-display">
            <h4>Dummy ({getPlayerName(contract.dummy)})</h4>
            {canControlDummy && isMyTurn ? (
              <div className="dummy-hand clickable">
                {renderHand(bridgeState.dummyHand, true)}
                {selectedCard && bridgeState.dummyHand.some(c => c.suit === selectedCard.suit && c.rank === selectedCard.rank) && (
                  <button className="play-dummy-btn" onClick={() => handlePlayCard(true)}>
                    Play from Dummy
                  </button>
                )}
              </div>
            ) : (
              <div className="dummy-hand">
                {renderHand(bridgeState.dummyHand, false)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Player hand */}
      {!isDummy && (
        <div className="hand-area">
          <div className="play-actions-container">
            {selectedCard && isMyTurn && isPlayingPhase ? (
              <div className="play-actions">
                <button className="btn-primary play-btn" onClick={() => handlePlayCard(false)}>
                  Play Card
                </button>
              </div>
            ) : isBiddingPhase ? (
              <div className="waiting-message">
                {isMyTurn ? 'Make your bid above' : `Waiting for ${getPlayerName(waitingFor || 'north')} to bid...`}
              </div>
            ) : !isMyTurn ? (
              <div className="waiting-message">
                Waiting for {getPlayerName(waitingFor || 'north')}...
              </div>
            ) : (
              <div className="play-actions-placeholder">
                Select a card to play
              </div>
            )}
          </div>

          {renderHand(bridgeState.myHand, isMyTurn && isPlayingPhase)}
        </div>
      )}

      {/* Dummy is playing - show message */}
      {isDummy && isPlayingPhase && (
        <div className="hand-area dummy-message">
          <p>You are dummy. {getPlayerName(contract?.declarer || 'north')} controls your hand.</p>
          <div className="dummy-hand-view">
            {renderHand(bridgeState.myHand, false)}
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
            <h2>How to Play Bridge</h2>

            <div className="rules-content">
              <div className="rule-section">
                <h4>Partnerships</h4>
                <p>North-South vs East-West. Partners sit across from each other.</p>
              </div>

              <div className="rule-section">
                <h4>Bidding</h4>
                <ul>
                  <li>Bid a number (1-7) + suit (C, D, H, S, NT)</li>
                  <li>Each bid must be higher than the previous</li>
                  <li>Pass, Double, or Redouble are also options</li>
                  <li>Bidding ends after 3 consecutive passes</li>
                </ul>
              </div>

              <div className="rule-section">
                <h4>Playing</h4>
                <ul>
                  <li>Declarer plays both hands (theirs + dummy)</li>
                  <li>Dummy's hand is revealed face up</li>
                  <li>Must follow suit if possible</li>
                  <li>Contract suit is trump (NT = no trump)</li>
                </ul>
              </div>

              <div className="rule-section">
                <h4>Scoring</h4>
                <p>Make your contract (6 + bid level tricks) to score points.</p>
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
