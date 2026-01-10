import { useGameStore, useMyHand, useLegalMoves, useIsMyTurn, useTrumpSuit, useCurrentTrick } from '../stores/game-store';
import { useGameActions } from '../socket/use-socket';
import { GameTable } from '../components/layout/GameTable';
import { Hand } from '../components/cards/Hand';
import { RulesPanel } from '../components/rules/RulesPanel';
import { RuleCreator } from '../components/rules/RuleCreator';
import { useUiStore } from '../stores/ui-store';
import type { Card } from '@fkthepope/shared';
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

  const showRuleCreator = useUiStore((s) => s.showRuleCreator);

  const { playCard } = useGameActions();

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

  // Check if selected card can be played face down
  const canPlayFaceDown = () => {
    if (!selectedCard) return false;
    const move = legalMoves.find(
      (m) => m.card.suit === selectedCard.suit && m.card.rank === selectedCard.rank
    );
    return move?.canPlayFaceDown ?? false;
  };

  return (
    <div className="game-page">
      {/* Game info bar */}
      <div className="game-info-bar">
        <div className="game-info-item">
          <span className="label">Hand</span>
          <span className="value">{gameState.currentHand?.number ?? '-'}</span>
        </div>
        <div className="game-info-item">
          <span className="label">Trick</span>
          <span className="value">{currentTrick?.trickNumber ?? '-'}/13</span>
        </div>
        <div className="game-info-item">
          <span className="label">Phase</span>
          <span className="value">{gameState.phase}</span>
        </div>
      </div>

      {/* Main table area */}
      <div className="table-area">
        <GameTable
          players={gameState.players}
          currentTrick={currentTrick}
          myPosition={myPosition}
          trumpSuit={trumpSuit}
          waitingFor={waitingFor}
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

        {/* Play buttons - always reserve space */}
        <div className="play-actions-container">
          {selectedCard && isMyTurn ? (
            <div className="play-actions">
              <button
                className="btn-primary"
                onClick={() => handlePlayCard(false)}
              >
                Play Card
              </button>
              {canPlayFaceDown() && (
                <button
                  className="btn-secondary"
                  onClick={() => handlePlayCard(true)}
                >
                  Discard (Face Down)
                </button>
              )}
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

      {/* Rules panel */}
      <RulesPanel />

      {/* Rule creator modal */}
      {showRuleCreator && <RuleCreator />}
    </div>
  );
}
