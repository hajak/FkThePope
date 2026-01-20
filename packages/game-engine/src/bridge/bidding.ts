import type { PlayerPosition } from '@fkthepope/shared';
import type { Bid, BidLevel, BidStrain, Contract, BridgeState } from './state.js';
import { STRAIN_RANK, getPartnership } from './state.js';

/**
 * Compare two bids to determine if bid2 is higher than bid1
 */
export function isBidHigher(bid1: Bid, bid2: Bid): boolean {
  if (bid1.type !== 'bid' || bid2.type !== 'bid') return false;
  if (!bid1.level || !bid2.level || !bid1.strain || !bid2.strain) return false;

  if (bid2.level > bid1.level) return true;
  if (bid2.level < bid1.level) return false;

  // Same level - compare strains
  return STRAIN_RANK[bid2.strain] > STRAIN_RANK[bid1.strain];
}

/**
 * Check if a bid is valid given the current bidding state
 */
export function isValidBid(
  bid: Bid,
  state: BridgeState
): { valid: boolean; reason?: string } {
  // Check if it's the player's turn
  const expectedPlayer = getNextBidder(state);
  if (bid.player !== expectedPlayer) {
    return { valid: false, reason: 'Not your turn to bid' };
  }

  switch (bid.type) {
    case 'pass':
      // Pass is always valid
      return { valid: true };

    case 'bid':
      // Must have level and strain
      if (!bid.level || !bid.strain) {
        return { valid: false, reason: 'Bid must specify level and strain' };
      }

      // Must be higher than last bid
      if (state.lastBid && !isBidHigher(state.lastBid, bid)) {
        return { valid: false, reason: 'Bid must be higher than previous bid' };
      }

      return { valid: true };

    case 'double':
      // Can only double opponent's bid
      if (!state.lastBid || state.lastBid.type !== 'bid') {
        return { valid: false, reason: 'Nothing to double' };
      }

      const lastBidPartnership = getPartnership(state.lastBid.player);
      const doublerPartnership = getPartnership(bid.player);
      if (lastBidPartnership === doublerPartnership) {
        return { valid: false, reason: 'Cannot double your own partnership' };
      }

      // Check if already doubled
      const lastActionBid = [...state.bids].reverse().find(b => b.type !== 'pass');
      if (lastActionBid?.type === 'double') {
        return { valid: false, reason: 'Already doubled' };
      }

      return { valid: true };

    case 'redouble':
      // Can only redouble opponent's double
      const lastAction = [...state.bids].reverse().find(b => b.type !== 'pass');
      if (!lastAction || lastAction.type !== 'double') {
        return { valid: false, reason: 'Nothing to redouble' };
      }

      const doublerTeam = getPartnership(lastAction.player);
      const redoublerTeam = getPartnership(bid.player);
      if (doublerTeam === redoublerTeam) {
        return { valid: false, reason: 'Cannot redouble your own double' };
      }

      return { valid: true };

    default:
      return { valid: false, reason: 'Unknown bid type' };
  }
}

/**
 * Get the next player to bid
 */
export function getNextBidder(state: BridgeState): PlayerPosition {
  const order: PlayerPosition[] = ['north', 'east', 'south', 'west'];
  const dealerIndex = order.indexOf(state.dealer);

  if (state.bids.length === 0) {
    // Dealer starts
    return state.dealer;
  }

  const lastBidder = state.bids[state.bids.length - 1]!.player;
  const lastBidderIndex = order.indexOf(lastBidder);
  return order[(lastBidderIndex + 1) % 4]!;
}

/**
 * Check if bidding is complete
 */
export function isBiddingComplete(state: BridgeState): boolean {
  // Need at least 4 bids for bidding to end
  if (state.bids.length < 4) return false;

  // Bidding ends after 3 consecutive passes following a bid
  if (state.lastBid && state.consecutivePasses >= 3) {
    return true;
  }

  // Or 4 consecutive passes if no bid was made
  if (!state.lastBid && state.consecutivePasses >= 4) {
    return true;
  }

  return false;
}

/**
 * Determine the contract from completed bidding
 */
export function determineContract(state: BridgeState): Contract | null {
  // Find the last actual bid (not pass/double/redouble)
  const lastBid = [...state.bids].reverse().find(b => b.type === 'bid');
  if (!lastBid || lastBid.type !== 'bid' || !lastBid.level || !lastBid.strain) {
    return null; // Passed out
  }

  // Find who first bid this strain for the declaring partnership
  const declaringPartnership = getPartnership(lastBid.player);
  const firstBidder = state.bids.find(b =>
    b.type === 'bid' &&
    b.strain === lastBid.strain &&
    getPartnership(b.player) === declaringPartnership
  );

  if (!firstBidder) {
    return null;
  }

  const declarer = firstBidder.player;
  const dummyMap: Record<PlayerPosition, PlayerPosition> = {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east',
  };

  // Check for double/redouble
  const lastActions = [...state.bids].slice(-3).reverse();
  let doubled = false;
  let redoubled = false;

  for (const action of lastActions) {
    if (action.type === 'redouble') {
      redoubled = true;
      doubled = false;
      break;
    }
    if (action.type === 'double') {
      doubled = true;
      break;
    }
    if (action.type === 'bid') {
      break;
    }
  }

  return {
    level: lastBid.level,
    strain: lastBid.strain,
    declarer,
    dummy: dummyMap[declarer],
    doubled,
    redoubled,
    defendingTeam: declaringPartnership === 'NS' ? 'EW' : 'NS',
  };
}

/**
 * Get all valid bids for a player
 */
export function getValidBids(state: BridgeState, position: PlayerPosition): Bid[] {
  const validBids: Bid[] = [];

  // Pass is always valid
  validBids.push({ type: 'pass', player: position });

  // Check if double is valid
  const doubleBid: Bid = { type: 'double', player: position };
  if (isValidBid(doubleBid, state).valid) {
    validBids.push(doubleBid);
  }

  // Check if redouble is valid
  const redoubleBid: Bid = { type: 'redouble', player: position };
  if (isValidBid(redoubleBid, state).valid) {
    validBids.push(redoubleBid);
  }

  // Generate all possible contract bids
  const levels: BidLevel[] = [1, 2, 3, 4, 5, 6, 7];
  const strains: BidStrain[] = ['clubs', 'diamonds', 'hearts', 'spades', 'notrump'];

  for (const level of levels) {
    for (const strain of strains) {
      const bid: Bid = { type: 'bid', level, strain, player: position };
      if (isValidBid(bid, state).valid) {
        validBids.push(bid);
      }
    }
  }

  return validBids;
}
