import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { PersistedAnalytics, PlayerData, GameEvent } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const DB_FILE = join(DATA_DIR, 'analytics.db');

export class AnalyticsDatabase {
  private db: Database.Database | null = null;
  private saveInterval: ReturnType<typeof setInterval> | null = null;

  initialize(): PersistedAnalytics {
    // Ensure data directory exists
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }

    // Open database
    this.db = new Database(DB_FILE);
    this.db.pragma('journal_mode = WAL');

    // Create tables
    this.createTables();

    // Load and return current data
    return this.load();
  }

  private createTables(): void {
    if (!this.db) return;

    // Metadata table for aggregate values
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Unique users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS unique_users (
        client_id TEXT PRIMARY KEY
      )
    `);

    // Completed sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT NOT NULL,
        player_name TEXT,
        start_time INTEGER NOT NULL,
        end_time INTEGER NOT NULL,
        device_type TEXT NOT NULL,
        country TEXT,
        games_played INTEGER NOT NULL DEFAULT 0,
        version TEXT NOT NULL DEFAULT 'unknown',
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Create index on sessions for time-based queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_end_time ON sessions(end_time)
    `);

    // Players table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS players (
        player_id TEXT PRIMARY KEY,
        player_name TEXT NOT NULL,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        total_sessions INTEGER NOT NULL DEFAULT 0,
        total_games_played INTEGER NOT NULL DEFAULT 0,
        total_play_time INTEGER NOT NULL DEFAULT 0,
        last_country TEXT,
        last_device_type TEXT NOT NULL DEFAULT 'desktop'
      )
    `);

    // Daily stats table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_stats (
        date TEXT PRIMARY KEY,
        games_played INTEGER NOT NULL DEFAULT 0,
        unique_users TEXT NOT NULL DEFAULT '[]',
        total_session_time INTEGER NOT NULL DEFAULT 0,
        peak_concurrent_games INTEGER NOT NULL DEFAULT 0,
        device_mobile INTEGER NOT NULL DEFAULT 0,
        device_desktop INTEGER NOT NULL DEFAULT 0,
        country_breakdown TEXT NOT NULL DEFAULT '{}',
        hourly_games TEXT NOT NULL DEFAULT '{}'
      )
    `);

    // Game events table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        room_id TEXT NOT NULL,
        player_count INTEGER NOT NULL DEFAULT 0,
        duration INTEGER,
        winner TEXT
      )
    `);

    // Create index on events for time-based queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)
    `);

    // Initialize metadata if not exists
    const totalGames = this.db.prepare('SELECT value FROM metadata WHERE key = ?').get('totalGamesPlayed');
    if (!totalGames) {
      this.db.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)').run('totalGamesPlayed', '0');
      this.db.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)').run('lastSaved', Date.now().toString());
    }

    console.log('[Analytics DB] Tables created/verified');
  }

  private load(): PersistedAnalytics {
    if (!this.db) {
      return this.getDefaultData();
    }

    try {
      // Load metadata
      const totalGamesRow = this.db.prepare('SELECT value FROM metadata WHERE key = ?').get('totalGamesPlayed') as { value: string } | undefined;
      const totalGamesPlayed = totalGamesRow ? parseInt(totalGamesRow.value, 10) : 0;

      // Load unique users
      const uniqueUsersRows = this.db.prepare('SELECT client_id FROM unique_users').all() as { client_id: string }[];
      const allTimeUniqueUsers = uniqueUsersRows.map(r => r.client_id);

      // Load sessions (last 1000)
      const sessionsRows = this.db.prepare(`
        SELECT client_id, player_name, start_time, end_time, device_type, country, games_played, version
        FROM sessions
        ORDER BY end_time DESC
        LIMIT 1000
      `).all() as Array<{
        client_id: string;
        player_name: string | null;
        start_time: number;
        end_time: number;
        device_type: string;
        country: string | null;
        games_played: number;
        version: string;
      }>;

      const completedSessions = sessionsRows.reverse().map(r => ({
        clientId: r.client_id,
        playerName: r.player_name,
        startTime: r.start_time,
        endTime: r.end_time,
        deviceType: r.device_type as 'mobile' | 'desktop',
        country: r.country,
        gamesPlayed: r.games_played,
        version: r.version,
      }));

      // Load players
      const playersRows = this.db.prepare(`
        SELECT player_id, player_name, first_seen, last_seen, total_sessions, total_games_played, total_play_time, last_country, last_device_type
        FROM players
        ORDER BY last_seen DESC
        LIMIT 1000
      `).all() as Array<{
        player_id: string;
        player_name: string;
        first_seen: number;
        last_seen: number;
        total_sessions: number;
        total_games_played: number;
        total_play_time: number;
        last_country: string | null;
        last_device_type: string;
      }>;

      const players: PlayerData[] = playersRows.map(r => ({
        playerId: r.player_id,
        playerName: r.player_name,
        firstSeen: r.first_seen,
        lastSeen: r.last_seen,
        totalSessions: r.total_sessions,
        totalGamesPlayed: r.total_games_played,
        totalPlayTime: r.total_play_time,
        lastCountry: r.last_country,
        lastDeviceType: r.last_device_type as 'mobile' | 'desktop',
      }));

      // Load daily stats (last 90 days)
      const dailyStatsRows = this.db.prepare(`
        SELECT date, games_played, unique_users, total_session_time, peak_concurrent_games,
               device_mobile, device_desktop, country_breakdown, hourly_games
        FROM daily_stats
        ORDER BY date DESC
        LIMIT 90
      `).all() as Array<{
        date: string;
        games_played: number;
        unique_users: string;
        total_session_time: number;
        peak_concurrent_games: number;
        device_mobile: number;
        device_desktop: number;
        country_breakdown: string;
        hourly_games: string;
      }>;

      const dailyStats = dailyStatsRows.reverse().map(r => ({
        date: r.date,
        gamesPlayed: r.games_played,
        uniqueUsers: JSON.parse(r.unique_users) as string[],
        totalSessionTime: r.total_session_time,
        peakConcurrentGames: r.peak_concurrent_games,
        deviceBreakdown: { mobile: r.device_mobile, desktop: r.device_desktop },
        countryBreakdown: JSON.parse(r.country_breakdown) as Record<string, number>,
        hourlyGames: JSON.parse(r.hourly_games) as Record<number, number>,
      }));

      // Load events (last 1000)
      const eventsRows = this.db.prepare(`
        SELECT id, type, timestamp, room_id, player_count, duration, winner
        FROM events
        ORDER BY timestamp DESC
        LIMIT 1000
      `).all() as Array<{
        id: string;
        type: string;
        timestamp: number;
        room_id: string;
        player_count: number;
        duration: number | null;
        winner: string | null;
      }>;

      const recentEvents: GameEvent[] = eventsRows.reverse().map(r => ({
        id: r.id,
        type: r.type as GameEvent['type'],
        timestamp: r.timestamp,
        roomId: r.room_id,
        playerCount: r.player_count,
        duration: r.duration ?? undefined,
        winner: r.winner as GameEvent['winner'],
      }));

      console.log(`[Analytics DB] Loaded ${totalGamesPlayed} total games, ${allTimeUniqueUsers.length} unique users, ${players.length} players`);

      return {
        totalGamesPlayed,
        allTimeUniqueUsers,
        dailyStats,
        completedSessions,
        players,
        recentEvents,
        lastSaved: Date.now(),
      };
    } catch (error) {
      console.error('[Analytics DB] Error loading data:', error);
      return this.getDefaultData();
    }
  }

  save(data: PersistedAnalytics): void {
    if (!this.db) return;

    try {
      // Use a transaction for atomicity
      const transaction = this.db.transaction(() => {
        // Update metadata
        this.db!.prepare('UPDATE metadata SET value = ? WHERE key = ?')
          .run(data.totalGamesPlayed.toString(), 'totalGamesPlayed');
        this.db!.prepare('UPDATE metadata SET value = ? WHERE key = ?')
          .run(Date.now().toString(), 'lastSaved');

        // Sync unique users (insert ignore for new ones)
        const insertUser = this.db!.prepare('INSERT OR IGNORE INTO unique_users (client_id) VALUES (?)');
        for (const userId of data.allTimeUniqueUsers) {
          insertUser.run(userId);
        }

        // Sync sessions - clear and re-insert last 1000
        this.db!.exec('DELETE FROM sessions');
        const insertSession = this.db!.prepare(`
          INSERT INTO sessions (client_id, player_name, start_time, end_time, device_type, country, games_played, version)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const session of data.completedSessions.slice(-1000)) {
          insertSession.run(
            session.clientId,
            session.playerName,
            session.startTime,
            session.endTime,
            session.deviceType,
            session.country,
            session.gamesPlayed,
            session.version
          );
        }

        // Sync players - upsert
        const upsertPlayer = this.db!.prepare(`
          INSERT INTO players (player_id, player_name, first_seen, last_seen, total_sessions, total_games_played, total_play_time, last_country, last_device_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(player_id) DO UPDATE SET
            player_name = excluded.player_name,
            last_seen = excluded.last_seen,
            total_sessions = excluded.total_sessions,
            total_games_played = excluded.total_games_played,
            total_play_time = excluded.total_play_time,
            last_country = excluded.last_country,
            last_device_type = excluded.last_device_type
        `);
        for (const player of data.players) {
          upsertPlayer.run(
            player.playerId,
            player.playerName,
            player.firstSeen,
            player.lastSeen,
            player.totalSessions,
            player.totalGamesPlayed,
            player.totalPlayTime,
            player.lastCountry,
            player.lastDeviceType
          );
        }

        // Sync daily stats - upsert
        const upsertDailyStats = this.db!.prepare(`
          INSERT INTO daily_stats (date, games_played, unique_users, total_session_time, peak_concurrent_games, device_mobile, device_desktop, country_breakdown, hourly_games)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(date) DO UPDATE SET
            games_played = excluded.games_played,
            unique_users = excluded.unique_users,
            total_session_time = excluded.total_session_time,
            peak_concurrent_games = excluded.peak_concurrent_games,
            device_mobile = excluded.device_mobile,
            device_desktop = excluded.device_desktop,
            country_breakdown = excluded.country_breakdown,
            hourly_games = excluded.hourly_games
        `);
        for (const day of data.dailyStats) {
          upsertDailyStats.run(
            day.date,
            day.gamesPlayed,
            JSON.stringify(day.uniqueUsers),
            day.totalSessionTime,
            day.peakConcurrentGames,
            day.deviceBreakdown.mobile,
            day.deviceBreakdown.desktop,
            JSON.stringify(day.countryBreakdown),
            JSON.stringify(day.hourlyGames)
          );
        }

        // Sync events - clear old and insert recent
        this.db!.exec('DELETE FROM events');
        const insertEvent = this.db!.prepare(`
          INSERT INTO events (id, type, timestamp, room_id, player_count, duration, winner)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const event of data.recentEvents.slice(-1000)) {
          insertEvent.run(
            event.id,
            event.type,
            event.timestamp,
            event.roomId,
            event.playerCount,
            event.duration ?? null,
            event.winner ?? null
          );
        }
      });

      transaction();
      console.log(`[Analytics DB] Saved: ${data.totalGamesPlayed} games, ${data.allTimeUniqueUsers.length} users, ${data.players.length} players`);
    } catch (error) {
      console.error('[Analytics DB] Error saving data:', error);
    }
  }

  startAutoSave(getData: () => PersistedAnalytics, intervalMs = 300000): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }

    this.saveInterval = setInterval(() => {
      this.save(getData());
    }, intervalMs);

    console.log(`[Analytics DB] Auto-save enabled every ${intervalMs / 1000}s`);
  }

  stopAutoSave(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
      console.log('[Analytics DB] Auto-save stopped');
    }
  }

  close(): void {
    this.stopAutoSave();
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[Analytics DB] Database closed');
    }
  }

  private getDefaultData(): PersistedAnalytics {
    return {
      totalGamesPlayed: 0,
      allTimeUniqueUsers: [],
      dailyStats: [],
      completedSessions: [],
      players: [],
      recentEvents: [],
      lastSaved: Date.now(),
    };
  }
}
