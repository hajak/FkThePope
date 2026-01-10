import { create } from 'zustand';
import type { RoomInfo, PlayerView } from '@fkthepope/shared';

interface LobbyStore {
  // Room list
  rooms: RoomInfo[];

  // Current room
  currentRoom: {
    id: string;
    players: Array<PlayerView | null>;
  } | null;

  // Actions
  setRooms: (rooms: RoomInfo[]) => void;
  setCurrentRoom: (room: { id: string; players: Array<PlayerView | null> } | null) => void;
  updateRoomPlayers: (players: Array<PlayerView | null>) => void;
}

export const useLobbyStore = create<LobbyStore>((set) => ({
  rooms: [],
  currentRoom: null,

  setRooms: (rooms) => set({ rooms }),

  setCurrentRoom: (room) => set({ currentRoom: room }),

  updateRoomPlayers: (players) =>
    set((state) => ({
      currentRoom: state.currentRoom
        ? { ...state.currentRoom, players }
        : null,
    })),
}));
