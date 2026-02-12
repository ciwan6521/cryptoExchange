import type { WSMessage, TradingPair, Orderbook, Trade } from '@/types';
import {
  TRADING_PAIRS,
  generateOrderbook,
  generateTrades,
  simulatePriceUpdate,
  simulateOrderbookUpdate,
} from './mock-data';
import { generateId } from './utils';
import { useTradingStore, type ConnectionStatus } from '@/stores/trading-store';

// ============================================
// WebSocket Abstraction Layer
// Resilient mock implementation with:
//   - Auto-reconnect with exponential backoff
//   - Connection state awareness
//   - Data normalization before store injection
//   - Stale-data detection
// Replace mock internals with real WS in production.
// ============================================

type MessageHandler = (message: WSMessage) => void;
type ConnectionHandler = () => void;

interface Subscription {
  channel: string;
  callback: MessageHandler;
}

// Reconnect config
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const RECONNECT_MAX_ATTEMPTS = 20;

class MockWebSocket {
  private subscriptions: Map<string, Set<Subscription>> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private connected = false;
  private onConnectHandlers: Set<ConnectionHandler> = new Set();
  private onDisconnectHandlers: Set<ConnectionHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  
  // Simulated data state
  private tradingPairs: Map<string, TradingPair> = new Map();
  private orderbooks: Map<string, Orderbook> = new Map();
  private recentTrades: Map<string, Trade[]> = new Map();
  
  // Track subscribed channels for re-subscribe on reconnect
  private activeChannels: Set<string> = new Set();
  
  constructor() {
    // Initialize with mock data
    TRADING_PAIRS.forEach(pair => {
      this.tradingPairs.set(pair.symbol, pair);
      this.orderbooks.set(pair.symbol, generateOrderbook(pair.price));
      this.recentTrades.set(pair.symbol, generateTrades(pair.price));
    });
  }
  
  private setStoreStatus(status: ConnectionStatus): void {
    useTradingStore.getState().setConnectionStatus(status);
  }
  
  /**
   * Connect with auto-reconnect support
   */
  connect(): Promise<void> {
    this.shouldReconnect = true;
    this.setStoreStatus('connecting');
    
    return new Promise(resolve => {
      // Simulate connection delay
      setTimeout(() => {
        this.connected = true;
        this.setStoreStatus('connected');
        useTradingStore.getState().setReconnectAttempt(0);
        this.onConnectHandlers.forEach(handler => handler());
        
        // Re-subscribe to previously active channels
        this.activeChannels.forEach(channel => {
          this.startChannelSimulation(channel);
        });
        
        resolve();
      }, 100);
    });
  }
  
  /**
   * Disconnect and stop all simulations
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.connected = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals.clear();
    this.setStoreStatus('disconnected');
    this.onDisconnectHandlers.forEach(handler => handler());
  }
  
  /**
   * Simulate a connection drop (for testing resilience).
   * Triggers auto-reconnect.
   */
  simulateDisconnect(): void {
    this.connected = false;
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals.clear();
    this.setStoreStatus('reconnecting');
    this.onDisconnectHandlers.forEach(handler => handler());
    this.scheduleReconnect();
  }
  
