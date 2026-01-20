import type { Card, PlayerPosition } from '@fkthepope/shared';
import type { SkitgubbeState, SkitgubbeAction } from './state.js';
import { resolvePhase1Trick } from './legal-moves.js';

/**
 * Get next player in turn order
 */
function getNextPlayer(
  currentPlayer: PlayerPosition,
  playerOrder: PlayerPosition[],
  players: SkitgubbeState['players']
): PlayerPosition | null {
  const currentIndex = playerOrder.indexOf(currentPlayer);
  if (currentIndex === -1) return null;

  // Find next player who is still in the game
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
 * Count active players (not out)
 */
function countActivePlayers(state: SkitgubbeState): number {
  return state.playerOrder.filter(pos => {
    const player = state.players[pos];
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
            isOut: false,
          },
        },
      };
    }

    case 'START_GAME': {
      const { hands, stock, trumpCard } = action;
      const newPlayers = { ...state.players };

      // Assign hands to players
      for (const pos of state.playerOrder) {
        const player = newPlayers[pos];
        if (player && hands[pos]) {
          newPlayers[pos] = {
            ...player,
            hand: hands[pos] ?? [],
          };
        }
      }

      // First player leads
      const firstPlayer = state.playerOrder[0]!;
      const secondPlayer = state.playerOrder[1]!;

      return {
        ...state,
        phase: 'phase1',
        players: newPlayers,
        stock,
        trumpCard,
        trumpSuit: trumpCard.suit,
        currentPlayer: firstPlayer,
        currentTrick: {
          cards: [],
          leadPlayer: firstPlayer,
          followPlayer: secondPlayer,
        },
      };
    }

    case 'PLAY_CARD_PHASE1': {
      const { position, card } = action;
      const player = state.players[position];
      if (!player || !state.currentTrick) return state;

      // Remove card from hand
      const newHand = player.hand.filter(
        c => !(c.suit === card.suit && c.rank === card.rank)
      );

      const newPlayers = {
        ...state.players,
        [position]: { ...player, hand: newHand },
      };

      const newTrickCards = [...state.currentTrick.cards, { card, playedBy: position }];

      // Determine next player
      const isLeadPlay = state.currentTrick.cards.length === 0;
      const nextPlayer = isLeadPlay ? state.currentTrick.followPlayer : null;

      return {
        ...state,
        players: newPlayers,
        currentTrick: {
          ...state.currentTrick,
          cards: newTrickCards,
        },
        currentPlayer: nextPlayer,
      };
    }

    case 'COMPLETE_TRICK': {
      const { winner } = action;
      if (!state.currentTrick) return state;

      // Discard trick cards (and any stunsa cards from previous bounces)
      const trickCards = state.currentTrick.cards.map(pc => pc.card);
      const newDiscard = [...state.discard, ...trickCards, ...state.stunsaCards];

      // Find next player for the new trick
      const nextLeader = winner;
      const nextFollower = getNextPlayer(winner, state.playerOrder, state.players);

      if (!nextFollower) {
        // Only one player left - should not happen in phase 1
        return state;
      }

      return {
        ...state,
        discard: newDiscard,
        stunsaCards: [], // Clear stunsa cards after trick is won
        currentTrick: {
          cards: [],
          leadPlayer: nextLeader,
          followPlayer: nextFollower,
          winner: undefined,
        },
        currentPlayer: nextLeader,
      };
    }

    case 'STUNSA': {
      // Bounce - cards tied, add to stunsa pile, same player leads again
      if (!state.currentTrick) return state;

      // Add trick cards to stunsa pile (they stay on table)
      const trickCards = state.currentTrick.cards.map(pc => pc.card);
      const newStunsaCards = [...state.stunsaCards, ...trickCards];

      // Same leader starts again with a fresh trick
      return {
        ...state,
        stunsaCards: newStunsaCards,
        currentTrick: {
          cards: [],
          leadPlayer: state.currentTrick.leadPlayer,
          followPlayer: state.currentTrick.followPlayer,
          winner: undefined,
        },
        currentPlayer: state.currentTrick.leadPlayer,
      };
    }

    case 'DRAW_CARDS': {
      // After trick, both players draw to 3 cards (winner draws first)
      if (!state.currentTrick || state.stock.length === 0) return state;

      const newStock = [...state.stock];
      const newPlayers = { ...state.players };
      const winner = state.currentTrick.winner;
      const drawOrder = winner
        ? [winner, getNextPlayer(winner, state.playerOrder, state.players)]
        : state.playerOrder.slice(0, 2);

      for (const pos of drawOrder) {
        if (!pos) continue;
        const player = newPlayers[pos];
        if (!player) continue;

        while (player.hand.length < 3 && newStock.length > 0) {
          const card = newStock.pop();
          if (card) {
            newPlayers[pos] = {
              ...player,
              hand: [...player.hand, card],
            };
          }
        }
      }

      // Check if stock is empty - transition to phase 2
      if (newStock.length === 0) {
        return {
          ...state,
          stock: newStock,
          players: newPlayers,
          // Phase transition handled by START_PHASE2
        };
      }

      return {
        ...state,
        stock: newStock,
        players: newPlayers,
      };
    }

    case 'START_PHASE2': {
      // Transition to phase 2 - pile starts empty
      const firstPlayer = state.playerOrder.find(pos => {
        const player = state.players[pos];
        return player && !player.isOut && player.hand.length > 0;
      });

      return {
        ...state,
        phase: 'phase2',
        currentTrick: null,
        pile: {
          cards: [],
          topCard: null,
        },
        currentPlayer: firstPlayer ?? null,
      };
    }

    case 'PLAY_CARD_PHASE2': {
      const { position, card } = action;
      const player = state.players[position];
      if (!player || !state.pile) return state;

      // Remove card from hand
      const newHand = player.hand.filter(
        c => !(c.suit === card.suit && c.rank === card.rank)
      );

      const newPlayers = {
        ...state.players,
        [position]: { ...player, hand: newHand },
      };

      // Add card to pile
      const newPile = {
        cards: [...state.pile.cards, card],
        topCard: card,
      };

      // Find next player
      const nextPlayer = getNextPlayer(position, state.playerOrder, newPlayers);

      return {
        ...state,
        players: newPlayers,
        pile: newPile,
        currentPlayer: nextPlayer,
      };
    }

    case 'PICK_UP_PILE': {
      const { position } = action;
      const player = state.players[position];
      if (!player || !state.pile) return state;

      // Add pile cards to hand
      const newHand = [...player.hand, ...state.pile.cards];

      const newPlayers = {
        ...state.players,
        [position]: { ...player, hand: newHand },
      };

      // Clear pile
      const newPile = {
        cards: [],
        topCard: null,
      };

      // Next player leads
      const nextPlayer = getNextPlayer(position, state.playerOrder, newPlayers);

      return {
        ...state,
        players: newPlayers,
        pile: newPile,
        currentPlayer: nextPlayer,
      };
    }

    case 'PLAYER_OUT': {
      const { position } = action;
      const player = state.players[position];
      if (!player) return state;

      const newPlayers = {
        ...state.players,
        [position]: { ...player, isOut: true },
      };

      // Check if game is over (only 1 player left)
      const activePlayers = state.playerOrder.filter(pos => {
        const p = newPlayers[pos];
        return p && !p.isOut;
      });

      if (activePlayers.length === 1) {
        // Last remaining player is the loser (Skitgubbe)
        return {
          ...state,
          players: newPlayers,
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
