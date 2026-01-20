import type { PlayerPosition, Suit } from '@fkthepope/shared';
import type { BridgeState, BridgeAction, Contract } from './state.js';
import { getPartnership } from './state.js';
import { resolveBridgeTrick, getNextPlayer } from './legal-moves.js';
import { calculateHandScore } from './scoring.js';

/**
 * Get the player after the current one in clockwise order
 */
function getNextPosition(position: PlayerPosition): PlayerPosition {
  const order: PlayerPosition[] = ['north', 'east', 'south', 'west'];
  const index = order.indexOf(position);
  return order[(index + 1) % 4]!;
}

/**
 * Bridge reducer
 */
export function bridgeReducer(
  state: BridgeState,
  action: BridgeAction
): BridgeState {
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
            tricksWon: 0,
          },
        },
      };
    }

    case 'START_HAND': {
      const { hands, dealer } = action;
      const newPlayers = { ...state.players };

      // Assign hands to players
      for (const pos of ['north', 'east', 'south', 'west'] as PlayerPosition[]) {
        const player = newPlayers[pos];
        if (player && hands[pos]) {
          newPlayers[pos] = {
            ...player,
            hand: hands[pos] ?? [],
            tricksWon: 0,
          };
        }
      }

      return {
        ...state,
        phase: 'bidding',
        players: newPlayers,
        dealer,
        bids: [],
        consecutivePasses: 0,
        lastBid: null,
        contract: null,
        trumpSuit: null,
        currentTrick: null,
        completedTricks: [],
      };
    }

    case 'MAKE_BID': {
      const { bid } = action;
      const newBids = [...state.bids, bid];

      let newConsecutivePasses = state.consecutivePasses;
      let newLastBid = state.lastBid;

      if (bid.type === 'pass') {
        newConsecutivePasses++;
      } else {
        newConsecutivePasses = 0;
        if (bid.type === 'bid') {
          newLastBid = bid;
        }
      }

      return {
        ...state,
        bids: newBids,
        consecutivePasses: newConsecutivePasses,
        lastBid: newLastBid,
      };
    }

    case 'END_BIDDING': {
      const { contract } = action;

      if (!contract) {
        // Passed out - end hand with no play
        return {
          ...state,
          phase: 'hand_end',
          contract: null,
        };
      }

      // Set trump suit
      const trumpSuit: Suit | null = contract.strain === 'notrump' ? null : contract.strain as Suit;

      return {
        ...state,
        contract,
        trumpSuit,
      };
    }

    case 'START_PLAY': {
      if (!state.contract) return state;

      // Left of declarer leads first
      const leader = getNextPosition(state.contract.declarer);

      return {
        ...state,
        phase: 'playing',
        currentTrick: {
          cards: [],
          leadSuit: null,
          leader,
          currentPlayer: leader,
          trickNumber: 1,
        },
      };
    }

    case 'PLAY_CARD': {
      const { position, card } = action;
      if (!state.currentTrick) return state;

      // Determine whose hand to remove the card from
      // (position is where the card comes from, but declarer may be playing dummy's cards)
      const player = state.players[position];
      if (!player) return state;

      // Remove card from hand
      const newHand = player.hand.filter(
        c => !(c.suit === card.suit && c.rank === card.rank)
      );

      const newPlayers = {
        ...state.players,
        [position]: { ...player, hand: newHand },
      };

      const newTrickCards = [...state.currentTrick.cards, { card, playedBy: position }];
      const isFirstCard = state.currentTrick.cards.length === 0;
      const leadSuit = isFirstCard ? card.suit : state.currentTrick.leadSuit;

      // Determine next player
      let nextPlayer: PlayerPosition | null = null;
      if (newTrickCards.length < 4) {
        nextPlayer = getNextPlayer(position, state.contract);
      }

      return {
        ...state,
        players: newPlayers,
        currentTrick: {
          ...state.currentTrick,
          cards: newTrickCards,
          leadSuit,
          currentPlayer: nextPlayer!,
        },
      };
    }

    case 'COMPLETE_TRICK': {
      const { winner } = action;
      if (!state.currentTrick) return state;

      // Update winner's trick count
      const winnerPlayer = state.players[winner];
      if (!winnerPlayer) return state;

      const newPlayers = {
        ...state.players,
        [winner]: {
          ...winnerPlayer,
          tricksWon: winnerPlayer.tricksWon + 1,
        },
      };

      // Move current trick to completed
      const completedTrick = {
        ...state.currentTrick,
        winner,
      };
      const newCompletedTricks = [...state.completedTricks, completedTrick];

      // Check if hand is complete (13 tricks)
      if (newCompletedTricks.length >= 13) {
        return {
          ...state,
          players: newPlayers,
          completedTricks: newCompletedTricks,
          currentTrick: null,
          phase: 'hand_end',
        };
      }

      // Start next trick - winner leads
      // But if winner is dummy, declarer actually plays
      let nextLeader = winner;
      if (state.contract && winner === state.contract.dummy) {
        // Winner is dummy, but dummy leads from dummy's position
        // Declarer will choose the card
      }

      return {
        ...state,
        players: newPlayers,
        completedTricks: newCompletedTricks,
        currentTrick: {
          cards: [],
          leadSuit: null,
          leader: winner,
          currentPlayer: winner, // Will be resolved to declarer if needed
          trickNumber: newCompletedTricks.length + 1,
        },
      };
    }

    case 'END_HAND': {
      const { declarerTricks } = action;

      if (!state.contract) {
        // Passed out - no scoring change
        return {
          ...state,
          phase: 'hand_end',
        };
      }

      const scoring = calculateHandScore(state.contract, declarerTricks);
      const declaringTeam = getPartnership(state.contract.declarer);
      const defendingTeam = state.contract.defendingTeam;

      const newScores = { ...state.scores };
      newScores[declaringTeam] += scoring.declarerScore;
      newScores[defendingTeam] += scoring.defenderScore;

      return {
        ...state,
        scores: newScores,
        phase: 'hand_end',
      };
    }

    case 'END_GAME': {
      return {
        ...state,
        phase: 'game_end',
      };
    }

    default:
      return state;
  }
}
