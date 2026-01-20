import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import type { PlayerPosition, Card, Suit } from '@fkthepope/shared';

// Admin types (mirror server types)
interface AdminPlayerInfo {
  position: PlayerPosition;
  name: string;
  isBot: boolean;
  isConnected: boolean;
  disconnectedAt: number | null;
  socketId: string;
  hand: Card[];
  tricksWon: number;
  version?: string;
  deviceType?: 'mobile' | 'desktop';
}

interface AdminTrickInfo {
  cards: Array<{ card: Card; playedBy: PlayerPosition; faceDown: boolean }>;
  leadSuit: Suit | null;
  trickNumber: number;
  winner?: PlayerPosition;
}

export interface AdminGameInfo {
  roomId: string;
  roomName: string;
  status: 'waiting' | 'playing';
  phase: string;
  players: Record<PlayerPosition, AdminPlayerInfo | null>;
  currentTrick: AdminTrickInfo | null;
  completedTricks: AdminTrickInfo[];
  trumpSuit: Suit | null;
  currentPlayer: PlayerPosition | null;
  scores: Record<PlayerPosition, number>;
  handNumber: number;
  createdAt: number;
}

interface AdminDashboardState {
  rooms: AdminGameInfo[];
  totalConnections: number;
  serverUptime: number;
}

interface AdminStore {
  // Auth state (reuses analytics token)
  isAuthenticated: boolean;
  authToken: string | null;
  isLoading: boolean;
  error: string | null;

  // Socket connection
  socket: Socket | null;
  isConnected: boolean;

  // Admin data
  rooms: AdminGameInfo[];
  selectedRoomId: string | null;
  totalConnections: number;
  serverUptime: number;

  // Actions
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  connect: () => void;
  disconnect: () => void;
  selectRoom: (roomId: string | null) => void;
  killRoom: (roomId: string) => void;
  clearError: () => void;
}

// Get socket URL
const getSocketUrl = () => {
  if (import.meta.env.PROD) {
    return window.location.origin;
  }
  return import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001';
};

// Get API base URL
const getApiUrl = () => {
  if (import.meta.env.PROD) {
    return window.location.origin;
  }
  return import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001';
};

export const useAdminStore = create<AdminStore>((set, get) => ({
  // Initial state
  isAuthenticated: false,
  authToken: localStorage.getItem('analytics_token'), // Reuse analytics token
  isLoading: false,
  error: null,
  socket: null,
  isConnected: false,
  rooms: [],
  selectedRoomId: null,
  totalConnections: 0,
  serverUptime: 0,

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

      // Auto-connect after login
      get().connect();
      return true;
    } catch (err) {
      set({ isLoading: false, error: 'Network error' });
      return false;
    }
  },

  logout: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    localStorage.removeItem('analytics_token');
    set({
      isAuthenticated: false,
      authToken: null,
      socket: null,
      isConnected: false,
      rooms: [],
      selectedRoomId: null,
      error: null,
    });
  },

  connect: () => {
    const { authToken, socket: existingSocket } = get();
    if (!authToken) {
      set({ error: 'Not authenticated' });
      return;
    }

    // Don't create duplicate connections - check both connected AND connecting states
    if (existingSocket) {
      if (existingSocket.connected) {
        // Already connected, just subscribe again to refresh data
        existingSocket.emit('subscribe');
        return;
      }
      // Socket exists but disconnected - disconnect and recreate
      existingSocket.disconnect();
    }

    console.log('[Admin] Creating new socket connection...');

    // Connect to admin namespace
    const socket = io(`${getSocketUrl()}/admin`, {
      auth: { token: authToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    });

    socket.on('connect', () => {
      console.log('[Admin] Connected to admin namespace');
      set({ isConnected: true, error: null, isAuthenticated: true });
      // Subscribe to updates
      socket.emit('subscribe');
    });

    socket.on('connect_error', (err) => {
      console.error('[Admin] Connection error:', err.message);
      if (err.message === 'Unauthorized') {
        // Token invalid - clear auth
        localStorage.removeItem('analytics_token');
        set({
          isAuthenticated: false,
          authToken: null,
          isConnected: false,
          error: 'Session expired, please login again',
        });
      } else {
        set({ error: `Connection error: ${err.message}` });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('[Admin] Disconnected:', reason);
      set({ isConnected: false });
    });

    // Handle admin state updates
    socket.on('admin-state', (data: AdminDashboardState) => {
      console.log('[Admin] Received admin-state:', data.rooms.length, 'rooms');
      set({
        rooms: data.rooms,
        totalConnections: data.totalConnections,
        serverUptime: data.serverUptime,
      });
    });

    socket.on('room-updated', (room: AdminGameInfo) => {
      console.log('[Admin] Room updated:', room.roomId);
      set((state) => ({
        rooms: state.rooms.map((r) =>
          r.roomId === room.roomId ? room : r
        ),
      }));
    });

    socket.on('room-created', (room: AdminGameInfo) => {
      console.log('[Admin] Room created:', room.roomId, room.roomName);
      set((state) => ({
        rooms: [...state.rooms, room],
      }));
    });

    socket.on('room-deleted', ({ roomId }: { roomId: string }) => {
      console.log('[Admin] Room deleted:', roomId);
      set((state) => ({
        rooms: state.rooms.filter((r) => r.roomId !== roomId),
        selectedRoomId: state.selectedRoomId === roomId ? null : state.selectedRoomId,
      }));
    });

    socket.on('error', ({ message }: { message: string }) => {
      set({ error: message });
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false });
    }
  },

  selectRoom: (roomId: string | null) => {
    set({ selectedRoomId: roomId });
  },

  killRoom: (roomId: string) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('kill-room', { roomId });
    }
  },

  clearError: () => set({ error: null }),
}));
