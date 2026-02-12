import { create } from 'zustand';
import { tradingApi, type OrderItem, type UserTradeItem, ApiError } from '@/lib/api';

// ============================================
// Order Store — read-only user orders & trades
// Backend is the source of truth. No mutations.
// ============================================

interface OrderState {
  // Open orders
  openOrders: OrderItem[];
  openOrdersLoading: boolean;
  openOrdersError: string | null;

  // Order history
  orderHistory: OrderItem[];
  orderHistoryTotal: number;
  orderHistoryLoading: boolean;

  // User trades
  userTrades: UserTradeItem[];
  userTradesTotal: number;
  userTradesLoading: boolean;

  // Actions
  fetchOpenOrders: (symbol?: string) => Promise<void>;
  fetchOrderHistory: (params?: { symbol?: string; limit?: number; offset?: number }) => Promise<void>;
  fetchUserTrades: (params?: { symbol?: string; limit?: number; offset?: number }) => Promise<void>;
  clear: () => void;
}

export const useOrderStore = create<OrderState>((set) => ({
  openOrders: [],
  openOrdersLoading: false,
  openOrdersError: null,

  orderHistory: [],
  orderHistoryTotal: 0,
  orderHistoryLoading: false,

  userTrades: [],
  userTradesTotal: 0,
  userTradesLoading: false,

  fetchOpenOrders: async (symbol?: string) => {
    set({ openOrdersLoading: true, openOrdersError: null });
    try {
      const res = await tradingApi.getOpenOrders(symbol);
      set({ openOrders: res.orders, openOrdersLoading: false });
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : 'Failed to load open orders';
      set({ openOrdersError: msg, openOrdersLoading: false });
    }
  },

  fetchOrderHistory: async (params) => {
    set({ orderHistoryLoading: true });
    try {
      const res = await tradingApi.getOrderHistory(params);
      set({ orderHistory: res.orders, orderHistoryTotal: res.total, orderHistoryLoading: false });
    } catch {
      set({ orderHistoryLoading: false });
    }
  },

  fetchUserTrades: async (params) => {
    set({ userTradesLoading: true });
    try {
      const res = await tradingApi.getMyTrades(params);
      set({ userTrades: res.trades, userTradesTotal: res.total, userTradesLoading: false });
    } catch {
      set({ userTradesLoading: false });
    }
  },

  clear: () =>
    set({
      openOrders: [],
      orderHistory: [],
      orderHistoryTotal: 0,
      userTrades: [],
      userTradesTotal: 0,
    }),
}));
