import type { Card, PlayerPosition, Suit } from '@fkthepope/shared';
import type { SkitgubbeState, SkitgubbeAction } from './state.js';
import { getRankValue } from './legal-moves.js';

/**
 * Get next player in turn order (skipping players who are out)
 */
function getNextPlayer(
  currentPlayer: PlayerPosition,
  playerOrder: PlayerPosition[],
  players: SkitgubbeState['players']
): PlayerPosition | null {
  const currentIndex = playerOrder.indexOf(currentPlayer);
  if (currentIndex === -1) return null;

  for (let i = 1; i <= playerOrder.length; i++) {
    const nextIndex = (currentIndex + i) % playerOrder.length;
    const nextPosition = playerOrder[nextIndex]!;
    const nextPlayer = players[nextPosition];
    if (nextPlayer && !nextPlayer.isOut) {
      return nextPosition;
    }
  }

  return null;
}

/**
 * Compare two cards in a duel (Phase 1)
 * Returns: positive if card1 wins, negative if card2 wins, 0 if tie
 */
function compareDuelCards(card1: Card, card2: Card): number {
  return getRankValue(card1) - getRankValue(card2);
}

/**
 * Compare a card to the pile top in shedding phase
 * Must follow suit - no trump in Skitgubbe
 */
function canBeatInShedding(
  card: Card,
  pileTopCard: Card,
  leadSuit: Suit
): boolean {
  // Must follow suit to beat
  if (card.suit !== pileTopCard.suit) {
    return false;
  }

  // Same suit: higher rank wins
  return getRankValue(card) > getRankValue(pileTopCard);
}

/**
 * Remove a card from a card array
 */
function removeCard(cards: Card[], cardToRemove: Card): Card[] {
  const index = cards.findIndex(
    c => c.suit === cardToRemove.suit && c.rank === cardToRemove.rank
  );
  if (index === -1) return cards;
  return [...cards.slice(0, index), ...cards.slice(index + 1)];
}

/**
 * Check if player has any cards
 */
function playerHasCards(player: SkitgubbeState['players'][PlayerPosition]): boolean {
  if (!player) return false;
  return player.hand.length > 0 || player.collectedCards.length > 0;
}

/**
 * Count active players (not out)
 */
function countActivePlayers(
  playerOrder: PlayerPosition[],
  players: SkitgubbeState['players']
): number {
  return playerOrder.filter(pos => {
    const player = players[pos];
    return player && !player.isOut;
  }).length;
}

/**
 * Skitgubbe reducer
 */
