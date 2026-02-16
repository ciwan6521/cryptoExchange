import { create } from 'zustand';
import { tradingApi, ordersApi, type OrderItem, type UserTradeItem, type PlaceOrderRequest, type PlaceOrderResponse, ApiError } from '@/lib/api';

// ============================================
// Order Store — user orders, trades, placement
// Backend is the source of truth for all state.
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

  // Order placement
  placing: boolean;
  placementError: string | null;
  lastPlacement: PlaceOrderResponse | null;

  // Actions
  placeOrder: (data: PlaceOrderRequest) => Promise<PlaceOrderResponse>;
  cancelOrder: (orderId: string) => Promise<void>;
  fetchOpenOrders: (symbol?: string) => Promise<void>;
  fetchOrderHistory: (params?: { symbol?: string; limit?: number; offset?: number }) => Promise<void>;
  fetchUserTrades: (params?: { symbol?: string; limit?: number; offset?: number }) => Promise<void>;
  clear: () => void;
}

export const useOrderStore = create<OrderState>((set, get) => ({
  openOrders: [],
  openOrdersLoading: false,
  openOrdersError: null,

  orderHistory: [],
  orderHistoryTotal: 0,
  orderHistoryLoading: false,

  userTrades: [],
  userTradesTotal: 0,
  userTradesLoading: false,

  placing: false,
  placementError: null,
  lastPlacement: null,

  placeOrder: async (data: PlaceOrderRequest) => {
    set({ placing: true, placementError: null });
    try {
      const res = await ordersApi.place(data);
      set({ lastPlacement: res, placing: false });
      // Refresh open orders after placement
      get().fetchOpenOrders(data.symbol);
      return res;
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : 'Order placement failed';
      set({ placementError: msg, placing: false });
      throw e;
    }
  },

  cancelOrder: async (orderId: string) => {
    try {
      await ordersApi.cancel(orderId);
      // Remove from local open orders immediately
      set((s) => ({
        openOrders: s.openOrders.filter((o) => o.id !== orderId),
      }));
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : 'Cancel failed';
      throw new Error(msg);
    }
  },

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
