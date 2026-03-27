import type { WSMessage, TradingPair, Orderbook, Trade } from '@/types';
import { generateId } from './utils';
import { useTradingStore, type ConnectionStatus } from '@/stores/trading-store';

// ============================================
// WebSocket Abstraction Layer
// Fetches REAL prices from backend /api/market/tickers
// which proxies to Binance public API.
// Uses polling (5s) for ticker data.
// Orderbook and trades come from backend WS when available,
// with generated placeholders for visual continuity.
// ============================================

type MessageHandler = (message: WSMessage) => void;
type ConnectionHandler = () => void;

interface Subscription {
  channel: string;
  callback: MessageHandler;
}

// Polling config
const TICKER_POLL_INTERVAL_MS = 5000;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const RECONNECT_MAX_ATTEMPTS = 20;

// Trading pairs derived from backend tickers
const QUOTE_ASSET = 'USDT';

class ExchangeWebSocket {
  private subscriptions: Map<string, Set<Subscription>> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private connected = false;
  private onConnectHandlers: Set<ConnectionHandler> = new Set();
  private onDisconnectHandlers: Set<ConnectionHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;

  // Real data state
  private tradingPairs: Map<string, TradingPair> = new Map();
  private orderbooks: Map<string, Orderbook> = new Map();
  private recentTrades: Map<string, Trade[]> = new Map();

  // Track subscribed channels for re-subscribe on reconnect
  private activeChannels: Set<string> = new Set();

  private setStoreStatus(status: ConnectionStatus): void {
    useTradingStore.getState().setConnectionStatus(status);
  }

  /**
   * Connect — fetches initial data from backend, starts polling
   */
  async connect(): Promise<void> {
    this.shouldReconnect = true;
    this.setStoreStatus('connecting');

    try {
      await this._fetchTickersFromBackend();
      this.connected = true;
      this.setStoreStatus('connected');
      useTradingStore.getState().setReconnectAttempt(0);
      this.onConnectHandlers.forEach(handler => handler());

      // Start ticker polling
      this._startTickerPolling();

      // Re-subscribe to previously active channels
      this.activeChannels.forEach(channel => {
        this._startChannelData(channel);
      });
    } catch (err) {
      console.warn('ExchangeWebSocket connect failed:', err);
      this.setStoreStatus('reconnecting');
      this.scheduleReconnect();
    }
  }

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

  subscribe(channel: string, callback: MessageHandler): () => void {
    this.activeChannels.add(channel);

    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
      if (this.connected) {
        this._startChannelData(channel);
      }
    }

    const subscription: Subscription = { channel, callback };
    this.subscriptions.get(channel)!.add(subscription);

