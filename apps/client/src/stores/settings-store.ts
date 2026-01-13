import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CardSize = 'small' | 'large';

interface SettingsStore {
  // Display settings
  cardSize: CardSize;
  animationsEnabled: boolean;

  // Actions
  setCardSize: (size: CardSize) => void;
  setAnimationsEnabled: (enabled: boolean) => void;
  toggleAnimations: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      // Default settings
      cardSize: 'large',
      animationsEnabled: true,

      // Actions
      setCardSize: (size) => set({ cardSize: size }),
      setAnimationsEnabled: (enabled) => set({ animationsEnabled: enabled }),
      toggleAnimations: () => set((state) => ({ animationsEnabled: !state.animationsEnabled })),
    }),
    {
      name: 'whist-settings',
    }
  )
);
