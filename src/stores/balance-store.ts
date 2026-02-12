import { create } from 'zustand';
import { balanceApi, type BalanceItem, ApiError } from '@/lib/api';

// ============================================
// Balance Store
// Read-only balances from backend. No local mutations.
// Source of truth: GET /api/balances
// ============================================

interface BalanceState {
  balances: BalanceItem[];
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;

  fetchBalances: () => Promise<void>;
  clear: () => void;
}

export const useBalanceStore = create<BalanceState>()((set, get) => ({
  balances: [],
  isLoading: false,
  error: null,
  lastFetched: null,

  fetchBalances: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await balanceApi.getAll();
      set({
        balances: res.balances,
        lastFetched: Date.now(),
      });
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : 'Failed to load balances';
      set({ error: msg });
    } finally {
      set({ isLoading: false });
    }
  },

  clear: () => set({ balances: [], lastFetched: null, error: null }),
}));
