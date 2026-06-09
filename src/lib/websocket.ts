import type { WSMessage, TradingPair, Orderbook, Trade } from '@/types';
import { generateId } from './utils';
import { isEnabled } from './feature-flags';
import { useTradingStore, type ConnectionStatus } from '@/stores/trading-store';
import { useBalanceStore } from '@/stores/balance-store';
import { useOrderStore } from '@/stores/order-store';

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

  // Real-time market WebSocket connections (one per symbol)
  private marketWs: Map<string, WebSocket> = new Map();
  private marketWsRefCount: Map<string, number> = new Map();

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
    this.marketWs.forEach(ws => {
      try { ws.close(); } catch { /* ignore */ }
    });
    this.marketWs.clear();
    this.marketWsRefCount.clear();
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

    const [type, symbol] = channel.split(':');
    if (isEnabled('ENABLE_REALTIME') && (type === 'orderbook' || type === 'trades')) {
      this._releaseMarketWs(symbol);
    }
  }

  private _getMarketWsUrl(symbol: string): string {
    const dashSymbol = symbol.replace('/', '-');
    const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
    return `${proto}//${host}/ws/market/${encodeURIComponent(dashSymbol)}`;
  }

  private _parseBackendOrderbook(data: { bids?: Array<{ price: string; quantity: string }>; asks?: Array<{ price: string; quantity: string }> }, basePrice: number): Orderbook {
    const rawBids = data.bids || [];
    const rawAsks = data.asks || [];

    const bids = rawBids.map(l => ({
      price: parseFloat(l.price),
      quantity: parseFloat(l.quantity),
      total: parseFloat(l.quantity),
      percentage: 0,
    }));
    const asks = rawAsks.map(l => ({
      price: parseFloat(l.price),
      quantity: parseFloat(l.quantity),
      total: parseFloat(l.quantity),
      percentage: 0,
    }));

    let bidTotal = 0;
    bids.forEach(l => { bidTotal += l.quantity; l.total = bidTotal; });
    let askTotal = 0;
    asks.forEach(l => { askTotal += l.quantity; l.total = askTotal; });

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
    return {
      asks,
      bids,
      spread,
      spreadPercentage: basePrice > 0 ? (spread / basePrice) * 100 : 0,
      lastUpdate: Date.now(),
    };
  }

  private _parseBackendTrades(data: { recent_trades?: Array<{ id: string; price: string; quantity: string; side: string; time?: string }> }): Trade[] {
    return (data.recent_trades || []).map(t => ({
      id: t.id,
      price: parseFloat(t.price),
      quantity: parseFloat(t.quantity),
      side: t.side as 'buy' | 'sell',
      timestamp: t.time ? new Date(t.time).getTime() : Date.now(),
    }));
  }

  private _ensureMarketWs(symbol: string): void {
    const count = this.marketWsRefCount.get(symbol) || 0;
    this.marketWsRefCount.set(symbol, count + 1);
    if (this.marketWs.has(symbol)) return;

    const pair = this.tradingPairs.get(symbol);
    const basePrice = pair?.price || 0;
    const ws = new WebSocket(this._getMarketWsUrl(symbol));

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string);
        if (data.type === 'pong') return;

        const currentPair = this.tradingPairs.get(symbol);
        const price = currentPair?.price || basePrice;

        if (data.bids || data.asks) {
          const ob = this._parseBackendOrderbook(data, price);
          this.orderbooks.set(symbol, ob);
          this._emit(`orderbook:${symbol}`, ob);
        }

        if (data.recent_trades) {
          const trades = this._parseBackendTrades(data);
          this.recentTrades.set(symbol, trades);
          this._emit(`trades:${symbol}`, trades);
        }

        if (data.type === 'trade' && data.trade) {
          const t = data.trade;
          const trade: Trade = {
            id: t.id || generateId(),
            price: parseFloat(t.price),
            quantity: parseFloat(t.quantity),
            side: t.side as 'buy' | 'sell',
            timestamp: t.time ? new Date(t.time).getTime() : Date.now(),
          };
          const existing = this.recentTrades.get(symbol) || [];
          const merged = [trade, ...existing.filter(x => x.id !== trade.id)].slice(0, 100);
          this.recentTrades.set(symbol, merged);
          this._emit(`trades:${symbol}`, [trade]);
        }
      } catch {
        /* ignore malformed messages */
      }
    };

    ws.onclose = () => {
      this.marketWs.delete(symbol);
      if ((this.marketWsRefCount.get(symbol) || 0) > 0 && this.shouldReconnect) {
        setTimeout(() => {
          if ((this.marketWsRefCount.get(symbol) || 0) > 0 && !this.marketWs.has(symbol)) {
            this.marketWsRefCount.set(symbol, (this.marketWsRefCount.get(symbol) || 1) - 1);
            this._ensureMarketWs(symbol);
          }
        }, 2000);
      }
    };

    this.marketWs.set(symbol, ws);
  }

  private _releaseMarketWs(symbol: string): void {
    const count = (this.marketWsRefCount.get(symbol) || 0) - 1;
    if (count <= 0) {
      this.marketWsRefCount.delete(symbol);
      const ws = this.marketWs.get(symbol);
      if (ws) {
        try { ws.close(); } catch { /* ignore */ }
        this.marketWs.delete(symbol);
      }
    } else {
      this.marketWsRefCount.set(symbol, count);
    }
  }

  /**
   * Fetch real orderbook from backend API, then poll for updates.
   * Shows empty book when no real liquidity (no synthetic data).
   */
  private _startOrderbookUpdates(symbol: string): void {
    if (isEnabled('ENABLE_REALTIME') && typeof window !== 'undefined') {
      this._ensureMarketWs(symbol);
      return;
    }

    const channel = `orderbook:${symbol}`;
    const pair = this.tradingPairs.get(symbol);
    if (!pair) return;

    const dashSymbol = symbol.replace('/', '-');

    const emptyOrderbook = (): Orderbook => ({
      asks: [],
      bids: [],
      spread: 0,
      spreadPercentage: 0,
      lastUpdate: Date.now(),
    });

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
      } catch { /* show empty book */ }
      const ob = emptyOrderbook();
      this.orderbooks.set(symbol, ob);
      this._emit(channel, ob);
    };

    fetchAndEmit();
    const interval = setInterval(fetchAndEmit, 2000);
    this.intervals.set(channel, interval);
  }

  /**
   * Fetch real trades from backend, then poll for new ones.
   * No synthetic trades — empty until real executions exist.
   */
  private _startTradeUpdates(symbol: string): void {
    if (isEnabled('ENABLE_REALTIME') && typeof window !== 'undefined') {
      this._ensureMarketWs(symbol);
      return;
    }

    const channel = `trades:${symbol}`;
    const pair = this.tradingPairs.get(symbol);
    if (!pair) return;

    const dashSymbol = symbol.replace('/', '-');

    const fetchRealTrades = async (): Promise<Trade[]> => {
      try {
        const res = await fetch(`/api/trading/trades/${encodeURIComponent(dashSymbol)}?limit=50`);
        if (!res.ok) return [];
        const data = await res.json();
        const trades: any[] = data.trades || [];
        if (trades.length === 0) return [];
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

    const init = async () => {
      const realTrades = await fetchRealTrades();
      this.recentTrades.set(symbol, realTrades);
      this._emit(channel, realTrades);
    };

    init();

    const interval = setInterval(async () => {
      const fresh = await fetchRealTrades();
      if (fresh.length === 0) return;
      const existing = this.recentTrades.get(symbol) || [];
      const existingIds = new Set(existing.map(t => t.id));
      const newTrades = fresh.filter(t => !existingIds.has(t.id));
      if (newTrades.length > 0) {
        const merged = [...newTrades, ...existing].slice(0, 100);
        this.recentTrades.set(symbol, merged);
        this._emit(channel, newTrades);
      }
    }, 3000);

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

// ============================================
// User private WebSocket — balances & open orders
// ============================================

interface UserSnapshotMessage {
  type: 'user_snapshot';
  balances: Array<{ asset: string; available: string; locked: string }>;
  open_orders: Array<{
    id: string;
    symbol: string;
    side: string;
    status: string;
    price: string | null;
    quantity: string;
    remaining: string;
  }>;
}

let userWs: WebSocket | null = null;
let userWsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let userWsShouldConnect = false;

function getUserWsUrl(): string {
  const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
  return `${proto}//${host}/ws/user`;
}

function handleUserSnapshot(data: UserSnapshotMessage): void {
  if (data.type !== 'user_snapshot') return;
  useBalanceStore.getState().updateFromWs(data.balances);
  useOrderStore.getState().updateOpenOrdersFromWs(data.open_orders);
}

function scheduleUserWsReconnect(): void {
  if (!userWsShouldConnect) return;
  if (userWsReconnectTimer) clearTimeout(userWsReconnectTimer);
  userWsReconnectTimer = setTimeout(() => {
    if (userWsShouldConnect) connectUserChannel();
  }, 3000);
}

export function connectUserChannel(): () => void {
  if (typeof window === 'undefined') return () => {};

  userWsShouldConnect = true;

  if (userWs && (userWs.readyState === WebSocket.OPEN || userWs.readyState === WebSocket.CONNECTING)) {
    return disconnectUserChannel;
  }

  const ws = new WebSocket(getUserWsUrl());
  userWs = ws;

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data as string) as UserSnapshotMessage | { type: 'pong' };
      if (data.type === 'pong') return;
      handleUserSnapshot(data as UserSnapshotMessage);
    } catch {
      /* ignore malformed messages */
    }
  };

  ws.onclose = () => {
    userWs = null;
    scheduleUserWsReconnect();
  };

  ws.onerror = () => {
    ws.close();
  };

  return disconnectUserChannel;
}

export function disconnectUserChannel(): void {
  userWsShouldConnect = false;
  if (userWsReconnectTimer) {
    clearTimeout(userWsReconnectTimer);
    userWsReconnectTimer = null;
  }
  if (userWs) {
    try { userWs.close(); } catch { /* ignore */ }
    userWs = null;
  }
}

