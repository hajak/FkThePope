import { randomBytes } from 'crypto';
import type { PlayerPosition } from '@fkthepope/shared';

// Generate short random ID
function generateId(): string {
  return randomBytes(4).toString('hex');
}
import { AnalyticsStorage } from './analytics-storage.js';
import type {
  SessionData,
  GameEvent,
  DailyStats,
  PersistedAnalytics,
  DashboardResponse,
} from './types.js';

// Will be dynamically imported to handle ESM/CJS issues
let geoipLookup: ((ip: string) => { country?: string } | null) | null = null;

async function loadGeoip() {
  try {
    const geoip = await import('geoip-lite');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lookup = (geoip as any).default?.lookup || (geoip as any).lookup;
    if (typeof lookup === 'function') {
      geoipLookup = lookup;
    }
  } catch {
    console.log('[Analytics] geoip-lite not available, country detection disabled');
  }
}

function getDateString(timestamp: number = Date.now()): string {
  return new Date(timestamp).toISOString().split('T')[0] ?? '';
}

function getHour(timestamp: number = Date.now()): number {
  return new Date(timestamp).getUTCHours();
}

export class AnalyticsManager {
  private static instance: AnalyticsManager;

  private storage: AnalyticsStorage;
  private activeSessions: Map<string, SessionData> = new Map();
  private activeGameCount: number = 0;
  private gameStartTimes: Map<string, number> = new Map();

  // Persisted data
  private totalGamesPlayed: number = 0;
  private allTimeUniqueUsers: Set<string> = new Set();
  private dailyStats: Map<string, DailyStats> = new Map();
  private completedSessions: Array<{
    clientId: string;
    startTime: number;
    endTime: number;
    deviceType: 'mobile' | 'desktop';
    country: string | null;
    gamesPlayed: number;
  }> = [];
  private recentEvents: GameEvent[] = [];

  private constructor() {
    this.storage = new AnalyticsStorage();
  }

  static getInstance(): AnalyticsManager {
    if (!AnalyticsManager.instance) {
      AnalyticsManager.instance = new AnalyticsManager();
    }
    return AnalyticsManager.instance;
  }

  async initialize(): Promise<void> {
    // Load geoip module
    await loadGeoip();

    // Load persisted data
    const data = await this.storage.initialize();
    this.loadFromPersisted(data);

    // Start auto-save
    this.storage.startAutoSave(() => this.toPersisted(), 300000); // 5 minutes

    // Cleanup stale sessions every minute
    setInterval(() => this.cleanupStaleSessions(), 60000);

    console.log('[Analytics] Initialized');
  }

  private loadFromPersisted(data: PersistedAnalytics): void {
    this.totalGamesPlayed = data.totalGamesPlayed;
    this.allTimeUniqueUsers = new Set(data.allTimeUniqueUsers);
    this.completedSessions = data.completedSessions.slice(-1000); // Keep last 1000
    this.recentEvents = data.recentEvents.slice(-1000);

    // Load daily stats
    for (const day of data.dailyStats) {
      this.dailyStats.set(day.date, {
        ...day,
        uniqueUsers: new Set(day.uniqueUsers),
      });
    }

    // Keep only last 90 days of daily stats
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const cutoffDate = getDateString(cutoff);
    for (const [date] of this.dailyStats) {
      if (date < cutoffDate) {
        this.dailyStats.delete(date);
      }
    }
  }

  private toPersisted(): PersistedAnalytics {
    return {
      totalGamesPlayed: this.totalGamesPlayed,
      allTimeUniqueUsers: Array.from(this.allTimeUniqueUsers),
      dailyStats: Array.from(this.dailyStats.values()).map((day) => ({
        ...day,
        uniqueUsers: Array.from(day.uniqueUsers as Set<string>),
      })),
      completedSessions: this.completedSessions.slice(-1000),
      recentEvents: this.recentEvents.slice(-1000),
      lastSaved: Date.now(),
    };
  }

  private getOrCreateDailyStats(date: string = getDateString()): DailyStats {
    let stats = this.dailyStats.get(date);
    if (!stats) {
      stats = {
        date,
        gamesPlayed: 0,
        uniqueUsers: new Set(),
        totalSessionTime: 0,
        peakConcurrentGames: 0,
        deviceBreakdown: { mobile: 0, desktop: 0 },
        countryBreakdown: {},
        hourlyGames: {},
      };
      this.dailyStats.set(date, stats);
    }
    return stats;
  }

