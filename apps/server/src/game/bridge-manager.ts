import type { PlayerPosition, Card, Suit, GameType } from '@fkthepope/shared';
import { bridge } from '@fkthepope/game-engine';
import type { BaseGameManager } from './base-game-manager.js';
import type { Room } from '../lobby/lobby-manager.js';

const {
  createInitialBridgeState,
  toClientBridgeState,
  bridgeReducer,
  dealBridge,
  getNextDealer,
  isValidBid,
  isBiddingComplete,
  determineContract,
  getNextBidder,
  getValidBids,
  getBridgeLegalMoves,
  isLegalBridgePlay,
  resolveBridgeTrick,
  getPartnership,
  calculateHandScore,
  STRAIN_RANK,
} = bridge;

type BridgeState = bridge.BridgeState;
type ClientBridgeState = bridge.ClientBridgeState;
type Bid = bridge.Bid;
type Contract = bridge.Contract;

/**
 * Manages a Bridge game instance
 */
export class BridgeGameManager implements BaseGameManager {
  readonly gameType: GameType = 'bridge';
  private state: BridgeState;
  private seed?: number;

  constructor(
    public readonly room: Room,
    options: { seed?: number } = {}
  ) {
    this.seed = options.seed;

    // Create initial state
    this.state = createInitialBridgeState(room.id);

    // Add players from room
    for (const [pos, player] of room.players) {
      this.state = bridgeReducer(this.state, {
        type: 'ADD_PLAYER',
        player: {
          id: player.id,
          name: player.name,
          position: pos,
          isBot: player.isBot,
        },
      });
    }
  }

  /**
   * Start a new hand
   */
  startHand(): { dealer: PlayerPosition } {
    const { hands } = dealBridge(this.seed);
    const dealer = this.state.dealer;

    this.state = bridgeReducer(this.state, {
      type: 'START_HAND',
      hands,
      dealer,
    });

    return { dealer };
  }

  /**
   * Make a bid
   */
  makeBid(
    position: PlayerPosition,
    bid: Omit<Bid, 'player'>
  ): {
    success: boolean;
    error?: string;
    biddingComplete?: boolean;
    contract?: Contract | null;
  } {
    if (this.state.phase !== 'bidding') {
      return { success: false, error: 'Not in bidding phase' };
    }

    const fullBid: Bid = { ...bid, player: position } as Bid;

    // Validate bid
    const validation = isValidBid(fullBid, this.state);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    // Make the bid
    this.state = bridgeReducer(this.state, {
      type: 'MAKE_BID',
      position,
      bid: fullBid,
    });

    // Check if bidding is complete
    if (isBiddingComplete(this.state)) {
      const contract = determineContract(this.state);

      this.state = bridgeReducer(this.state, {
        type: 'END_BIDDING',
        contract,
      });

      if (contract) {
        // Start play
        this.state = bridgeReducer(this.state, { type: 'START_PLAY' });
      }

      return {
        success: true,
        biddingComplete: true,
        contract,
      };
    }

    return { success: true };
  }

  /**
   * Play a card
   */
  playCard(
    position: PlayerPosition,
    card: Card,
    fromDummy: boolean = false
  ): {
    success: boolean;
    error?: string;
    trickComplete?: boolean;
    trickWinner?: PlayerPosition;
    handComplete?: boolean;
    declarerTricks?: number;
  } {
    if (this.state.phase !== 'playing') {
      return { success: false, error: 'Not in playing phase' };
    }

    if (!this.state.currentTrick) {
      return { success: false, error: 'No current trick' };
    }

    // Determine who is actually playing
    const actualPlayer = this.state.currentTrick.currentPlayer;
    const contract = this.state.contract;

    // Validate it's the right player
    if (fromDummy) {
      // Playing from dummy - must be declarer's turn and dummy position
      if (!contract || position !== contract.declarer) {
        return { success: false, error: 'Only declarer can play dummy cards' };
      }
      if (actualPlayer !== contract.dummy) {
        return { success: false, error: 'Not dummy turn' };
      }
    } else {
      if (position !== actualPlayer) {
        return { success: false, error: 'Not your turn' };
      }
    }

    // Get the hand to play from
    const cardPosition = fromDummy && contract ? contract.dummy : position;
    const player = this.state.players[cardPosition];
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    // Check if play is legal
    const check = isLegalBridgePlay(
      card,
      player.hand,
      this.state.currentTrick.cards,
      this.state.trumpSuit
    );
    if (!check.legal) {
      return { success: false, error: check.reason };
    }

    // Play the card
    this.state = bridgeReducer(this.state, {
      type: 'PLAY_CARD',
      position: cardPosition,
      card,
    });

    // Check if trick is complete (4 cards)
    if (this.state.currentTrick && this.state.currentTrick.cards.length >= 4) {
      const winner = resolveBridgeTrick(
        this.state.currentTrick.cards,
        this.state.trumpSuit
      );

      this.state = bridgeReducer(this.state, {
        type: 'COMPLETE_TRICK',
        winner,
      });

      // Check if hand is complete
      if (this.state.phase === 'hand_end') {
        // Count declarer's tricks
        let declarerTricks = 0;
        if (contract) {
          const declarerTeam = getPartnership(contract.declarer);
          for (const pos of ['north', 'east', 'south', 'west'] as PlayerPosition[]) {
            const p = this.state.players[pos];
            if (p && getPartnership(pos) === declarerTeam) {
              declarerTricks += p.tricksWon;
            }
          }
        }

        this.state = bridgeReducer(this.state, {
          type: 'END_HAND',
          declarerTricks,
        });

        // Rotate dealer for next hand
        this.state = {
          ...this.state,
          dealer: getNextDealer(this.state.dealer),
        };

        return {
          success: true,
          trickComplete: true,
          trickWinner: winner,
          handComplete: true,
          declarerTricks,
        };
      }

      return {
        success: true,
        trickComplete: true,
        trickWinner: winner,
      };
    }

    return { success: true };
  }

