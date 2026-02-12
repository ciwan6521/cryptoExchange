// ============================================
// Trading Store (Zustand)
// Deterministic global state for trading-critical data.
// Separates server state (WS-fed) from UI state.
// All WS data is normalized before injection.
// ============================================

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { TradingPair, Orderbook, Trade, Balance, Order } from '@/types';

// --- Connection state ---
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'delayed';

// --- Store shape ---
export interface TradingState {
  // Connection
  connectionStatus: ConnectionStatus;
  lastDataTimestamp: number;
  reconnectAttempt: number;

  // Market data (server state, WS-fed)
  tickers: Map<string, TradingPair>;
  orderbooks: Map<string, Orderbook>;
  recentTrades: Map<string, Trade[]>;

  // User state
  balances: Balance[];
  openOrders: Order[];

  // UI state (local, not from server)
  activeSymbol: string;
  isMobileTradeRestricted: boolean;

  // --- Actions ---
  setConnectionStatus: (status: ConnectionStatus) => void;
  setReconnectAttempt: (attempt: number) => void;
  updateTicker: (symbol: string, ticker: TradingPair) => void;
  updateAllTickers: (tickers: TradingPair[]) => void;
  updateOrderbook: (symbol: string, orderbook: Orderbook) => void;
  appendTrades: (symbol: string, trades: Trade[]) => void;
  setBalances: (balances: Balance[]) => void;
  setOpenOrders: (orders: Order[]) => void;
  addOrder: (order: Order) => void;
  removeOrder: (orderId: string) => void;
  setActiveSymbol: (symbol: string) => void;
  setMobileTradeRestricted: (restricted: boolean) => void;
  touchDataTimestamp: () => void;
}

// Max trades kept per symbol to prevent memory leaks
const MAX_TRADES_PER_SYMBOL = 100;

// Stale data threshold (ms) — if no update in 10s, data is "delayed"
export const STALE_DATA_THRESHOLD_MS = 10_000;

export const useTradingStore = create<TradingState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    connectionStatus: 'disconnected',
    lastDataTimestamp: 0,
    reconnectAttempt: 0,
    tickers: new Map(),
    orderbooks: new Map(),
    recentTrades: new Map(),
    balances: [],
    openOrders: [],
    activeSymbol: 'BTC/USDT',
    isMobileTradeRestricted: false,

    // --- Connection actions ---
    setConnectionStatus: (status) => set({ connectionStatus: status }),
    setReconnectAttempt: (attempt) => set({ reconnectAttempt: attempt }),

    // --- Market data actions ---
    // Each setter creates a new Map reference so React picks up the change.
    updateTicker: (symbol, ticker) =>
      set((state) => {
        const next = new Map(state.tickers);
        next.set(symbol, ticker);
        return { tickers: next, lastDataTimestamp: Date.now() };
      }),

    updateAllTickers: (tickers) =>
      set((state) => {
        const next = new Map(state.tickers);
        for (const t of tickers) {
          next.set(t.symbol, t);
        }
        return { tickers: next, lastDataTimestamp: Date.now() };
      }),

    updateOrderbook: (symbol, orderbook) =>
      set((state) => {
        const next = new Map(state.orderbooks);
        next.set(symbol, orderbook);
        return { orderbooks: next, lastDataTimestamp: Date.now() };
      }),

    appendTrades: (symbol, trades) =>
      set((state) => {
        const next = new Map(state.recentTrades);
        const existing = next.get(symbol) || [];
        // Prepend new trades, deduplicate by id, cap at MAX
        const merged = [...trades, ...existing];
        const seen = new Set<string>();
        const deduped = merged.filter((t) => {
          if (seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        });
        next.set(symbol, deduped.slice(0, MAX_TRADES_PER_SYMBOL));
        return { recentTrades: next, lastDataTimestamp: Date.now() };
      }),

    // --- User actions ---
    setBalances: (balances) => set({ balances }),
    setOpenOrders: (orders) => set({ openOrders: orders }),
    addOrder: (order) =>
      set((state) => ({ openOrders: [order, ...state.openOrders] })),
    removeOrder: (orderId) =>
      set((state) => ({
        openOrders: state.openOrders.filter((o) => o.id !== orderId),
      })),

    // --- UI actions ---
    setActiveSymbol: (symbol) => set({ activeSymbol: symbol }),
    setMobileTradeRestricted: (restricted) =>
      set({ isMobileTradeRestricted: restricted }),
    touchDataTimestamp: () => set({ lastDataTimestamp: Date.now() }),
  }))
);

// --- Selectors (for fine-grained subscriptions) ---

export const selectTicker = (symbol: string) => (state: TradingState) =>
  state.tickers.get(symbol) ?? null;

export const selectOrderbook = (symbol: string) => (state: TradingState) =>
  state.orderbooks.get(symbol) ?? null;

export const selectTrades = (symbol: string) => (state: TradingState) =>
  state.recentTrades.get(symbol) ?? [];

export const selectAllTickers = (state: TradingState): TradingPair[] =>
  Array.from(state.tickers.values());

export const selectConnectionStatus = (state: TradingState) =>
  state.connectionStatus;

export const selectIsDataStale = (state: TradingState) =>
  state.lastDataTimestamp > 0 &&
  Date.now() - state.lastDataTimestamp > STALE_DATA_THRESHOLD_MS;