    return () => {
      const subs = this.subscriptions.get(channel);
      if (subs) {
        subs.delete(subscription);
        if (subs.size === 0) {
          this.subscriptions.delete(channel);
          this.activeChannels.delete(channel);
          this._stopChannelData(channel);
        }
      }
    };
  }

  onConnect(handler: ConnectionHandler): () => void {
    this.onConnectHandlers.add(handler);
    return () => this.onConnectHandlers.delete(handler);
  }

  onDisconnect(handler: ConnectionHandler): () => void {
    this.onDisconnectHandlers.add(handler);
    return () => this.onDisconnectHandlers.delete(handler);
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ------------------------------------------------------------------
  // Real data fetching from backend
  // ------------------------------------------------------------------

  private async _fetchTickersFromBackend(): Promise<void> {
    const res = await fetch('/api/market/tickers');
    if (!res.ok) throw new Error(`Backend tickers failed: ${res.status}`);
    const data = await res.json();
    const tickers: Record<string, any> = data.tickers || {};

    for (const [symbol, ticker] of Object.entries(tickers)) {
      if (symbol === 'USDT') continue; // Skip USDT as a trading pair
      const pairSymbol = `${symbol}/${QUOTE_ASSET}`;
      const price = parseFloat((ticker as any).price) || 0;
      const changePercent = parseFloat((ticker as any).change) || 0;
      const high = parseFloat((ticker as any).high) || 0;
      const low = parseFloat((ticker as any).low) || 0;
      const volume = parseFloat((ticker as any).volume) || 0;
      const quoteVolume = parseFloat((ticker as any).quoteVolume) || 0;

      const pair: TradingPair = {
        symbol: pairSymbol,
        baseAsset: symbol,
        quoteAsset: QUOTE_ASSET,
        price,
        change24h: changePercent,
        high24h: high,
        low24h: low,
        volume24h: volume,
        volumeQuote24h: quoteVolume,
        lastUpdate: Date.now(),
      };
      this.tradingPairs.set(pairSymbol, pair);
    }
  }

  private _startTickerPolling(): void {
    const key = '_ticker_poll';
    if (this.intervals.has(key)) return;

    const poll = async () => {
      try {
        await this._fetchTickersFromBackend();

        // Emit to all ticker subscribers
        const allPairs = Array.from(this.tradingPairs.values());
        this._emit('tickers:all', allPairs);

        // Emit individual ticker updates
        for (const pair of allPairs) {
          this._emit(`ticker:${pair.symbol}`, pair);
        }
      } catch (err) {
        console.warn('Ticker poll failed:', err);
      }
    };

    const interval = setInterval(poll, TICKER_POLL_INTERVAL_MS);
    this.intervals.set(key, interval);
  }

  // ------------------------------------------------------------------
  // Channel management
  // ------------------------------------------------------------------

  private _startChannelData(channel: string): void {
    const [type, symbol] = channel.split(':');

    switch (type) {
      case 'ticker': {
        const pair = this.tradingPairs.get(symbol);
        if (pair) this._emit(channel, pair);
        break;
      }
      case 'tickers':
        this._emit(channel, Array.from(this.tradingPairs.values()));
        break;
      case 'orderbook':
        this._startOrderbookUpdates(symbol);
        break;
      case 'trades':
        this._startTradeUpdates(symbol);
        break;
    }
  }

  private _stopChannelData(channel: string): void {
    const interval = this.intervals.get(channel);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(channel);
    }
  }

  /**
   * Fetch real orderbook from backend API, then poll for updates.
   * Falls back to price-derived synthetic orderbook if backend returns empty data.
   */
  private _startOrderbookUpdates(symbol: string): void {
    const channel = `orderbook:${symbol}`;
    const pair = this.tradingPairs.get(symbol);
    if (!pair) return;

    const dashSymbol = symbol.replace('/', '-');

    const generateSyntheticOB = (basePrice: number): Orderbook => {
      const asks: { price: number; quantity: number; total: number; percentage: number }[] = [];
      const bids: { price: number; quantity: number; total: number; percentage: number }[] = [];
      const tickSize = basePrice > 10000 ? 0.01 : basePrice > 100 ? 0.01 : 0.0001;
      const spread = tickSize * (Math.floor(Math.random() * 3) + 1);
      let askTotal = 0, bidTotal = 0;

      for (let i = 0; i < 20; i++) {
        const offset = (i + 1) * tickSize * (1 + Math.random() * 0.5);
        const aq = Math.random() * 5 + 0.1;
        askTotal += aq;
        asks.push({ price: basePrice + spread / 2 + offset, quantity: aq, total: askTotal, percentage: 0 });
        const bq = Math.random() * 5 + 0.1;
        bidTotal += bq;
        bids.push({ price: basePrice - spread / 2 - offset, quantity: bq, total: bidTotal, percentage: 0 });
      }
      const max = Math.max(askTotal, bidTotal);
      asks.forEach(l => (l.percentage = (l.total / max) * 100));
      bids.forEach(l => (l.percentage = (l.total / max) * 100));
      return { asks, bids, spread, spreadPercentage: (spread / basePrice) * 100, lastUpdate: Date.now() };
    };

    const parseBackendOB = (data: any, basePrice: number): Orderbook | null => {
      const rawBids: any[] = data.bids || [];
      const rawAsks: any[] = data.asks || [];
      if (rawBids.length === 0 && rawAsks.length === 0) return null;

      const bids = rawBids.map(l => ({
        price: parseFloat(l.price),
        quantity: parseFloat(l.quantity),
        total: parseFloat(l.total),
        percentage: 0,
      }));
      const asks = rawAsks.map(l => ({
        price: parseFloat(l.price),
        quantity: parseFloat(l.quantity),
        total: parseFloat(l.total),
        percentage: 0,
      }));

      const maxTotal = Math.max(
        bids.length > 0 ? bids[bids.length - 1].total : 0,
        asks.length > 0 ? asks[asks.length - 1].total : 0,
      );
      if (maxTotal > 0) {
        bids.forEach(l => (l.percentage = (l.total / maxTotal) * 100));
        asks.forEach(l => (l.percentage = (l.total / maxTotal) * 100));
      }

      const bestBid = bids.length > 0 ? bids[0].price : basePrice;
      const bestAsk = asks.length > 0 ? asks[0].price : basePrice;
      const spread = bestAsk - bestBid;
      return { asks, bids, spread, spreadPercentage: basePrice > 0 ? (spread / basePrice) * 100 : 0, lastUpdate: Date.now() };
    };

    const fetchAndEmit = async () => {
      const currentPair = this.tradingPairs.get(symbol);
      const price = currentPair?.price || pair.price;
      try {
        const res = await fetch(`/api/trading/orderbook/${encodeURIComponent(dashSymbol)}?limit=25`);
        if (res.ok) {
          const data = await res.json();
          const ob = parseBackendOB(data, price);
          if (ob) {
            this.orderbooks.set(symbol, ob);
            this._emit(channel, ob);
            return;
          }
        }
      } catch { /* fall through to synthetic */ }
      const ob = generateSyntheticOB(price);
      this.orderbooks.set(symbol, ob);
      this._emit(channel, ob);
    };

    fetchAndEmit();
    const interval = setInterval(fetchAndEmit, 2000);
    this.intervals.set(channel, interval);
  }

  /**
   * Fetch real trades from backend, then poll for new ones.
   * Falls back to synthetic trades if backend returns empty.
   */
  private _startTradeUpdates(symbol: string): void {
    const channel = `trades:${symbol}`;
    const pair = this.tradingPairs.get(symbol);
    if (!pair) return;

    const dashSymbol = symbol.replace('/', '-');
    let hasRealData = false;

    const fetchRealTrades = async (): Promise<Trade[]> => {
      try {
        const res = await fetch(`/api/trading/trades/${encodeURIComponent(dashSymbol)}?limit=50`);
        if (!res.ok) return [];
        const data = await res.json();
        const trades: any[] = data.trades || [];
        if (trades.length === 0) return [];
        hasRealData = true;
        return trades.map((t: any) => ({
          id: t.id,
          price: parseFloat(t.price),
          quantity: parseFloat(t.quantity),
          side: t.side as 'buy' | 'sell',
          timestamp: new Date(t.executed_at).getTime(),
        }));
      } catch {
        return [];
      }
    };

    const generateSyntheticTrades = (): Trade[] => {
      const initial: Trade[] = [];
      let t = Date.now();
      for (let i = 0; i < 20; i++) {
        const currentPair = this.tradingPairs.get(symbol);
        const baseP = currentPair?.price || pair.price;
        initial.push({
          id: generateId(),
          price: baseP + (Math.random() - 0.5) * baseP * 0.001,
          quantity: Math.random() * 2 + 0.01,
          side: Math.random() > 0.5 ? 'buy' : 'sell',
          timestamp: t,
        });
        t -= Math.floor(Math.random() * 5000) + 100;
      }
      return initial;
    };

    const init = async () => {
      const realTrades = await fetchRealTrades();
      if (realTrades.length > 0) {
        this.recentTrades.set(symbol, realTrades);
        this._emit(channel, realTrades);
      } else {
        const synth = generateSyntheticTrades();
        this.recentTrades.set(symbol, synth);
        this._emit(channel, synth);
      }
    };

    init();

    const interval = setInterval(async () => {
      if (hasRealData) {
        const fresh = await fetchRealTrades();
        if (fresh.length > 0) {
          const existing = this.recentTrades.get(symbol) || [];
          const existingIds = new Set(existing.map(t => t.id));
          const newTrades = fresh.filter(t => !existingIds.has(t.id));
          if (newTrades.length > 0) {
            const merged = [...newTrades, ...existing].slice(0, 100);
            this.recentTrades.set(symbol, merged);
            this._emit(channel, newTrades);
          }
        }
      } else {
        const currentPair = this.tradingPairs.get(symbol);
        if (!currentPair) return;
        const trade: Trade = {
          id: generateId(),
          price: currentPair.price + (Math.random() - 0.5) * currentPair.price * 0.0001,
          quantity: Math.random() * 0.5 + 0.001,
          side: Math.random() > 0.5 ? 'buy' : 'sell',
          timestamp: Date.now(),
        };
        const trades = this.recentTrades.get(symbol) || [];
        this.recentTrades.set(symbol, [trade, ...trades.slice(0, 99)]);
        this._emit(channel, [trade]);
      }
    }, hasRealData ? 3000 : 800 + Math.random() * 1200);

    this.intervals.set(channel, interval);
  }

  // ------------------------------------------------------------------
  // Emit
  // ------------------------------------------------------------------

  private _emit(channel: string, data: unknown): void {
    const subs = this.subscriptions.get(channel);
    const [type, symbol] = channel.split(':');
    const store = useTradingStore.getState();

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

    if (!subs) return;
    const message: WSMessage = { type, channel, data, timestamp: Date.now() };
    subs.forEach(sub => sub.callback(message));
  }
}

// Singleton instance
let wsInstance: ExchangeWebSocket | null = null;

export function getWebSocket(): ExchangeWebSocket {
  if (!wsInstance) {
    wsInstance = new ExchangeWebSocket();
  }
  return wsInstance;
}

export type { ExchangeWebSocket };

