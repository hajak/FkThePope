import { writeFile, readFile, mkdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { PersistedAnalytics } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const DATA_FILE = join(DATA_DIR, 'analytics.json');
const TEMP_FILE = join(DATA_DIR, 'analytics.tmp.json');

function getDefaultData(): PersistedAnalytics {
  return {
    totalGamesPlayed: 0,
    allTimeUniqueUsers: [],
    dailyStats: [],
    completedSessions: [],
    recentEvents: [],
    lastSaved: Date.now(),
  };
}

export class AnalyticsStorage {
  private saveInterval: ReturnType<typeof setInterval> | null = null;

  async initialize(): Promise<PersistedAnalytics> {
    // Ensure data directory exists
    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true });
    }

    // Load existing data or create default
    if (existsSync(DATA_FILE)) {
      try {
        const content = await readFile(DATA_FILE, 'utf-8');
        const data = JSON.parse(content) as PersistedAnalytics;
        console.log(`[Analytics] Loaded ${data.totalGamesPlayed} total games, ${data.allTimeUniqueUsers.length} unique users`);
        return data;
      } catch (error) {
        console.error('[Analytics] Error loading data, starting fresh:', error);
        return getDefaultData();
      }
    }

    console.log('[Analytics] No existing data, starting fresh');
    return getDefaultData();
  }

  async save(data: PersistedAnalytics): Promise<void> {
    try {
      // Update last saved timestamp
      data.lastSaved = Date.now();

      // Atomic write: write to temp file, then rename
      const content = JSON.stringify(data, null, 2);
      await writeFile(TEMP_FILE, content, 'utf-8');
      await rename(TEMP_FILE, DATA_FILE);

      console.log(`[Analytics] Saved data: ${data.totalGamesPlayed} games, ${data.allTimeUniqueUsers.length} users`);
    } catch (error) {
      console.error('[Analytics] Error saving data:', error);
    }
  }

  startAutoSave(getData: () => PersistedAnalytics, intervalMs = 300000): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }

    // Save every 5 minutes by default
    this.saveInterval = setInterval(async () => {
      await this.save(getData());
    }, intervalMs);

    console.log(`[Analytics] Auto-save enabled every ${intervalMs / 1000}s`);
  }

  stopAutoSave(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
      console.log('[Analytics] Auto-save stopped');
    }
  }
}
