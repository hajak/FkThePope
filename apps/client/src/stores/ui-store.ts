import { create } from 'zustand';
import type { PlayerPosition } from '@fkthepope/shared';

interface UiStore {
  // Connection state
  isConnected: boolean;
  isReconnecting: boolean;
  reconnectAttempts: number;

  // Loading states
  isLoading: boolean;
  loadingMessage: string | null;

  // Modal states
  showRuleCreator: boolean;
  showDevTools: boolean;
  showRulesPanel: boolean;

  // Toast messages
  toastMessage: string | null;
  toastType: 'info' | 'success' | 'error' | 'warning';
  toastTimeoutId: ReturnType<typeof setTimeout> | null;

  // Trick animation
  trickWinner: PlayerPosition | null;
  isAnimatingTrick: boolean;
  trickAnimationTimeoutId: ReturnType<typeof setTimeout> | null;

  // Actions
  setConnectionState: (connected: boolean, reconnecting?: boolean, attempts?: number) => void;
  setLoading: (loading: boolean, message?: string | null) => void;
  setShowRuleCreator: (show: boolean) => void;
  setShowDevTools: (show: boolean) => void;
  setShowRulesPanel: (show: boolean) => void;
  showToast: (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
  hideToast: () => void;
  setTrickWinner: (winner: PlayerPosition | null) => void;
  setIsAnimatingTrick: (animating: boolean) => void;
  startTrickAnimation: (winner: PlayerPosition) => void;
  cleanup: () => void;
}

export const useUiStore = create<UiStore>((set, get) => ({
  // Initial state
  isConnected: false,
  isReconnecting: false,
  reconnectAttempts: 0,
  isLoading: false,
  loadingMessage: null,
  showRuleCreator: false,
  showDevTools: false,
  showRulesPanel: true,
  toastMessage: null,
  toastType: 'info',
  toastTimeoutId: null,
  trickWinner: null,
  isAnimatingTrick: false,
  trickAnimationTimeoutId: null,

  // Actions
  setConnectionState: (connected, reconnecting = false, attempts = 0) =>
    set({ isConnected: connected, isReconnecting: reconnecting, reconnectAttempts: attempts }),

  setLoading: (loading, message = null) =>
    set({ isLoading: loading, loadingMessage: message }),

  setShowRuleCreator: (show) => set({ showRuleCreator: show }),
  setShowDevTools: (show) => set({ showDevTools: show }),
  setShowRulesPanel: (show) => set({ showRulesPanel: show }),

  showToast: (message, type = 'info') => {
    // Clear existing timeout
    const existingTimeout = get().toastTimeoutId;
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeoutId = setTimeout(() => {
      set({ toastMessage: null, toastTimeoutId: null });
    }, 3000);

    set({ toastMessage: message, toastType: type, toastTimeoutId: timeoutId });
  },

  hideToast: () => {
    const existingTimeout = get().toastTimeoutId;
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    set({ toastMessage: null, toastTimeoutId: null });
  },

  setTrickWinner: (winner) => set({ trickWinner: winner }),
  setIsAnimatingTrick: (animating) => set({ isAnimatingTrick: animating }),

  startTrickAnimation: (winner) => {
    // Clear existing animation timeout
    const existingTimeout = get().trickAnimationTimeoutId;
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    set({ trickWinner: winner });

    // Start animation after showing cards
    const timeoutId = setTimeout(() => {
      set({ isAnimatingTrick: true });

      // Clear animation after it completes
      const clearTimeoutId = setTimeout(() => {
        set({ isAnimatingTrick: false, trickWinner: null, trickAnimationTimeoutId: null });
      }, 800);

      set({ trickAnimationTimeoutId: clearTimeoutId });
    }, 1000);

    set({ trickAnimationTimeoutId: timeoutId });
  },

  cleanup: () => {
    const { toastTimeoutId, trickAnimationTimeoutId } = get();
    if (toastTimeoutId) clearTimeout(toastTimeoutId);
    if (trickAnimationTimeoutId) clearTimeout(trickAnimationTimeoutId);
    set({ toastTimeoutId: null, trickAnimationTimeoutId: null });
  },
}));
