import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@fkthepope/shared';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// In production, connect to same origin; in dev, use localhost:3001
const SOCKET_URL = import.meta.env.PROD
  ? window.location.origin
  : (import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001');

let socket: GameSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_BASE = 1000;

// Callbacks for connection state changes
type ConnectionCallback = (connected: boolean, reconnecting?: boolean) => void;
const connectionCallbacks: Set<ConnectionCallback> = new Set();

export function onConnectionChange(callback: ConnectionCallback): () => void {
  connectionCallbacks.add(callback);
  return () => connectionCallbacks.delete(callback);
}

function notifyConnectionChange(connected: boolean, reconnecting = false): void {
  connectionCallbacks.forEach(cb => cb(connected, reconnecting));
}

export function getSocket(): GameSocket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: RECONNECT_DELAY_BASE,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    // Handle reconnection events
    socket.on('connect', () => {
      reconnectAttempts = 0;
      notifyConnectionChange(true);
    });

    socket.on('disconnect', (reason) => {
      notifyConnectionChange(false);

      // If server disconnected us, try to reconnect
      if (reason === 'io server disconnect') {
        socket?.connect();
      }
    });

    socket.io.on('reconnect_attempt', (attempt) => {
      reconnectAttempts = attempt;
      notifyConnectionChange(false, true);
    });

    socket.io.on('reconnect', () => {
      reconnectAttempts = 0;
      notifyConnectionChange(true);

      // Re-join room if we were in one
      const storedRoom = sessionStorage.getItem('fkthepope_room');
      const storedName = sessionStorage.getItem('fkthepope_name');

      if (storedRoom && storedName) {
        socket?.emit('join-lobby', { playerName: storedName });
        // Room rejoin will be handled by the server via session recovery
      }
    });

    socket.io.on('reconnect_failed', () => {
      notifyConnectionChange(false);
    });
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}

export function isConnected(): boolean {
  return socket?.connected ?? false;
}

export function getReconnectAttempts(): number {
  return reconnectAttempts;
}

// Store session info for reconnection
export function storeSession(roomId: string | null, position: string | null, playerName: string): void {
  if (roomId) {
    sessionStorage.setItem('fkthepope_room', roomId);
  } else {
    sessionStorage.removeItem('fkthepope_room');
  }
  if (position) {
    sessionStorage.setItem('fkthepope_position', position);
  } else {
    sessionStorage.removeItem('fkthepope_position');
  }
  sessionStorage.setItem('fkthepope_name', playerName);
}

export function clearSession(): void {
  sessionStorage.removeItem('fkthepope_room');
  sessionStorage.removeItem('fkthepope_position');
  sessionStorage.removeItem('fkthepope_name');
}

export function getStoredSession(): { roomId: string | null; position: string | null; playerName: string | null } {
  return {
    roomId: sessionStorage.getItem('fkthepope_room'),
    position: sessionStorage.getItem('fkthepope_position'),
    playerName: sessionStorage.getItem('fkthepope_name'),
  };
}