export function skitgubbeReducer(
  state: SkitgubbeState,
  action: SkitgubbeAction
): SkitgubbeState {
  switch (action.type) {
    case 'ADD_PLAYER': {
      const { player } = action;
      return {
        ...state,
        players: {
          ...state.players,
          [player.position]: {
            id: player.id,
            name: player.name,
            position: player.position,
            isBot: player.isBot,
            hand: [],
            collectedCards: [],
            isOut: false,
          },
        },
      };
    }

    case 'START_GAME': {
      const { deal, drawPile } = action;
      const newPlayers = { ...state.players };

      // Assign hands to players
      for (const pos of state.playerOrder) {
        const player = newPlayers[pos];
        const hand = deal[pos];
        if (player && hand) {
          newPlayers[pos] = {
            ...player,
            hand,
            collectedCards: [],
          };
        }
      }

      // First player leads the first duel
      const firstPlayer = state.playerOrder[0]!;

      return {
        ...state,
        phase: 'collection',
        players: newPlayers,
        drawPile,
        currentPlayer: firstPlayer,
        currentDuel: null,
        tiePile: [],
      };
    }

    // Phase 1: Play a card to start or respond to a duel
    case 'PLAY_DUEL_CARD': {
      const { position, card } = action;
      const player = state.players[position];
      if (!player || state.phase !== 'collection') return state;

      // Remove card from hand
      const newHand = removeCard(player.hand, card);
      const newPlayers = {
        ...state.players,
        [position]: { ...player, hand: newHand },
      };

      // Starting a new duel?
      if (!state.currentDuel) {
        const responder = getNextPlayer(position, state.playerOrder, newPlayers);
        return {
          ...state,
          players: newPlayers,
          currentDuel: {
            leader: position,
            leaderCard: card,
            responder,
            responderCard: null,
          },
          currentPlayer: responder,
        };
      }

      // Responding to a duel
      return {
        ...state,
        players: newPlayers,
        currentDuel: {
          ...state.currentDuel,
          responderCard: card,
        },
        // currentPlayer stays the same until RESOLVE_DUEL
      };
    }

    // Phase 1: Draw a card instead of playing
    case 'DRAW_CARD': {
      const { position } = action;
      const player = state.players[position];
      if (!player || state.phase !== 'collection') return state;
      if (state.drawPile.length === 0) return state;

      // Draw top card
      const drawnCard = state.drawPile[0]!;
      const newDrawPile = state.drawPile.slice(1);
      const newHand = [...player.hand, drawnCard];

      const newPlayers = {
        ...state.players,
        [position]: { ...player, hand: newHand },
      };

      // If we're in a duel and the responder draws, they forfeit
      if (state.currentDuel && state.currentDuel.responder === position) {
        // Leader wins by forfeit
        const leader = state.players[state.currentDuel.leader];
        if (leader && state.currentDuel.leaderCard) {
          const winnings = [state.currentDuel.leaderCard, ...state.tiePile];
          const newLeader = {
            ...leader,
            collectedCards: [...leader.collectedCards, ...winnings],
          };

          // Draw to maintain 3 cards for leader (before checking phase transition)
          let leaderHand = newLeader.hand;
          let drawPileForRefill = newDrawPile;
          while (leaderHand.length < 3 && drawPileForRefill.length > 0) {
            const refillCard = drawPileForRefill[0]!;
            drawPileForRefill = drawPileForRefill.slice(1);
            leaderHand = [...leaderHand, refillCard];
          }

          return {
            ...state,
            players: {
              ...newPlayers,
              [state.currentDuel.leader]: { ...newLeader, hand: leaderHand },
            },
            drawPile: drawPileForRefill,
            currentDuel: null,
            tiePile: [],
            currentPlayer: state.currentDuel.leader,
          };
        }
      }

      // If leading player draws instead, move to next player
      if (!state.currentDuel) {
        const nextPlayer = getNextPlayer(position, state.playerOrder, newPlayers);
        return {
          ...state,
          players: newPlayers,
          drawPile: newDrawPile,
          currentPlayer: nextPlayer,
        };
      }

      return {
        ...state,
        players: newPlayers,
        drawPile: newDrawPile,
      };
    }

    // Phase 1: Resolve the completed duel
    case 'RESOLVE_DUEL': {
      if (!state.currentDuel || state.phase !== 'collection') return state;
      const { leaderCard, responderCard, leader, responder } = state.currentDuel;
      if (!leaderCard || !responderCard || !responder) return state;

      const comparison = compareDuelCards(leaderCard, responderCard);
      const duelCards = [leaderCard, responderCard, ...state.tiePile];

      let newPlayers = { ...state.players };
      let newTiePile: Card[] = [];
      let newDrawPile = state.drawPile;
      let nextPlayer: PlayerPosition | null;

      if (comparison === 0) {
        // Tie ("stunsa") - cards go to tie pile, same players duel again
        newTiePile = duelCards;
        nextPlayer = leader;  // Leader plays again
      } else {
        // Someone wins
        const winner = comparison > 0 ? leader : responder;
        const winnerPlayer = newPlayers[winner];

        if (winnerPlayer) {
          newPlayers = {
            ...newPlayers,
            [winner]: {
              ...winnerPlayer,
              collectedCards: [...winnerPlayer.collectedCards, ...duelCards],
            },
          };
        }

        // Winner draws to maintain 3 cards
        const winnerForDraw = newPlayers[winner];
        if (winnerForDraw) {
          let hand = winnerForDraw.hand;
          while (hand.length < 3 && newDrawPile.length > 0) {
            const drawnCard = newDrawPile[0]!;
            newDrawPile = newDrawPile.slice(1);
            hand = [...hand, drawnCard];
          }
          newPlayers = {
            ...newPlayers,
            [winner]: { ...winnerForDraw, hand },
          };
        }

        // Loser also draws to maintain 3 cards
        const loser = comparison > 0 ? responder : leader;
        const loserForDraw = newPlayers[loser];
        if (loserForDraw) {
          let hand = loserForDraw.hand;
          while (hand.length < 3 && newDrawPile.length > 0) {
            const drawnCard = newDrawPile[0]!;
            newDrawPile = newDrawPile.slice(1);
            hand = [...hand, drawnCard];
          }
          newPlayers = {
            ...newPlayers,
            [loser]: { ...loserForDraw, hand },
          };
        }

        // Winner leads next duel
        nextPlayer = winner;
      }

      return {
        ...state,
        players: newPlayers,
        drawPile: newDrawPile,
        currentDuel: null,
        tiePile: newTiePile,
        currentPlayer: nextPlayer,
      };
    }

    // Transition to shedding phase
    case 'START_SHEDDING': {
      if (state.phase !== 'collection') return state;

      // Combine hand and collected cards for each player
      const newPlayers = { ...state.players };
      for (const pos of state.playerOrder) {
        const player = newPlayers[pos];
        if (player) {
          newPlayers[pos] = {
            ...player,
            hand: [...player.hand, ...player.collectedCards],
            collectedCards: [],
          };
        }
      }

      // First player leads
      const firstPlayer = state.playerOrder[0]!;

      return {
        ...state,
        phase: 'shedding',
        players: newPlayers,
        currentPlayer: firstPlayer,
        currentTrick: null,
        pile: [],
      };
    }

    // Phase 2: Play a card to the trick
    case 'PLAY_TRICK_CARD': {
      const { position, card } = action;
      const player = state.players[position];
      if (!player || state.phase !== 'shedding') return state;

      // Remove card from hand
      const newHand = removeCard(player.hand, card);
      const newPlayers = {
        ...state.players,
        [position]: { ...player, hand: newHand },
      };

      // Add to current trick
      const activeCount = countActivePlayers(state.playerOrder, newPlayers);

      if (!state.currentTrick) {
        // Starting a new trick
        return {
          ...state,
          players: newPlayers,
          currentTrick: {
            cards: [{ card, playedBy: position }],
            leadSuit: card.suit,
            leader: position,
          },
          currentPlayer: getNextPlayer(position, state.playerOrder, newPlayers),
        };
      }

      // Adding to existing trick
      const newCards = [...state.currentTrick.cards, { card, playedBy: position }];
      const nextPlayer = getNextPlayer(position, state.playerOrder, newPlayers);

      return {
        ...state,
        players: newPlayers,
        currentTrick: {
          ...state.currentTrick,
          cards: newCards,
        },
        currentPlayer: nextPlayer,
      };
    }

    // Phase 2: Resolve the completed trick
    case 'RESOLVE_TRICK': {
      if (!state.currentTrick || state.phase !== 'shedding') return state;

      const { cards, leadSuit } = state.currentTrick;

      // Find trick winner
      let winner: PlayerPosition = cards[0]!.playedBy;
      let winningCard = cards[0]!.card;

      for (let i = 1; i < cards.length; i++) {
        const { card, playedBy } = cards[i]!;
        const currentWins = canBeatInShedding(card, winningCard, leadSuit);
        if (currentWins) {
          winner = playedBy;
          winningCard = card;
        }
      }

      // Trick cards go to the pile
      const trickCards = cards.map(c => c.card);
      const newPile = [...state.pile, ...trickCards];

      return {
        ...state,
        currentTrick: null,
        pile: newPile,
        currentPlayer: winner,  // Winner leads next
      };
    }

    // Phase 2: Pick up the pile
    case 'PICK_UP_PILE': {
      const { position } = action;
      const player = state.players[position];
      if (!player || state.phase !== 'shedding') return state;

      // Add pile cards to hand
      const newHand = [...player.hand, ...state.pile];

      // Also add current trick cards if any
      const trickCards = state.currentTrick?.cards.map(c => c.card) ?? [];
      const finalHand = [...newHand, ...trickCards];

      const newPlayers = {
        ...state.players,
        [position]: { ...player, hand: finalHand },
      };

      // Next player leads
      const nextPlayer = getNextPlayer(position, state.playerOrder, newPlayers);

      return {
        ...state,
        players: newPlayers,
        pile: [],
        currentTrick: null,
        currentPlayer: nextPlayer,
      };
    }

    // Player finishes (out of cards)
    case 'PLAYER_OUT': {
      const { position } = action;
      const player = state.players[position];
      if (!player) return state;

      const newPlayers = {
        ...state.players,
        [position]: { ...player, isOut: true },
      };

      const newFinishOrder = [...state.finishOrder, position];

      // Check if only one player left
      const activePlayers = state.playerOrder.filter(pos => {
        const p = newPlayers[pos];
        return p && !p.isOut;
      });

      if (activePlayers.length === 1) {
        // Last player is the loser
        return {
          ...state,
          players: newPlayers,
          finishOrder: newFinishOrder,
          phase: 'game_end',
          loser: activePlayers[0]!,
          currentPlayer: null,
        };
      }

      // Find next current player if needed
      const nextPlayer = state.currentPlayer === position
        ? getNextPlayer(position, state.playerOrder, newPlayers)
        : state.currentPlayer;

      return {
        ...state,
        players: newPlayers,
        finishOrder: newFinishOrder,
        currentPlayer: nextPlayer,
      };
    }

    case 'GAME_END': {
      return {
        ...state,
        phase: 'game_end',
        loser: action.loser,
        currentPlayer: null,
      };
    }

    default:
      return state;
  }
}
