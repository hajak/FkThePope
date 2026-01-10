import type { Card as CardType, LegalMove } from '@fkthepope/shared';
import { Card } from './Card';
import { sortCards } from '@fkthepope/shared';
import './Hand.css';

interface HandProps {
  cards: CardType[];
  legalMoves: LegalMove[];
  selectedCard: CardType | null;
  onCardSelect: (card: CardType) => void;
  isMyTurn: boolean;
}

export function Hand({
  cards,
  legalMoves,
  selectedCard,
  onCardSelect,
  isMyTurn,
}: HandProps) {
  const sortedCards = sortCards(cards);

  const isLegalMove = (card: CardType) => {
    return legalMoves.some(
      (m) => m.card.suit === card.suit && m.card.rank === card.rank
    );
  };

  const isSelected = (card: CardType) => {
    return selectedCard?.suit === card.suit && selectedCard?.rank === card.rank;
  };

  return (
    <div className="hand">
      {sortedCards.map((card, index) => {
        const legal = isLegalMove(card);
        const selected = isSelected(card);

        return (
          <div
            key={`${card.rank}_${card.suit}`}
            className="hand-card"
            style={{ '--index': index } as React.CSSProperties}
          >
            <Card
              card={card}
              selected={selected}
              disabled={!isMyTurn || !legal}
              onClick={() => {
                if (isMyTurn && legal) {
                  onCardSelect(selected ? null! : card);
                }
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
