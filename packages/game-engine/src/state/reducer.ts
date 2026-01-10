import type { GameState, HandState, TrickState, PlayerPosition, PlayedCard } from '@fkthepope/shared';
import { createPlayer, getNextPlayer, PLAYER_POSITIONS } from '@fkthepope/shared';
import { removeCard } from '@fkthepope/shared';
import type { GameAction } from './actions.js';

/**
 * Pure reducer for game state transitions
 * Returns a new state without mutating the input
 */
export function gameReducer(state: GameState, action: GameAction): GameState {
  const now = Date.now();

  switch (action.type) {
    case 'ADD_PLAYER': {
      if (state.players[action.position] !== null) {
        return state; // Position already taken
      }
      return {
        ...state,
        players: {
          ...state.players,
          [action.position]: createPlayer(
            action.playerId,
            action.name,
            action.position,
            action.isBot ?? false
          ),
        },
        updatedAt: now,
      };
    }

    case 'REMOVE_PLAYER': {
      if (state.phase !== 'waiting') {
        return state; // Can't remove players during game
      }
      return {
        ...state,
        players: {
          ...state.players,
          [action.position]: null,
        },
        updatedAt: now,
      };
    }

    case 'START_HAND': {
      // Deal cards to players
      const players = { ...state.players };
      for (const pos of PLAYER_POSITIONS) {
        const player = players[pos];
        if (player) {
          players[pos] = {
            ...player,
            hand: action.hands[pos],
            tricksWon: 0,
          };
        }
      }

      const currentTrick: TrickState = {
        cards: [],
        leadSuit: null,
        leader: action.firstLeader,
        currentPlayer: action.firstLeader,
        trickNumber: 1,
      };

      const currentHand: HandState = {
        number: state.handHistory.length + 1,
        trumpSuit: action.trumpSuit,
        completedTricks: [],
        currentTrick,
        tricksPlayed: 0,
      };

      return {
        ...state,
        phase: 'playing',
        players,
        currentHand,
        updatedAt: now,
      };
    }

    case 'PLAY_CARD': {
      if (!state.currentHand?.currentTrick) {
        return state;
      }

      const player = state.players[action.position];
      if (!player) return state;

      // Remove card from player's hand
      const newHand = removeCard(player.hand, action.card);

      const playedCard: PlayedCard = {
        card: action.card,
        playedBy: action.position,
        faceDown: action.faceDown,
        playedAt: state.currentHand.currentTrick.cards.length,
      };

      // Update trick
      const newTrickCards = [...state.currentHand.currentTrick.cards, playedCard];
      const leadSuit = state.currentHand.currentTrick.leadSuit ?? action.card.suit;

      // Determine next player
      const nextPlayer = getNextPlayer(action.position);
      const trickComplete = newTrickCards.length === 4;

      const newTrick: TrickState = {
        ...state.currentHand.currentTrick,
        cards: newTrickCards,
        leadSuit,
        currentPlayer: trickComplete ? action.position : nextPlayer, // Keep current if trick complete
      };

      return {
        ...state,
        players: {
          ...state.players,
          [action.position]: {
            ...player,
            hand: newHand,
          },
        },
        currentHand: {
          ...state.currentHand,
          currentTrick: newTrick,
        },
        updatedAt: now,
      };
    }

    case 'COMPLETE_TRICK': {
      if (!state.currentHand?.currentTrick) {
        return state;
      }

      const winner = state.players[action.winner];
      if (!winner) return state;

      // Add winner to completed trick
      const completedTrick: TrickState = {
        ...state.currentHand.currentTrick,
        winner: action.winner,
      };

      // Increment winner's trick count
      const updatedWinner = {
        ...winner,
        tricksWon: winner.tricksWon + 1,
      };

      const tricksPlayed = state.currentHand.tricksPlayed + 1;
      const handComplete = tricksPlayed >= 13;

      // Create next trick if hand not complete
      const nextTrick: TrickState | null = handComplete
        ? null
        : {
            cards: [],
            leadSuit: null,
            leader: action.winner,
            currentPlayer: action.winner,
            trickNumber: tricksPlayed + 1,
          };

      return {
        ...state,
        phase: handComplete ? 'hand_end' : 'playing',
        players: {
          ...state.players,
          [action.winner]: updatedWinner,
        },
        currentHand: {
          ...state.currentHand,
          completedTricks: [...state.currentHand.completedTricks, completedTrick],
          currentTrick: nextTrick,
          tricksPlayed,
        },
        updatedAt: now,
      };
    }

    case 'COMPLETE_HAND': {
      if (!state.currentHand) {
        return state;
      }

      // Update total scores
      const newScores = { ...state.scores };
      for (const pos of PLAYER_POSITIONS) {
        const player = state.players[pos];
        if (player) {
          newScores[pos] += player.tricksWon;
        }
      }

      // Build hand result
      const tricks: Record<PlayerPosition, number> = {
        north: state.players.north?.tricksWon ?? 0,
        east: state.players.east?.tricksWon ?? 0,
        south: state.players.south?.tricksWon ?? 0,
        west: state.players.west?.tricksWon ?? 0,
      };

      return {
        ...state,
        phase: 'rule_create',
        scores: newScores,
        handHistory: [
          ...state.handHistory,
          {
            handNumber: state.currentHand.number,
            trumpSuit: state.currentHand.trumpSuit,
            tricks,
            winner: action.winner,
          },
        ],
        updatedAt: now,
      };
    }

    case 'ADD_RULE': {
      return {
        ...state,
        rules: [...state.rules, action.rule],
        updatedAt: now,
      };
    }

    case 'START_NEXT_HAND': {
      // Clear current hand, ready for new deal
      return {
        ...state,
        phase: 'dealing',
        currentHand: null,
        updatedAt: now,
      };
    }

    case 'END_GAME': {
      return {
        ...state,
        phase: 'game_end',
        updatedAt: now,
      };
    }

    case 'SET_PLAYER_CONNECTED': {
      const player = state.players[action.position];
      if (!player) return state;

      return {
        ...state,
        players: {
          ...state.players,
          [action.position]: {
            ...player,
            isConnected: action.connected,
          },
        },
        updatedAt: now,
      };
    }

    default:
      return state;
  }
}
