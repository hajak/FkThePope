import { create } from 'zustand';
import type { RoomInfo, PlayerView, PendingPlayer, ChatMessage } from '@fkthepope/shared';

interface LobbyStore {
  // Room list
  rooms: RoomInfo[];

  // Current room
  currentRoom: {
    id: string;
    name: string;
    players: Array<PlayerView | null>;
    isHost: boolean;
  } | null;

  // Pending join state (for players waiting for approval)
  pendingJoin: {
    roomId: string;
    roomName: string;
  } | null;

  // Pending players (for hosts to approve/reject)
  pendingPlayers: PendingPlayer[];

  // Chat messages
  chatMessages: ChatMessage[];

  // Actions
  setRooms: (rooms: RoomInfo[]) => void;
  setCurrentRoom: (room: { id: string; name: string; players: Array<PlayerView | null>; isHost: boolean } | null) => void;
  updateRoomPlayers: (players: Array<PlayerView | null>) => void;
  setPendingJoin: (pending: { roomId: string; roomName: string } | null) => void;
  setPendingPlayers: (pending: PendingPlayer[]) => void;
  addPendingPlayer: (pending: PendingPlayer) => void;
  removePendingPlayer: (socketId: string) => void;
  addChatMessage: (message: ChatMessage) => void;
  clearChatMessages: () => void;
}

export const useLobbyStore = create<LobbyStore>((set) => ({
  rooms: [],
  currentRoom: null,
  pendingJoin: null,
  pendingPlayers: [],
  chatMessages: [],

  setRooms: (rooms) => set({ rooms }),

  setCurrentRoom: (room) => set({ currentRoom: room }),

  updateRoomPlayers: (players) =>
    set((state) => ({
      currentRoom: state.currentRoom
        ? { ...state.currentRoom, players }
        : null,
    })),

  setPendingJoin: (pending) => set({ pendingJoin: pending }),

  setPendingPlayers: (pending) => set({ pendingPlayers: pending }),

  addPendingPlayer: (pending) =>
    set((state) => ({
      pendingPlayers: [...state.pendingPlayers, pending],
    })),

  removePendingPlayer: (socketId) =>
    set((state) => ({
      pendingPlayers: state.pendingPlayers.filter((p) => p.socketId !== socketId),
    })),

  addChatMessage: (message) =>
    set((state) => ({
      chatMessages: [...state.chatMessages.slice(-49), message], // Keep last 50 messages
    })),

  clearChatMessages: () => set({ chatMessages: [] }),
}));
