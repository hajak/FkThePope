import type { Contract, Partnership, BidStrain } from './state.js';

/**
 * Points per trick for each strain
 */
const TRICK_POINTS: Record<BidStrain, number> = {
  clubs: 20,
  diamonds: 20,
  hearts: 30,
  spades: 30,
  notrump: 30, // First trick is 40
};

/**
 * Calculate the score for a completed hand
 */
export function calculateHandScore(
  contract: Contract,
  declarerTricks: number
): {
  declarerScore: number;
  defenderScore: number;
  made: boolean;
  overtricks: number;
  undertricks: number;
} {
  const tricksNeeded = contract.level + 6;
  const made = declarerTricks >= tricksNeeded;

  if (made) {
    // Contract made
    const overtricks = declarerTricks - tricksNeeded;

    // Base contract points
    let basePoints = contract.level * TRICK_POINTS[contract.strain];
    if (contract.strain === 'notrump') {
      // First trick is 40, rest are 30
      basePoints = 40 + (contract.level - 1) * 30;
    }

    // Doubled/redoubled multiplier for base
    if (contract.doubled) basePoints *= 2;
    if (contract.redoubled) basePoints *= 4;

    // Overtrick points (simplified)
    let overtrickPoints = overtricks * TRICK_POINTS[contract.strain];
    if (contract.doubled) overtrickPoints = overtricks * 100;
    if (contract.redoubled) overtrickPoints = overtricks * 200;

    // Bonus for making doubled/redoubled
    let insultBonus = 0;
    if (contract.doubled) insultBonus = 50;
    if (contract.redoubled) insultBonus = 100;

    // Game bonus (simplified - 300 for game, 50 for part score)
    let gameBonus = 50;
    if (basePoints >= 100) {
      gameBonus = 300;
    }

    // Slam bonus (simplified)
    let slamBonus = 0;
    if (contract.level === 6) slamBonus = 500;
    if (contract.level === 7) slamBonus = 1000;

    const declarerScore = basePoints + overtrickPoints + insultBonus + gameBonus + slamBonus;

    return {
      declarerScore,
      defenderScore: 0,
      made: true,
      overtricks,
      undertricks: 0,
    };
  } else {
    // Contract failed
    const undertricks = tricksNeeded - declarerTricks;

    // Penalty points (simplified - not vulnerable)
    let penalty: number;
    if (contract.redoubled) {
      penalty = undertricks * 400;
    } else if (contract.doubled) {
      penalty = undertricks * 200;
    } else {
      penalty = undertricks * 50;
    }

    return {
      declarerScore: 0,
      defenderScore: penalty,
      made: false,
      overtricks: 0,
      undertricks,
    };
  }
}

/**
 * Get display string for a contract
 */
export function formatContract(contract: Contract): string {
  const strainSymbol: Record<BidStrain, string> = {
    clubs: '\u2663',
    diamonds: '\u2666',
    hearts: '\u2665',
    spades: '\u2660',
    notrump: 'NT',
  };

  let result = `${contract.level}${strainSymbol[contract.strain]}`;

  if (contract.redoubled) {
    result += ' XX';
  } else if (contract.doubled) {
    result += ' X';
  }

  return result;
}

/**
 * Get display string for tricks result
 */
export function formatTricksResult(
  contract: Contract,
  declarerTricks: number
): string {
  const tricksNeeded = contract.level + 6;
  const diff = declarerTricks - tricksNeeded;

  if (diff === 0) {
    return 'Made exactly';
  } else if (diff > 0) {
    return `Made +${diff}`;
  } else {
    return `Down ${Math.abs(diff)}`;
  }
}
