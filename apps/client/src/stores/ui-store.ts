import { create } from 'zustand';

interface UiStore {
  // Modal states
  showRuleCreator: boolean;
  showDevTools: boolean;
  showRulesPanel: boolean;

  // Toast messages
  toastMessage: string | null;
  toastType: 'info' | 'success' | 'error' | 'warning';

  // Actions
  setShowRuleCreator: (show: boolean) => void;
  setShowDevTools: (show: boolean) => void;
  setShowRulesPanel: (show: boolean) => void;
  showToast: (message: string, type?: 'info' | 'success' | 'error' | 'warning') => void;
  hideToast: () => void;
}

export const useUiStore = create<UiStore>((set) => ({
  // Initial state
  showRuleCreator: false,
  showDevTools: false,
  showRulesPanel: true,
  toastMessage: null,
  toastType: 'info',

  // Actions
  setShowRuleCreator: (show) => set({ showRuleCreator: show }),
  setShowDevTools: (show) => set({ showDevTools: show }),
  setShowRulesPanel: (show) => set({ showRulesPanel: show }),

  showToast: (message, type = 'info') => {
    set({ toastMessage: message, toastType: type });
    // Auto-hide after 3 seconds
    setTimeout(() => {
      set({ toastMessage: null });
    }, 3000);
  },

  hideToast: () => set({ toastMessage: null }),
}));