  /**
   * Get the current player
   */
  getCurrentPlayer(): PlayerPosition | null {
    if (this.state.phase === 'bidding') {
      return getNextBidder(this.state);
    }
    if (this.state.phase === 'playing' && this.state.currentTrick) {
      return this.state.currentTrick.currentPlayer;
    }
    return null;
  }

  /**
   * Get client state
   */
  getClientState(position: PlayerPosition): ClientBridgeState {
    return toClientBridgeState(this.state, position);
  }

  /**
   * Get admin state
   */
  getAdminState(): BridgeState {
    return this.state;
  }

  /**
   * No rule creation in Bridge
   */
  isRuleCreationPhase(): boolean {
    return false;
  }

  /**
   * No hand winner concept for rule creation in Bridge
   */
  getHandWinner(): PlayerPosition | null {
    return null;
  }

  /**
   * Get phase
   */
  getPhase(): string {
    return this.state.phase;
  }

  /**
   * Get valid bids for a player
   */
  getValidBidsForPlayer(position: PlayerPosition): Bid[] {
    if (this.state.phase !== 'bidding') return [];
    return getValidBids(this.state, position);
  }

  /**
   * Get legal cards for a player
   */
  getLegalCards(position: PlayerPosition): Card[] {
    if (this.state.phase !== 'playing' || !this.state.currentTrick) return [];

    const player = this.state.players[position];
    if (!player) return [];

    return getBridgeLegalMoves(
      player.hand,
      this.state.currentTrick.cards,
      this.state.trumpSuit
    );
  }

  /**
   * Get bot move
   */
  getBotMove(position: PlayerPosition): { bid?: Bid; card?: Card; fromDummy?: boolean } | null {
    const player = this.state.players[position];
    if (!player || !player.isBot) return null;

    if (this.state.phase === 'bidding') {
      // Simple bidding strategy: pass unless we have a good hand
      const validBids = getValidBids(this.state, position);

      // Count high card points (A=4, K=3, Q=2, J=1)
      let hcp = 0;
      for (const card of player.hand) {
        if (card.rank === 'A') hcp += 4;
        else if (card.rank === 'K') hcp += 3;
        else if (card.rank === 'Q') hcp += 2;
        else if (card.rank === 'J') hcp += 1;
      }

      // Simple opening bid strategy
      if (hcp >= 13 && !this.state.lastBid) {
        // Find longest suit
        const suitCounts: Record<Suit, number> = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };
        for (const card of player.hand) {
          suitCounts[card.suit]++;
        }

        let longestSuit: Suit = 'spades';
        let maxCount = 0;
        for (const [suit, count] of Object.entries(suitCounts)) {
          if (count > maxCount) {
            maxCount = count;
            longestSuit = suit as Suit;
          }
        }

        const bid = validBids.find(b =>
          b.type === 'bid' && b.level === 1 && b.strain === longestSuit
        );
        if (bid) return { bid };
      }

      // Default: pass
      const passBid = validBids.find(b => b.type === 'pass');
      if (passBid) return { bid: passBid };
    }

    if (this.state.phase === 'playing' && this.state.currentTrick) {
      const contract = this.state.contract;
      const currentPlayer = this.state.currentTrick.currentPlayer;

      // Check if bot needs to play from dummy
      if (contract && position === contract.declarer && currentPlayer === contract.dummy) {
        const dummyPlayer = this.state.players[contract.dummy];
        if (dummyPlayer) {
          const legalCards = getBridgeLegalMoves(
            dummyPlayer.hand,
            this.state.currentTrick.cards,
            this.state.trumpSuit
          );
          if (legalCards.length > 0) {
            // Simple: play lowest legal card
            const sorted = [...legalCards].sort((a, b) => {
              const rankOrder: Record<string, number> = {
                '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
                '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
              };
              return (rankOrder[a.rank] ?? 0) - (rankOrder[b.rank] ?? 0);
            });
            return { card: sorted[0], fromDummy: true };
          }
        }
      }

      // Play from own hand
      if (currentPlayer === position) {
        const legalCards = this.getLegalCards(position);
        if (legalCards.length > 0) {
          // Simple: play lowest legal card
          const sorted = [...legalCards].sort((a, b) => {
            const rankOrder: Record<string, number> = {
              '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
              '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
            };
            return (rankOrder[a.rank] ?? 0) - (rankOrder[b.rank] ?? 0);
          });
          return { card: sorted[0], fromDummy: false };
        }
      }
    }

    return null;
  }
}
