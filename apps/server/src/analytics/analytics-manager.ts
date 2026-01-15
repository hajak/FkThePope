import { randomBytes, createHash } from 'crypto';
import type { PlayerPosition } from '@fkthepope/shared';
import { AnalyticsDatabase } from './analytics-db.js';
import type {
  SessionData,
  GameEvent,
  DailyStats,
  PersistedAnalytics,
  DashboardResponse,
  PlayerData,
  TimePeriod,
} from './types.js';

// Generate short random ID
function generateId(): string {
  return randomBytes(4).toString('hex');
}

// Generate player ID from IP + name
function generatePlayerId(ip: string, playerName: string): string {
  const normalized = `${ip.toLowerCase()}:${playerName.toLowerCase().trim()}`;
  return createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

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

function getPeriodCutoff(period: TimePeriod): number {
  const now = Date.now();
  switch (period) {
    case '7d':
      return now - 7 * 24 * 60 * 60 * 1000;
    case '30d':
      return now - 30 * 24 * 60 * 60 * 1000;
    case 'all':
    default:
      return 0;
  }
}

export class AnalyticsManager {
  private static instance: AnalyticsManager;

  private storage: AnalyticsDatabase;
  private activeSessions: Map<string, SessionData> = new Map();
  private activeGameCount: number = 0;
  private gameStartTimes: Map<string, number> = new Map();
  private sessionIpMap: Map<string, string> = new Map(); // sessionId -> IP

  // Persisted data
  private totalGamesPlayed: number = 0;
  private allTimeUniqueUsers: Set<string> = new Set();
  private dailyStats: Map<string, DailyStats> = new Map();
  private completedSessions: Array<{
    clientId: string;
    playerName: string | null;
    startTime: number;
    endTime: number;
    deviceType: 'mobile' | 'desktop';
    country: string | null;
    gamesPlayed: number;
    version: string;
  }> = [];
  private players: Map<string, PlayerData> = new Map();
  private recentEvents: GameEvent[] = [];

  private constructor() {
    this.storage = new AnalyticsDatabase();
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

    // Load persisted data from SQLite
    const data = this.storage.initialize();
    this.loadFromPersisted(data);

    // Start auto-save (every 60 seconds for SQLite - it's fast)
    this.storage.startAutoSave(() => this.toPersisted(), 60000);

    // Cleanup stale sessions every minute
    setInterval(() => this.cleanupStaleSessions(), 60000);

    console.log('[Analytics] Initialized with SQLite storage');
  }

  private loadFromPersisted(data: PersistedAnalytics): void {
    this.totalGamesPlayed = data.totalGamesPlayed;
    this.allTimeUniqueUsers = new Set(data.allTimeUniqueUsers);
    this.completedSessions = data.completedSessions.slice(-1000); // Keep last 1000
    this.recentEvents = data.recentEvents.slice(-1000);

    // Load players
    if (data.players) {
      for (const player of data.players) {
        this.players.set(player.playerId, player);
      }
    }

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
      completedSessions: this.completedSessions.slice(-1000).map(s => ({
        ...s,
        playerName: s.playerName ?? null,
        version: s.version ?? 'unknown',
      })),
      players: Array.from(this.players.values()),
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
    ip: string,
    version: string = 'unknown'
  ): void {
    const country = this.resolveCountry(ip);
    const session: SessionData = {
      sessionId,
      clientId,
      playerName: null,
      startTime: Date.now(),
      endTime: null,
      deviceType,
      country,
      gamesPlayed: 0,
      roomsJoined: [],
      version,
    };

    this.activeSessions.set(sessionId, session);
    this.sessionIpMap.set(sessionId, ip);

    // Track unique users
    this.allTimeUniqueUsers.add(clientId);

    // Update daily stats
    const today = this.getOrCreateDailyStats();
    (today.uniqueUsers as Set<string>).add(clientId);
    today.deviceBreakdown[deviceType]++;
    if (country) {
      today.countryBreakdown[country] = (today.countryBreakdown[country] || 0) + 1;
    }

    console.log(`[Analytics] Session started: ${sessionId} (${deviceType}, ${country || 'unknown'}, v${version})`);
  }

  // Update player name when they join lobby
  updateSessionPlayerName(sessionId: string, playerName: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.playerName = playerName;

      // Update or create player record
      const ip = this.sessionIpMap.get(sessionId) || '';
      const playerId = generatePlayerId(ip, playerName);

      let player = this.players.get(playerId);
      if (!player) {
        player = {
          playerId,
          playerName,
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          totalSessions: 0,
          totalGamesPlayed: 0,
          totalPlayTime: 0,
          lastCountry: session.country,
          lastDeviceType: session.deviceType,
        };
        this.players.set(playerId, player);
      }

      player.lastSeen = Date.now();
      player.playerName = playerName; // Update in case casing changed
      player.lastCountry = session.country;
      player.lastDeviceType = session.deviceType;
    }
  }

  endSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.endTime = Date.now();
    const duration = Math.floor((session.endTime - session.startTime) / 1000);

    // Update daily stats with session time
    const today = this.getOrCreateDailyStats();
    today.totalSessionTime += duration;

    // Update player record if we have a player name
    if (session.playerName) {
      const ip = this.sessionIpMap.get(sessionId) || '';
      const playerId = generatePlayerId(ip, session.playerName);
      const player = this.players.get(playerId);
      if (player) {
        player.totalSessions++;
        player.totalPlayTime += duration;
        player.totalGamesPlayed += session.gamesPlayed;
        player.lastSeen = Date.now();
      }
    }

    // Store completed session
    this.completedSessions.push({
      clientId: session.clientId,
      playerName: session.playerName,
      startTime: session.startTime,
      endTime: session.endTime,
      deviceType: session.deviceType,
      country: session.country,
      gamesPlayed: session.gamesPlayed,
      version: session.version,
    });

    // Keep only last 1000 sessions
    if (this.completedSessions.length > 1000) {
      this.completedSessions = this.completedSessions.slice(-1000);
    }

    this.activeSessions.delete(sessionId);
    this.sessionIpMap.delete(sessionId);
    console.log(`[Analytics] Session ended: ${sessionId} (${duration}s, ${session.gamesPlayed} games, player: ${session.playerName || 'unknown'})`);
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
  getDashboardData(period: TimePeriod = '7d'): DashboardResponse {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const periodCutoff = getPeriodCutoff(period);

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

    // Aggregate version breakdown from completed sessions
    const versionBreakdown: Record<string, number> = {};
    for (const session of this.completedSessions) {
      const version = session.version || 'unknown';
      versionBreakdown[version] = (versionBreakdown[version] || 0) + 1;
    }
    // Add active sessions to version breakdown
    for (const session of this.activeSessions.values()) {
      const version = session.version || 'unknown';
      versionBreakdown[version] = (versionBreakdown[version] || 0) + 1;
    }

    // Version usage per day (last 14 days) for stacked chart
    const versionPerDay: Array<{ date: string; versions: Record<string, number> }> = [];
    for (let i = 13; i >= 0; i--) {
      const date = getDateString(now - i * 24 * 60 * 60 * 1000);
      versionPerDay.push({ date, versions: {} });
    }
    // Count sessions per version per day
    for (const session of this.completedSessions) {
      const sessionDate = getDateString(session.startTime);
      const dayEntry = versionPerDay.find(d => d.date === sessionDate);
      if (dayEntry) {
        const version = session.version || 'unknown';
        dayEntry.versions[version] = (dayEntry.versions[version] || 0) + 1;
      }
    }
    // Add active sessions to today's count
    const today = getDateString();
    const todayEntry = versionPerDay.find(d => d.date === today);
    if (todayEntry) {
      for (const session of this.activeSessions.values()) {
        const version = session.version || 'unknown';
        todayEntry.versions[version] = (todayEntry.versions[version] || 0) + 1;
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

    // Calculate period-based stats
    let periodTotalDuration = 0;
    let periodSessionCount = 0;
    let periodGamesPlayed = 0;
    const periodUniqueUsers = new Set<string>();

    for (const session of this.completedSessions) {
      if (session.endTime >= periodCutoff) {
        periodTotalDuration += session.endTime - session.startTime;
        periodSessionCount++;
        periodGamesPlayed += session.gamesPlayed;
        periodUniqueUsers.add(session.clientId);
      }
    }

    const periodAvgSessionDuration = periodSessionCount > 0
      ? Math.floor(periodTotalDuration / periodSessionCount / 1000)
      : 0;

    // Recent sessions (last 20)
    const recentSessions: Array<{
      clientId: string;
      playerName: string | null;
      startTime: number;
      endTime: number | null;
      deviceType: 'mobile' | 'desktop';
      country: string | null;
      duration: number;
    }> = [...this.completedSessions]
      .slice(-20)
      .reverse()
      .map((s) => ({
        clientId: s.clientId.slice(0, 12) + '...',
        playerName: s.playerName,
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
        playerName: session.playerName,
        startTime: session.startTime,
        endTime: null,
        deviceType: session.deviceType,
        country: session.country,
        duration: Math.floor((Date.now() - session.startTime) / 1000),
      });
    }

    // Get player stats sorted by last seen (most recent first)
    const playerStats = Array.from(this.players.values())
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, 100); // Top 100 players

    return {
      activeGames: this.activeGameCount,
      activeSessions: this.activeSessions.size,
      totalGamesPlayed: this.totalGamesPlayed,
      totalUniqueUsers: this.allTimeUniqueUsers.size,
      periodStats: {
        period,
        gamesPlayed: periodGamesPlayed,
        uniqueUsers: periodUniqueUsers.size,
        averageSessionDuration: periodAvgSessionDuration,
        totalPlayTime: Math.floor(periodTotalDuration / 1000),
      },
      gamesLast24Hours,
      gamesLast7Days,
      gamesPerDay,
      deviceBreakdown,
      countryBreakdown,
      versionBreakdown,
      versionPerDay,
      peakHours,
      recentSessions: recentSessions.slice(0, 20),
      players: playerStats,
    };
  }

  getActiveGameCount(): number {
    return this.activeGameCount;
  }

  // Force save (for graceful shutdown)
  forceSave(): void {
    this.storage.save(this.toPersisted());
  }

  // Close database connection (for graceful shutdown)
  close(): void {
    this.storage.close();
  }

  // Error and event logging

  /**
   * Log an error for later debugging
   */
  logError(
    source: string,
    message: string,
    options: {
      level?: 'error' | 'warn' | 'info';
      stack?: string;
      context?: Record<string, unknown>;
      sessionId?: string;
      roomId?: string;
      playerName?: string;
    } = {}
  ): void {
    this.storage.logError({
      level: options.level ?? 'error',
      source,
      message,
      stack: options.stack,
      context: options.context,
      sessionId: options.sessionId,
      roomId: options.roomId,
      playerName: options.playerName,
    });
    console.error(`[${source}] ${message}`, options.context || '');
  }

  /**
   * Log a session event for detailed tracking
   */
  logSessionEvent(
    sessionId: string,
    eventType: string,
    options: {
      roomId?: string;
      playerPosition?: string;
      details?: Record<string, unknown>;
    } = {}
  ): void {
    this.storage.logSessionEvent({
      sessionId,
      eventType,
      roomId: options.roomId,
      playerPosition: options.playerPosition,
      details: options.details,
    });
  }

  /**
   * Get recent error logs
   */
  getErrorLogs(limit: number = 100): Array<{
    id: number;
    timestamp: number;
    level: string;
    source: string;
    message: string;
    stack: string | null;
    context: string | null;
    sessionId: string | null;
    roomId: string | null;
    playerName: string | null;
  }> {
    return this.storage.getErrorLogs(limit);
  }

  /**
   * Get session events for a specific session
   */
  getSessionEvents(sessionId: string, limit: number = 500): Array<{
    id: number;
    timestamp: number;
    eventType: string;
    roomId: string | null;
    playerPosition: string | null;
    details: string | null;
  }> {
    return this.storage.getSessionEvents(sessionId, limit);
  }

  /**
   * Get recent session events (for live debugging)
   */
  getRecentSessionEvents(limit: number = 200): Array<{
    id: number;
    timestamp: number;
    sessionId: string;
    eventType: string;
    roomId: string | null;
    playerPosition: string | null;
    details: string | null;
  }> {
    return this.storage.getRecentSessionEvents(limit);
  }

  /**
   * Cleanup old logs
   */
  cleanupOldLogs(daysToKeep: number = 30): void {
    this.storage.cleanupOldLogs(daysToKeep);
  }
}
