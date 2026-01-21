import type { PlayerPosition, GameType } from '@fkthepope/shared';

export interface SessionData {
  sessionId: string;
  clientId: string;
  playerName: string | null;
  startTime: number;
  endTime: number | null;
  deviceType: 'mobile' | 'desktop';
  country: string | null;
  gamesPlayed: number;
  roomsJoined: string[];
  version: string;
}

// Player tracking - identified by hash of IP + name
export interface PlayerData {
  playerId: string; // hash of IP + name
  playerName: string;
  firstSeen: number;
  lastSeen: number;
  totalSessions: number;
  totalGamesPlayed: number;
  totalPlayTime: number; // seconds
  lastCountry: string | null;
  lastDeviceType: 'mobile' | 'desktop';
}

export interface GameEvent {
  id: string;
  type: 'game_started' | 'game_ended' | 'player_joined' | 'player_left';
  timestamp: number;
  roomId: string;
  playerCount: number;
  duration?: number;
  winner?: PlayerPosition;
  gameType?: GameType;
}

export interface DailyStats {
  date: string; // YYYY-MM-DD
  gamesPlayed: number;
  uniqueUsers: Set<string> | string[]; // Set in memory, array when serialized
  totalSessionTime: number; // seconds
  peakConcurrentGames: number;
  deviceBreakdown: { mobile: number; desktop: number };
  countryBreakdown: Record<string, number>;
  hourlyGames: Record<number, number>; // hour (0-23) -> count
}

export interface PersistedAnalytics {
  totalGamesPlayed: number;
  allTimeUniqueUsers: string[]; // clientIds
  dailyStats: Array<{
    date: string;
    gamesPlayed: number;
    uniqueUsers: string[];
    totalSessionTime: number;
    peakConcurrentGames: number;
    deviceBreakdown: { mobile: number; desktop: number };
    countryBreakdown: Record<string, number>;
    hourlyGames: Record<number, number>;
  }>;
  completedSessions: Array<{
    clientId: string;
    playerName: string | null;
    startTime: number;
    endTime: number;
    deviceType: 'mobile' | 'desktop';
    country: string | null;
    gamesPlayed: number;
    version: string;
  }>;
  players: PlayerData[];
  recentEvents: GameEvent[];
  lastSaved: number;
}

export type TimePeriod = '7d' | '30d' | 'all';

export interface DashboardResponse {
  // Real-time
  activeGames: number;
  activeSessions: number;

  // Totals (all time)
  totalGamesPlayed: number;
  totalUniqueUsers: number;

  // Period-based stats (configurable)
  periodStats: {
    period: TimePeriod;
    gamesPlayed: number;
    uniqueUsers: number;
    averageSessionDuration: number; // seconds
    totalPlayTime: number; // seconds
  };

  // Time-based
  gamesLast24Hours: number;
  gamesLast7Days: number;
  gamesPerDay: Array<{ date: string; count: number }>;

  // Breakdowns
  deviceBreakdown: { mobile: number; desktop: number };
  countryBreakdown: Record<string, number>;
  versionBreakdown: Record<string, number>;
  versionPerDay: Array<{ date: string; versions: Record<string, number> }>;
  peakHours: Record<number, number>;
  gameTypeBreakdown: Record<GameType, number>;

  // Recent activity
  recentSessions: Array<{
    clientId: string;
    playerName: string | null;
    startTime: number;
    endTime: number | null;
    deviceType: 'mobile' | 'desktop';
    country: string | null;
    duration: number;
  }>;

  // Player stats
  players: Array<{
    playerId: string;
    playerName: string;
    firstSeen: number;
    lastSeen: number;
    totalSessions: number;
    totalGamesPlayed: number;
    totalPlayTime: number;
    lastCountry: string | null;
    lastDeviceType: 'mobile' | 'desktop';
  }>;
}
