import { useRef, useCallback } from 'react';
import type { Card as CardType, LegalMove } from '@fkthepope/shared';
import { Card } from './Card';
import { sortCards } from '@fkthepope/shared';
import './Hand.css';

interface HandProps {
  cards: CardType[];
  legalMoves: LegalMove[];
  selectedCard: CardType | null;
  onCardSelect: (card: CardType | null) => void;
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
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const isLegalMove = (card: CardType) => {
    return legalMoves.some(
      (m) => m.card.suit === card.suit && m.card.rank === card.rank
    );
  };

  const isSelected = (card: CardType) => {
    return selectedCard?.suit === card.suit && selectedCard?.rank === card.rank;
  };

  // Find next/previous playable card index
  const findPlayableIndex = useCallback((startIndex: number, direction: 1 | -1): number => {
    let index = startIndex + direction;
    while (index >= 0 && index < sortedCards.length) {
      if (isLegalMove(sortedCards[index]!)) {
        return index;
      }
      index += direction;
    }
    return startIndex; // Stay at current if no playable card found
  }, [sortedCards, legalMoves]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, currentIndex: number) => {
    const card = sortedCards[currentIndex];
    if (!card) return;

    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = findPlayableIndex(currentIndex, -1);
        cardRefs.current[prevIndex]?.focus();
        break;
      }
      case 'ArrowRight':
      case 'ArrowDown': {
        e.preventDefault();
        const nextIndex = findPlayableIndex(currentIndex, 1);
        cardRefs.current[nextIndex]?.focus();
        break;
      }
      case 'Home': {
        e.preventDefault();
        // Find first playable card
        const firstPlayable = sortedCards.findIndex(c => isLegalMove(c));
        if (firstPlayable >= 0) {
          cardRefs.current[firstPlayable]?.focus();
        }
        break;
      }
      case 'End': {
        e.preventDefault();
        // Find last playable card
        for (let i = sortedCards.length - 1; i >= 0; i--) {
          if (isLegalMove(sortedCards[i]!)) {
            cardRefs.current[i]?.focus();
            break;
          }
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        // Deselect current card
        if (selectedCard) {
          onCardSelect(null);
        }
        break;
      }
    }
  }, [sortedCards, findPlayableIndex, selectedCard, onCardSelect]);

  return (
    <div
      className="hand"
      role="group"
      aria-label={`Your hand: ${cards.length} cards${isMyTurn ? ', your turn' : ''}`}
    >
      {sortedCards.map((card, index) => {
        const legal = isLegalMove(card);
        const selected = isSelected(card);

        return (
          <div
            key={`${card.rank}_${card.suit}`}
            className="hand-card"
            style={{ '--index': index } as React.CSSProperties}
            ref={(el) => { cardRefs.current[index] = el; }}
          >
            <Card
              card={card}
              selected={selected}
              disabled={!isMyTurn || !legal}
              onClick={() => {
                if (isMyTurn && legal) {
                  onCardSelect(selected ? null : card);
                }
              }}
              onKeyDown={(e) => handleKeyDown(e, index)}
              tabIndex={isMyTurn && legal ? 0 : -1}
            />
          </div>
        );
      })}
    </div>
  );
}
