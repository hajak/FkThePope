import { create } from 'zustand';

interface DashboardData {
  activeGames: number;
  activeSessions: number;
  totalGamesPlayed: number;
  totalUniqueUsers: number;
  averageSessionDuration: number;
  gamesLast24Hours: number;
  gamesLast7Days: number;
  gamesPerDay: Array<{ date: string; count: number }>;
  deviceBreakdown: { mobile: number; desktop: number };
  countryBreakdown: Record<string, number>;
  peakHours: Record<number, number>;
  recentSessions: Array<{
    clientId: string;
    startTime: number;
    endTime: number | null;
    deviceType: 'mobile' | 'desktop';
    country: string | null;
    duration: number;
  }>;
}

interface AnalyticsStore {
  isAuthenticated: boolean;
  authToken: string | null;
  dashboardData: DashboardData | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: number | null;

  login: (password: string) => Promise<boolean>;
  logout: () => void;
  fetchDashboard: () => Promise<void>;
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

  fetchDashboard: async () => {
    const { authToken } = get();
    if (!authToken) {
      set({ error: 'Not authenticated' });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${getApiUrl()}/api/analytics/dashboard`, {
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
