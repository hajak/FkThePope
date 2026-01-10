import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@fkthepope/shared';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// In production, connect to same origin; in dev, use localhost:3001
const SOCKET_URL = import.meta.env.PROD
  ? window.location.origin
  : (import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001');

let socket: GameSocket | null = null;

export function getSocket(): GameSocket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
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