  private resolveCountry(ip: string): string | null {
    if (!geoipLookup || !ip) return null;

    // Handle localhost and private IPs
    if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return 'Local';
    }

    // Remove IPv6 prefix if present
    const cleanIp = ip.replace(/^::ffff:/, '');

    try {
      const result = geoipLookup(cleanIp);
      return result?.country || null;
    } catch {
      return null;
    }
  }

  // Session tracking
  startSession(
    sessionId: string,
    clientId: string,
    deviceType: 'mobile' | 'desktop',
    ip: string
  ): void {
    const country = this.resolveCountry(ip);
    const session: SessionData = {
      sessionId,
      clientId,
      startTime: Date.now(),
      endTime: null,
      deviceType,
      country,
      gamesPlayed: 0,
      roomsJoined: [],
    };

    this.activeSessions.set(sessionId, session);

    // Track unique users
    this.allTimeUniqueUsers.add(clientId);

    // Update daily stats
    const today = this.getOrCreateDailyStats();
    (today.uniqueUsers as Set<string>).add(clientId);
    today.deviceBreakdown[deviceType]++;
    if (country) {
      today.countryBreakdown[country] = (today.countryBreakdown[country] || 0) + 1;
    }

    console.log(`[Analytics] Session started: ${sessionId} (${deviceType}, ${country || 'unknown'})`);
  }

  endSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.endTime = Date.now();
    const duration = Math.floor((session.endTime - session.startTime) / 1000);

    // Update daily stats with session time
    const today = this.getOrCreateDailyStats();
    today.totalSessionTime += duration;

    // Store completed session
    this.completedSessions.push({
      clientId: session.clientId,
      startTime: session.startTime,
      endTime: session.endTime,
      deviceType: session.deviceType,
      country: session.country,
      gamesPlayed: session.gamesPlayed,
    });

    // Keep only last 1000 sessions
    if (this.completedSessions.length > 1000) {
      this.completedSessions = this.completedSessions.slice(-1000);
    }

    this.activeSessions.delete(sessionId);
    console.log(`[Analytics] Session ended: ${sessionId} (${duration}s, ${session.gamesPlayed} games)`);
  }

  // Game tracking
  recordGameStarted(roomId: string, playerCount: number): void {
    this.activeGameCount++;
    this.gameStartTimes.set(roomId, Date.now());

    const event: GameEvent = {
      id: generateId(),
      type: 'game_started',
      timestamp: Date.now(),
      roomId,
      playerCount,
    };
    this.recentEvents.push(event);

    // Update peak concurrent games
    const today = this.getOrCreateDailyStats();
    if (this.activeGameCount > today.peakConcurrentGames) {
      today.peakConcurrentGames = this.activeGameCount;
    }

    console.log(`[Analytics] Game started: ${roomId} (${playerCount} players, ${this.activeGameCount} active)`);
  }

  recordGameEnded(roomId: string, winner?: PlayerPosition): void {
    this.activeGameCount = Math.max(0, this.activeGameCount - 1);
    this.totalGamesPlayed++;

    const startTime = this.gameStartTimes.get(roomId);
    const duration = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    this.gameStartTimes.delete(roomId);

    const event: GameEvent = {
      id: generateId(),
      type: 'game_ended',
      timestamp: Date.now(),
      roomId,
      playerCount: 4,
      duration,
      winner,
    };
    this.recentEvents.push(event);

    // Keep only last 1000 events
    if (this.recentEvents.length > 1000) {
      this.recentEvents = this.recentEvents.slice(-1000);
    }

    // Update daily stats
    const today = this.getOrCreateDailyStats();
    today.gamesPlayed++;

    const hour = getHour();
    today.hourlyGames[hour] = (today.hourlyGames[hour] || 0) + 1;

    console.log(`[Analytics] Game ended: ${roomId} (${duration}s, winner: ${winner || 'none'})`);
  }

  recordPlayerJoinedRoom(sessionId: string, roomId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session && !session.roomsJoined.includes(roomId)) {
      session.roomsJoined.push(roomId);
    }
  }

  recordPlayerPlayedGame(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.gamesPlayed++;
    }
  }

  // Cleanup stale sessions (disconnected without proper cleanup)
  private cleanupStaleSessions(): void {
    const staleThreshold = Date.now() - 30 * 60 * 1000; // 30 minutes
    for (const [sessionId, session] of this.activeSessions) {
      if (session.startTime < staleThreshold && !session.endTime) {
        console.log(`[Analytics] Cleaning up stale session: ${sessionId}`);
        this.endSession(sessionId);
      }
    }
  }

  // Dashboard data
  getDashboardData(): DashboardResponse {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Calculate games in last 24h and 7 days
    let gamesLast24Hours = 0;
    let gamesLast7Days = 0;

    for (const event of this.recentEvents) {
      if (event.type === 'game_ended') {
        if (event.timestamp >= oneDayAgo) gamesLast24Hours++;
        if (event.timestamp >= sevenDaysAgo) gamesLast7Days++;
      }
    }

    // Games per day (last 14 days)
    const gamesPerDay: Array<{ date: string; count: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const date = getDateString(now - i * 24 * 60 * 60 * 1000);
      const stats = this.dailyStats.get(date);
      gamesPerDay.push({ date, count: stats?.gamesPlayed || 0 });
    }

    // Aggregate device breakdown
    const deviceBreakdown = { mobile: 0, desktop: 0 };
    for (const stats of this.dailyStats.values()) {
      deviceBreakdown.mobile += stats.deviceBreakdown.mobile;
      deviceBreakdown.desktop += stats.deviceBreakdown.desktop;
    }

    // Aggregate country breakdown
    const countryBreakdown: Record<string, number> = {};
    for (const stats of this.dailyStats.values()) {
      for (const [country, count] of Object.entries(stats.countryBreakdown)) {
        countryBreakdown[country] = (countryBreakdown[country] || 0) + count;
      }
    }

    // Aggregate peak hours
    const peakHours: Record<number, number> = {};
    for (const stats of this.dailyStats.values()) {
      for (const [hour, count] of Object.entries(stats.hourlyGames)) {
        const h = parseInt(hour);
        peakHours[h] = (peakHours[h] || 0) + count;
      }
    }

    // Calculate average session duration
    let totalDuration = 0;
    let sessionCount = 0;
    for (const session of this.completedSessions) {
      totalDuration += session.endTime - session.startTime;
      sessionCount++;
    }
    const averageSessionDuration = sessionCount > 0 ? Math.floor(totalDuration / sessionCount / 1000) : 0;

    // Recent sessions (last 20)
    const recentSessions: Array<{
      clientId: string;
      startTime: number;
      endTime: number | null;
      deviceType: 'mobile' | 'desktop';
      country: string | null;
      duration: number;
    }> = [...this.completedSessions]
      .slice(-20)
      .reverse()
      .map((s) => ({
        clientId: s.clientId.slice(0, 12) + '...', // Truncate for privacy
        startTime: s.startTime,
        endTime: s.endTime as number | null,
        deviceType: s.deviceType,
        country: s.country,
        duration: Math.floor((s.endTime - s.startTime) / 1000),
      }));

    // Add active sessions
    for (const session of this.activeSessions.values()) {
      recentSessions.unshift({
        clientId: session.clientId.slice(0, 12) + '...',
        startTime: session.startTime,
        endTime: null,
        deviceType: session.deviceType,
        country: session.country,
        duration: Math.floor((Date.now() - session.startTime) / 1000),
      });
    }

    return {
      activeGames: this.activeGameCount,
      activeSessions: this.activeSessions.size,
      totalGamesPlayed: this.totalGamesPlayed,
      totalUniqueUsers: this.allTimeUniqueUsers.size,
      averageSessionDuration,
      gamesLast24Hours,
      gamesLast7Days,
      gamesPerDay,
      deviceBreakdown,
      countryBreakdown,
      peakHours,
      recentSessions: recentSessions.slice(0, 20),
    };
  }

  getActiveGameCount(): number {
    return this.activeGameCount;
  }

  // Force save (for graceful shutdown)
  async forceSave(): Promise<void> {
    await this.storage.save(this.toPersisted());
  }
}
