import { useEffect, useState, useMemo, useRef } from 'react';
import { useGameStore, useBridgeState } from '../stores/game-store';
import { useGameActions } from '../socket/use-socket';
import { useVideoStore } from '../stores/video-store';
import { GameTable } from '../components/layout/GameTable';
import { Hand } from '../components/cards/Hand';
import { APP_VERSION } from '../socket/socket-client';
import type { Card, PlayerPosition, PlayerView, TrickState, Suit } from '@fkthepope/shared';
import './BridgeGamePage.css';

const STRAINS = ['clubs', 'diamonds', 'hearts', 'spades', 'notrump'] as const;
const STRAIN_SYMBOLS: Record<string, string> = {
  'clubs': '♣',
  'diamonds': '♦',
  'hearts': '♥',
  'spades': '♠',
  'notrump': 'NT',
};
const STRAIN_SHORT: Record<string, string> = {
  'clubs': 'C',
  'diamonds': 'D',
  'hearts': 'H',
  'spades': 'S',
  'notrump': 'NT',
};
const LEVELS = [1, 2, 3, 4, 5, 6, 7] as const;

export function BridgeGamePage() {
  const myPosition = useGameStore((s) => s.myPosition);
  const waitingFor = useGameStore((s) => s.waitingFor);
  const selectedCard = useGameStore((s) => s.selectedCard);
  const setSelectedCard = useGameStore((s) => s.setSelectedCard);

  const bridgeState = useBridgeState();

  const { bridgeBid, bridgePlay, leaveRoom, replaceWithBot, kickPlayer } = useGameActions();

  // UI state
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check for mobile and portrait orientation
  useEffect(() => {
    const checkOrientation = () => {
      const mobile = window.innerWidth <= 1024 && 'ontouchstart' in window;
      const portrait = window.innerHeight > window.innerWidth;
      setIsMobile(mobile);
      setIsPortrait(mobile && portrait);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

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

  // Start video calls when we have local stream
  useEffect(() => {
    if (localStream && myPosition && bridgeState) {
      const positions: PlayerPosition[] = ['north', 'east', 'south', 'west'];
      positions.forEach(pos => {
        if (
          pos !== myPosition &&
          bridgeState.players[pos] &&
          !bridgeState.players[pos]?.isBot &&
          !offeredToRef.current.has(pos)
        ) {
          offeredToRef.current.add(pos);
          sendOffer(pos);
        }
      });
    }
  }, [localStream, myPosition, bridgeState, sendOffer]);

  // Clear offered tracking when local stream stops
  useEffect(() => {
    if (!localStream) {
      offeredToRef.current.clear();
    }
  }, [localStream]);

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

  // Convert bridge players to PlayerView format for GameTable
  const positions: PlayerPosition[] = ['north', 'east', 'south', 'west'];
  const playersForTable: Record<PlayerPosition, PlayerView | null> = {} as Record<PlayerPosition, PlayerView | null>;

  for (const pos of positions) {
    const player = bridgeState.players[pos];
    if (player) {
      playersForTable[pos] = {
        id: pos,
        name: player.name,
        position: pos,
        isBot: player.isBot,
        cardCount: player.cardCount,
        tricksWon: player.tricksWon,
        isCurrentTurn: waitingFor === pos,
        isConnected: true,
      };
    } else {
      playersForTable[pos] = null;
    }
  }

  // Convert bridge current trick to TrickState format
  const currentTrick: TrickState | null = bridgeState.currentTrick ? {
    cards: bridgeState.currentTrick.cards.map((c, index) => ({
      card: c.card,
      playedBy: c.playedBy,
      faceDown: false,
      playedAt: index,
    })),
    leadSuit: (bridgeState.currentTrick.leadSuit || bridgeState.currentTrick.cards[0]?.card.suit || null) as Suit | null,
    leader: bridgeState.currentTrick.leader,
    currentPlayer: bridgeState.currentTrick.currentPlayer,
    trickNumber: bridgeState.currentTrick.trickNumber,
    winner: bridgeState.currentTrick.winner,
  } : null;

  // Trump suit from contract
  const trumpSuit = contract?.strain && contract.strain !== 'notrump'
    ? contract.strain as 'hearts' | 'diamonds' | 'clubs' | 'spades'
    : null;

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

  // Compute team tricks from individual player tricksWon
  const nsTricks = (bridgeState.players.north?.tricksWon || 0) + (bridgeState.players.south?.tricksWon || 0);
  const ewTricks = (bridgeState.players.east?.tricksWon || 0) + (bridgeState.players.west?.tricksWon || 0);

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
    <div className={`bridge-game-page ${isMobile ? 'is-mobile' : ''}`}>
      {/* Portrait mode overlay */}
      {isPortrait && (
        <div className="rotate-device-overlay">
          <div className="rotate-device-content">
            <div className="rotate-icon">📱</div>
            <h2>Rotate Your Device</h2>
            <p>Please rotate your phone to landscape mode for the best experience</p>
            <div className="rotate-animation">↻</div>
          </div>
        </div>
      )}

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
            <div className="contract-badge">
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
          {/* Mobile menu button */}
          <button
            className="mobile-menu-btn"
            onClick={() => setShowMobileMenu(true)}
            title="Menu"
            aria-label="Open menu"
          >
            ☰
          </button>

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

      {/* Main table area - using GameTable like Whist */}
      <div className="table-area">
        <GameTable
          players={playersForTable}
          currentTrick={isPlayingPhase ? currentTrick : null}
          myPosition={myPosition}
          trumpSuit={trumpSuit}
          waitingFor={waitingFor}
          videoStreams={videoStreams}
          playerMuteStatus={playerMuteStatus}
          isLocalMuted={!isAudioEnabled}
          onReplaceWithBot={replaceWithBot}
          onKickPlayer={kickPlayer}
        />

        {/* Score overlay */}
        {isPlayingPhase && (
          <div className="score-overlay">
            <div className={`score-team ${myPartnership === 'ns' ? 'my-team' : ''}`}>
              <span className="team-label">N/S</span>
              <span className="team-tricks">{nsTricks}</span>
            </div>
            <div className={`score-team ${myPartnership === 'ew' ? 'my-team' : ''}`}>
              <span className="team-label">E/W</span>
              <span className="team-tricks">{ewTricks}</span>
            </div>
          </div>
        )}

        {/* Bidding panel overlay */}
        {isBiddingPhase && (
          <div className="bidding-overlay">
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
                            (level === lastContractBid.bid.level && STRAINS.indexOf(strain) > STRAINS.indexOf((lastContractBid.bid.strain || 'clubs') as typeof strain));
                          return (
                            <button
                              key={strain}
                              className={`bid-btn strain-${strain}`}
                              disabled={!isValid}
                              onClick={() => handleBid('bid', level, strain)}
                            >
                              {level}{STRAIN_SHORT[strain]}
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
          </div>
        )}

        {/* Dummy hand display (for playing phase) */}
        {isPlayingPhase && bridgeState.dummyHand && contract && (
          <div className="dummy-hand-overlay">
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

      {/* Stats Modal */}
      {showStats && (
        <div className="modal-overlay" onClick={() => setShowStats(false)}>
          <div className="modal-content stats-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Game Statistics</h2>
            <div className="stats-table">
              <div className="stats-header">
                <span>Team</span>
                <span>Tricks</span>
              </div>
              <div className={`stats-row ${myPartnership === 'ns' ? 'my-row' : ''}`}>
                <span className="stats-name">North/South</span>
                <span className="stats-score">{nsTricks}</span>
              </div>
              <div className={`stats-row ${myPartnership === 'ew' ? 'my-row' : ''}`}>
                <span className="stats-name">East/West</span>
                <span className="stats-score">{ewTricks}</span>
              </div>
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

      {/* Mobile Menu Overlay */}
      <div className={`mobile-menu-overlay ${showMobileMenu ? 'open' : ''}`}>
        <button
          className="menu-close"
          onClick={() => setShowMobileMenu(false)}
          aria-label="Close menu"
        >
          ✕
        </button>
        <button
          className="menu-item stats-btn"
          onClick={() => {
            setShowMobileMenu(false);
            setShowStats(true);
          }}
        >
          Stats
        </button>
        <button
          className="menu-item rules-btn"
          onClick={() => {
            setShowMobileMenu(false);
            setShowRules(true);
          }}
        >
          Rules
        </button>
        {!localStream ? (
          <button
            className="menu-item video-start-btn"
            onClick={() => {
              setShowMobileMenu(false);
              startVideo();
            }}
          >
            Start Video
          </button>
        ) : (
          <>
            <button
              className={`menu-item ${!isVideoEnabled ? 'off' : ''}`}
              onClick={() => {
                toggleVideo();
              }}
            >
              {isVideoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
            </button>
            <button
              className={`menu-item ${!isAudioEnabled ? 'off' : ''}`}
              onClick={() => {
                toggleAudio();
              }}
            >
              {isAudioEnabled ? 'Mute' : 'Unmute'}
            </button>
            <button
              className="menu-item stop-btn"
              onClick={() => {
                setShowMobileMenu(false);
                stopVideo();
              }}
            >
              End Video
            </button>
          </>
        )}
        <div className="menu-divider" />
        <button
          className="menu-item quit-menu-btn"
          onClick={() => {
            setShowMobileMenu(false);
            setShowQuitConfirm(true);
          }}
        >
          Quit Game
        </button>
      </div>
    </div>
  );
}
