// ============================================
// Core Trading Types for Nexus Exchange
// ============================================

// Market & Trading Pair Types
export interface TradingPair {
  symbol: string;        // e.g., "BTC/USDT"
  baseAsset: string;     // e.g., "BTC"
  quoteAsset: string;    // e.g., "USDT"
  price: number;
  change24h: number;     // Percentage
  high24h: number;
  low24h: number;
  volume24h: number;
  volumeQuote24h: number;
  lastUpdate: number;    // Timestamp
}

// Orderbook Types
export interface OrderbookLevel {
  price: number;
  quantity: number;
  total: number;         // Cumulative quantity
  percentage: number;    // For depth visualization
}

export interface Orderbook {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  spread: number;
  spreadPercentage: number;
  lastUpdate: number;
}

// Trade Types
export interface Trade {
  id: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  timestamp: number;
}

// Order Types
export type OrderType = 'limit' | 'market' | 'stop-limit' | 'stop-market';
export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'open' | 'filled' | 'partially_filled' | 'cancelled';
export type TimeInForce = 'GTC' | 'IOC' | 'FOK';

export interface Order {
  id: string;
  symbol: string;
  type: OrderType;
  side: OrderSide;
  price: number;
  quantity: number;
  filled: number;
  status: OrderStatus;
  timeInForce: TimeInForce;
  createdAt: number;
  updatedAt: number;
}

// Portfolio Types
export interface Balance {
  asset: string;
  free: number;
  locked: number;
  total: number;
  usdValue: number;
}

export interface Portfolio {
  totalValue: number;
  totalChange24h: number;
  balances: Balance[];
}

// User Types
export interface User {
  id: string;
  email: string;
  username: string;
  kycLevel: 0 | 1 | 2 | 3;
  twoFactorEnabled: boolean;
  createdAt: number;
}

export interface Session {
  id: string;
  device: string;
  ip: string;
  location: string;
  lastActive: number;
  current: boolean;
}

// Chart Types
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ChartInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

// WebSocket Message Types
export interface WSMessage<T = unknown> {
  type: string;
  channel: string;
  data: T;
  timestamp: number;
}

export interface WSTickerUpdate {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
}

export interface WSOrderbookUpdate {
  symbol: string;
  bids: [number, number][]; // [price, quantity]
  asks: [number, number][];
}

export interface WSTradeUpdate {
  symbol: string;
  trades: Trade[];
}

// UI Types
export interface MarketCategory {
  id: string;
  name: string;
  pairs: TradingPair[];
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  timestamp: number;
}

// Performance monitoring
export interface PerformanceMetrics {
  fps: number;
  isLowPerformance: boolean;
  shouldReduceAnimations: boolean;
}

