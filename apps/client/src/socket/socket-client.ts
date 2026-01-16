import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@fkthepope/shared';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// App version - must match server's required version
export const APP_VERSION = '1.56';

// In production, connect to same origin; in dev, use localhost:3001
const SOCKET_URL = import.meta.env.PROD
  ? window.location.origin
  : (import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001');

let socket: GameSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_BASE = 1000;

// Generate or retrieve a persistent client ID for analytics
function getClientId(): string {
  let clientId = localStorage.getItem('whist_client_id');
  if (!clientId) {
    clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    localStorage.setItem('whist_client_id', clientId);
  }
  return clientId;
}

// Detect device type from user agent and screen size
function getDeviceType(): 'mobile' | 'desktop' {
  const userAgent = navigator.userAgent.toLowerCase();
  const mobileKeywords = ['android', 'iphone', 'ipad', 'ipod', 'mobile', 'tablet', 'webos', 'blackberry'];
  const isMobileUA = mobileKeywords.some(kw => userAgent.includes(kw));
  const isMobileScreen = window.innerWidth <= 1024 && 'ontouchstart' in window;
  return (isMobileUA || isMobileScreen) ? 'mobile' : 'desktop';
}

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
      auth: {
        clientId: getClientId(),
        deviceType: getDeviceType(),
        version: APP_VERSION,
      },
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
      const session = getStoredSession();
      if (session.roomId && session.playerName && session.position) {
        socket?.emit('join-lobby', { playerName: session.playerName });
        // Try to rejoin the room at the same position
        socket?.emit('rejoin-room', {
          roomId: session.roomId,
          position: session.position as 'north' | 'east' | 'south' | 'west',
          playerName: session.playerName,
        });
      }
    });

    socket.io.on('reconnect_failed', () => {
      notifyConnectionChange(false);
    });

    // Handle version mismatch - clear session and force reload to get latest version
    socket.on('version-mismatch', ({ clientVersion, requiredVersion }) => {
      console.log(`[Socket] Version mismatch: client ${clientVersion}, required ${requiredVersion}`);
      // Clear stored session since old rooms no longer exist after server update
      clearSession();
      // Show alert and reload
      alert(`Your game is outdated (v${clientVersion}). The page will reload to get the latest version (v${requiredVersion}).`);
      window.location.reload();
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

// Store session info for reconnection (use localStorage for persistence)
export function storeSession(roomId: string | null, position: string | null, playerName: string): void {
  if (roomId) {
    localStorage.setItem('whist_room', roomId);
  } else {
    localStorage.removeItem('whist_room');
  }
  if (position) {
    localStorage.setItem('whist_position', position);
  } else {
    localStorage.removeItem('whist_position');
  }
  localStorage.setItem('whist_name', playerName);
}

export function clearSession(): void {
  localStorage.removeItem('whist_room');
  localStorage.removeItem('whist_position');
  localStorage.removeItem('whist_name');
}

export function getStoredSession(): { roomId: string | null; position: string | null; playerName: string | null } {
  return {
    roomId: localStorage.getItem('whist_room'),
    position: localStorage.getItem('whist_position'),
    playerName: localStorage.getItem('whist_name'),
  };
}