  /**
   * Exponential backoff reconnect
   */
  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    
    const attempt = useTradingStore.getState().reconnectAttempt;
    if (attempt >= RECONNECT_MAX_ATTEMPTS) {
      this.setStoreStatus('disconnected');
      return;
    }
    
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt),
      RECONNECT_MAX_DELAY_MS
    );
    
    useTradingStore.getState().setReconnectAttempt(attempt + 1);
    this.setStoreStatus('reconnecting');
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }
  
  /**
   * Subscribe to a channel. Returns unsubscribe function.
   */
  subscribe(channel: string, callback: MessageHandler): () => void {
    this.activeChannels.add(channel);
    
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
      if (this.connected) {
        this.startChannelSimulation(channel);
      }
    }
    
    const subscription: Subscription = { channel, callback };
    this.subscriptions.get(channel)!.add(subscription);
    
    // Return unsubscribe function
    return () => {
      const subs = this.subscriptions.get(channel);
      if (subs) {
        subs.delete(subscription);
        if (subs.size === 0) {
          this.subscriptions.delete(channel);
          this.activeChannels.delete(channel);
          this.stopChannelSimulation(channel);
        }
      }
    };
  }
  
  /**
   * Event handlers
   */
  onConnect(handler: ConnectionHandler): () => void {
    this.onConnectHandlers.add(handler);
    return () => this.onConnectHandlers.delete(handler);
  }
  
  onDisconnect(handler: ConnectionHandler): () => void {
    this.onDisconnectHandlers.add(handler);
    return () => this.onDisconnectHandlers.delete(handler);
  }
  
  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.connected;
  }
  
  /**
   * Start simulating data for a channel
   */
  private startChannelSimulation(channel: string): void {
    const [type, symbol] = channel.split(':');
    
    switch (type) {
      case 'ticker':
        this.startTickerSimulation(symbol);
        break;
      case 'orderbook':
        this.startOrderbookSimulation(symbol);
        break;
      case 'trades':
        this.startTradesSimulation(symbol);
        break;
      case 'tickers':
        this.startAllTickersSimulation();
        break;
    }
  }
  
  /**
   * Stop simulating data for a channel
   */
  private stopChannelSimulation(channel: string): void {
    const interval = this.intervals.get(channel);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(channel);
    }
  }
  
  /**
   * Emit message to subscribers AND inject normalized data into Zustand store
   */
  private emit(channel: string, data: unknown): void {
    const subs = this.subscriptions.get(channel);
    if (!subs) return;
    
    const [type, symbol] = channel.split(':');
    const store = useTradingStore.getState();
    
    // Normalize and inject into global store
    switch (type) {
      case 'ticker':
        store.updateTicker(symbol, data as TradingPair);
        break;
      case 'tickers':
        store.updateAllTickers(data as TradingPair[]);
        break;
      case 'orderbook':
        store.updateOrderbook(symbol, data as Orderbook);
        break;
      case 'trades':
        store.appendTrades(symbol, data as Trade[]);
        break;
    }
    
    // Also notify direct subscribers (backward compat with existing hooks)
    const message: WSMessage = {
      type,
      channel,
      data,
      timestamp: Date.now(),
    };
    
    subs.forEach(sub => sub.callback(message));
  }
  
  /**
   * Simulate ticker updates for a single pair
   */
  private startTickerSimulation(symbol: string): void {
    const channel = `ticker:${symbol}`;
    
    // Send initial data
    const pair = this.tradingPairs.get(symbol);
    if (pair) {
      this.emit(channel, pair);
    }
    
    // Update every 200-500ms for realistic feel
    const interval = setInterval(() => {
      const currentPair = this.tradingPairs.get(symbol);
      if (currentPair) {
        const updated = simulatePriceUpdate(currentPair);
        this.tradingPairs.set(symbol, updated);
        this.emit(channel, updated);
      }
    }, 200 + Math.random() * 300);
    
    this.intervals.set(channel, interval);
  }
  
  /**
   * Simulate ticker updates for all pairs
   */
  private startAllTickersSimulation(): void {
    const channel = 'tickers:all';
    
    // Send initial data
    this.emit(channel, Array.from(this.tradingPairs.values()));
    
    // Update every 500ms
    const interval = setInterval(() => {
      const pairs: TradingPair[] = [];
      this.tradingPairs.forEach((pair, symbol) => {
        const updated = simulatePriceUpdate(pair);
        this.tradingPairs.set(symbol, updated);
        pairs.push(updated);
      });
      this.emit(channel, pairs);
    }, 500);
    
    this.intervals.set(channel, interval);
  }
  
  /**
   * Simulate orderbook updates
   */
  private startOrderbookSimulation(symbol: string): void {
    const channel = `orderbook:${symbol}`;
    
    // Send initial orderbook
    const orderbook = this.orderbooks.get(symbol);
    if (orderbook) {
      this.emit(channel, orderbook);
    }
    
    // Update every 100ms for real-time feel
    const interval = setInterval(() => {
      const currentOrderbook = this.orderbooks.get(symbol);
      if (currentOrderbook) {
        const updated = simulateOrderbookUpdate(currentOrderbook);
        this.orderbooks.set(symbol, updated);
        this.emit(channel, updated);
      }
    }, 100);
    
    this.intervals.set(channel, interval);
  }
  
  /**
   * Simulate trade updates
   */
  private startTradesSimulation(symbol: string): void {
    const channel = `trades:${symbol}`;
    
    // Send initial trades
    const trades = this.recentTrades.get(symbol);
    if (trades) {
      this.emit(channel, trades.slice(0, 20));
    }
    
    // Generate new trade every 500-2000ms
    const interval = setInterval(() => {
      const pair = this.tradingPairs.get(symbol);
      if (!pair) return;
      
      const newTrade: Trade = {
        id: generateId(),
        price: pair.price + (Math.random() - 0.5) * pair.price * 0.0001,
        quantity: Math.random() * 0.5 + 0.001,
        side: Math.random() > 0.5 ? 'buy' : 'sell',
        timestamp: Date.now(),
      };
      
      const currentTrades = this.recentTrades.get(symbol) || [];
      const updatedTrades = [newTrade, ...currentTrades.slice(0, 99)];
      this.recentTrades.set(symbol, updatedTrades);
      
      this.emit(channel, [newTrade]);
    }, 500 + Math.random() * 1500);
    
    this.intervals.set(channel, interval);
  }
}

// Singleton instance
let wsInstance: MockWebSocket | null = null;

export function getWebSocket(): MockWebSocket {
  if (!wsInstance) {
    wsInstance = new MockWebSocket();
  }
  return wsInstance;
}

export type { MockWebSocket };

