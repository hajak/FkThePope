import type { PlayerPosition } from '@fkthepope/shared';

export interface SessionData {
  sessionId: string;
  clientId: string;
  startTime: number;
  endTime: number | null;
  deviceType: 'mobile' | 'desktop';
  country: string | null;
  gamesPlayed: number;
  roomsJoined: string[];
}

export interface GameEvent {
  id: string;
  type: 'game_started' | 'game_ended' | 'player_joined' | 'player_left';
  timestamp: number;
  roomId: string;
  playerCount: number;
  duration?: number;
  winner?: PlayerPosition;
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
    startTime: number;
    endTime: number;
    deviceType: 'mobile' | 'desktop';
    country: string | null;
    gamesPlayed: number;
  }>;
  recentEvents: GameEvent[];
  lastSaved: number;
}

export interface DashboardResponse {
  // Real-time
  activeGames: number;
  activeSessions: number;

  // Totals
  totalGamesPlayed: number;
  totalUniqueUsers: number;
  averageSessionDuration: number; // seconds

  // Time-based
  gamesLast24Hours: number;
  gamesLast7Days: number;
  gamesPerDay: Array<{ date: string; count: number }>;

  // Breakdowns
  deviceBreakdown: { mobile: number; desktop: number };
  countryBreakdown: Record<string, number>;
  peakHours: Record<number, number>;

  // Recent activity
  recentSessions: Array<{
    clientId: string;
    startTime: number;
    endTime: number | null;
    deviceType: 'mobile' | 'desktop';
    country: string | null;
    duration: number;
  }>;
}
