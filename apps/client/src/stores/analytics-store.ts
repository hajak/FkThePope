import { create } from 'zustand';

type TimePeriod = '7d' | '30d' | 'all';

interface PeriodStats {
  period: TimePeriod;
  gamesPlayed: number;
  uniqueUsers: number;
  averageSessionDuration: number;
  totalPlayTime: number;
}

interface PlayerStats {
  playerId: string;
  playerName: string;
  firstSeen: number;
  lastSeen: number;
  totalSessions: number;
  totalGamesPlayed: number;
  totalPlayTime: number;
  lastCountry: string | null;
  lastDeviceType: 'mobile' | 'desktop';
}

interface DashboardData {
  activeGames: number;
  activeSessions: number;
  totalGamesPlayed: number;
  totalUniqueUsers: number;
  periodStats: PeriodStats;
  gamesLast24Hours: number;
  gamesLast7Days: number;
  gamesPerDay: Array<{ date: string; count: number }>;
  deviceBreakdown: { mobile: number; desktop: number };
  countryBreakdown: Record<string, number>;
  versionBreakdown: Record<string, number>;
  peakHours: Record<number, number>;
  recentSessions: Array<{
    clientId: string;
    playerName: string | null;
    startTime: number;
    endTime: number | null;
    deviceType: 'mobile' | 'desktop';
    country: string | null;
    duration: number;
  }>;
  players: PlayerStats[];
}

interface AnalyticsStore {
  isAuthenticated: boolean;
  authToken: string | null;
  dashboardData: DashboardData | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: number | null;
  selectedPeriod: TimePeriod;

  login: (password: string) => Promise<boolean>;
  logout: () => void;
  fetchDashboard: (period?: TimePeriod) => Promise<void>;
  setSelectedPeriod: (period: TimePeriod) => void;
  clearError: () => void;
}

// Get API base URL
const getApiUrl = () => {
  if (import.meta.env.PROD) {
    return window.location.origin;
  }
  return import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001';
};

export const useAnalyticsStore = create<AnalyticsStore>((set, get) => ({
  isAuthenticated: false,
  authToken: localStorage.getItem('analytics_token'),
  dashboardData: null,
  isLoading: false,
  error: null,
  lastUpdated: null,
  selectedPeriod: '7d',

  setSelectedPeriod: (period: TimePeriod) => {
    set({ selectedPeriod: period });
    // Fetch dashboard with new period
    get().fetchDashboard(period);
  },

  login: async (password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${getApiUrl()}/api/analytics/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const data = await response.json();
        set({ isLoading: false, error: data.message || 'Login failed' });
        return false;
      }

      const { token } = await response.json();
      localStorage.setItem('analytics_token', token);
      set({ isAuthenticated: true, authToken: token, isLoading: false });
      return true;
    } catch (err) {
      set({ isLoading: false, error: 'Network error' });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('analytics_token');
    set({
      isAuthenticated: false,
      authToken: null,
      dashboardData: null,
      error: null,
    });
  },

  fetchDashboard: async (period?: TimePeriod) => {
    const { authToken, selectedPeriod } = get();
    if (!authToken) {
      set({ error: 'Not authenticated' });
      return;
    }

    const periodToUse = period || selectedPeriod;
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${getApiUrl()}/api/analytics/dashboard?period=${periodToUse}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (response.status === 401) {
        // Token expired or invalid
        localStorage.removeItem('analytics_token');
        set({
          isAuthenticated: false,
          authToken: null,
          isLoading: false,
          error: 'Session expired, please login again',
        });
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const data = await response.json();
      set({
        dashboardData: data,
        isLoading: false,
        lastUpdated: Date.now(),
        isAuthenticated: true,
      });
    } catch (err) {
      set({ isLoading: false, error: 'Failed to load dashboard' });
    }
  },

  clearError: () => set({ error: null }),
}));
