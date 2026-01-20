/**
 * Supported game types in the application
 */
export type GameType = 'whist' | 'bridge' | 'skitgubbe';

/**
 * Configuration for each game type
 */
export interface GameConfig {
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  cardsPerPlayer: number | 'variable';
  tricksPerHand: number | 'variable';
  hasPartners: boolean;
  hasBidding: boolean;
  hasTrump: boolean;
}

/**
 * Game configurations for all supported games
 */
export const GAME_CONFIGS: Record<GameType, GameConfig> = {
  whist: {
    name: 'Whist',
    description: 'Classic 4-player trick-taking game. Win the most tricks!',
    minPlayers: 4,
    maxPlayers: 4,
    cardsPerPlayer: 13,
    tricksPerHand: 13,
    hasPartners: false,
    hasBidding: false,
    hasTrump: true,
  },
  bridge: {
    name: 'Bridge',
    description: 'Partnership trick-taking with bidding. Declare and make your contract!',
    minPlayers: 4,
    maxPlayers: 4,
    cardsPerPlayer: 13,
    tricksPerHand: 13,
    hasPartners: true,
    hasBidding: true,
    hasTrump: true,
  },
  skitgubbe: {
    name: 'Skitgubbe',
    description: 'Swedish card game. Avoid being the last player with cards!',
    minPlayers: 2,
    maxPlayers: 4,
    cardsPerPlayer: 'variable',
    tricksPerHand: 'variable',
    hasPartners: false,
    hasBidding: false,
    hasTrump: true,
  },
};

/**
 * Check if a game type supports a given player count
 */
export function isValidPlayerCount(gameType: GameType, playerCount: number): boolean {
  const config = GAME_CONFIGS[gameType];
  return playerCount >= config.minPlayers && playerCount <= config.maxPlayers;
}

/**
 * Get display name for a game type
 */
export function getGameDisplayName(gameType: GameType): string {
  return GAME_CONFIGS[gameType].name;
}

/**
 * All available game types
 */
export const GAME_TYPES: GameType[] = ['whist', 'bridge', 'skitgubbe'];
