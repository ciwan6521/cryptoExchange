import type {
  TradingPair,
  Orderbook,
  OrderbookLevel,
  Trade,
  Balance,
  Order,
  Candle,
  Session,
} from '@/types';
import { generateId } from './utils';

// ============================================
// Mock Trading Data Generator
// Generates realistic market data for the exchange
// ============================================

// Market Data
export const TRADING_PAIRS: TradingPair[] = [
  {
    symbol: 'BTC/USDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    price: 97842.50,
    change24h: 2.34,
    high24h: 98500.00,
    low24h: 95200.00,
    volume24h: 45231.89,
    volumeQuote24h: 4425678234.50,
    lastUpdate: Date.now(),
  },
  {
    symbol: 'ETH/USDT',
    baseAsset: 'ETH',
    quoteAsset: 'USDT',
    price: 3245.80,
    change24h: -1.25,
    high24h: 3320.00,
    low24h: 3180.00,
    volume24h: 234567.45,
    volumeQuote24h: 761234567.80,
    lastUpdate: Date.now(),
  },
  {
    symbol: 'SOL/USDT',
    baseAsset: 'SOL',
    quoteAsset: 'USDT',
    price: 198.45,
    change24h: 5.67,
    high24h: 205.00,
    low24h: 185.50,
    volume24h: 1234567.89,
    volumeQuote24h: 245012345.67,
    lastUpdate: Date.now(),
  },
  {
    symbol: 'XRP/USDT',
    baseAsset: 'XRP',
    quoteAsset: 'USDT',
    price: 2.1845,
    change24h: 3.21,
    high24h: 2.2500,
    low24h: 2.0800,
    volume24h: 89234567.12,
    volumeQuote24h: 194876543.21,
    lastUpdate: Date.now(),
  },
  {
    symbol: 'DOGE/USDT',
    baseAsset: 'DOGE',
    quoteAsset: 'USDT',
    price: 0.3845,
    change24h: -2.15,
    high24h: 0.4020,
    low24h: 0.3750,
    volume24h: 456789012.34,
    volumeQuote24h: 175678901.23,
    lastUpdate: Date.now(),
  },
  {
    symbol: 'AVAX/USDT',
    baseAsset: 'AVAX',
    quoteAsset: 'USDT',
    price: 38.92,
    change24h: 4.56,
    high24h: 40.50,
    low24h: 36.80,
    volume24h: 3456789.12,
    volumeQuote24h: 134567890.12,
    lastUpdate: Date.now(),
  },
  {
    symbol: 'LINK/USDT',
    baseAsset: 'LINK',
    quoteAsset: 'USDT',
    price: 24.56,
    change24h: 1.89,
    high24h: 25.20,
    low24h: 23.80,
    volume24h: 5678901.23,
    volumeQuote24h: 139456789.01,
    lastUpdate: Date.now(),
  },
  {
    symbol: 'DOT/USDT',
    baseAsset: 'DOT',
    quoteAsset: 'USDT',
    price: 7.845,
    change24h: -0.78,
    high24h: 8.120,
    low24h: 7.650,
    volume24h: 12345678.90,
    volumeQuote24h: 96851234.56,
    lastUpdate: Date.now(),
  },
];

// Generate orderbook with realistic spread and depth
export function generateOrderbook(
  basePrice: number,
  levels = 20
): Orderbook {
  const asks: OrderbookLevel[] = [];
  const bids: OrderbookLevel[] = [];
  
  // Determine tick size based on price
  const tickSize = basePrice > 10000 ? 0.1 : basePrice > 100 ? 0.01 : 0.0001;
  const spreadTicks = Math.floor(Math.random() * 3) + 1;
  const spread = tickSize * spreadTicks;
  
  let askTotal = 0;
  let bidTotal = 0;
  
  // Generate asks (selling orders) - ascending price
  for (let i = 0; i < levels; i++) {
    const priceOffset = (i + 1) * tickSize * (1 + Math.random() * 0.5);
    const price = basePrice + spread / 2 + priceOffset;
    const quantity = Math.random() * 5 + 0.1;
    askTotal += quantity;
    
    asks.push({
      price,
      quantity,
      total: askTotal,
      percentage: 0, // Will be calculated after
    });
  }
  
  // Generate bids (buying orders) - descending price
  for (let i = 0; i < levels; i++) {
    const priceOffset = (i + 1) * tickSize * (1 + Math.random() * 0.5);
    const price = basePrice - spread / 2 - priceOffset;
    const quantity = Math.random() * 5 + 0.1;
    bidTotal += quantity;
    
    bids.push({
      price,
      quantity,
      total: bidTotal,
      percentage: 0,
    });
  }
  
  // Calculate percentages for depth visualization
  const maxTotal = Math.max(askTotal, bidTotal);
  asks.forEach(level => (level.percentage = (level.total / maxTotal) * 100));
  bids.forEach(level => (level.percentage = (level.total / maxTotal) * 100));
  
  return {
    asks,
    bids,
    spread,
    spreadPercentage: (spread / basePrice) * 100,
    lastUpdate: Date.now(),
  };
}

// Generate recent trades
export function generateTrades(basePrice: number, count = 50): Trade[] {
  const trades: Trade[] = [];
  let currentTime = Date.now();
  
  for (let i = 0; i < count; i++) {
    const priceVariation = (Math.random() - 0.5) * basePrice * 0.001;
    const side: 'buy' | 'sell' = Math.random() > 0.5 ? 'buy' : 'sell';
    
    trades.push({
      id: generateId(),
      price: basePrice + priceVariation,
      quantity: Math.random() * 2 + 0.01,
      side,
      timestamp: currentTime,
    });
    
    currentTime -= Math.floor(Math.random() * 5000) + 100; // Random interval
  }
  
  return trades;
}

// Generate candlestick data
export function generateCandles(
  basePrice: number,
  interval: number, // in milliseconds
  count = 100
): Candle[] {
  const candles: Candle[] = [];
  let currentPrice = basePrice;
  let currentTime = Date.now() - interval * count;
  
  for (let i = 0; i < count; i++) {
    const volatility = currentPrice * 0.02; // 2% max volatility
    const change = (Math.random() - 0.5) * volatility;
    
    const open = currentPrice;
    const close = currentPrice + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.3;
    const low = Math.min(open, close) - Math.random() * volatility * 0.3;
    const volume = Math.random() * 1000 + 100;
    
    candles.push({
      time: currentTime,
      open,
      high,
      low,
      close,
      volume,
    });
    
    currentPrice = close;
    currentTime += interval;
  }
  
  return candles;
}

// User portfolio
export const MOCK_BALANCES: Balance[] = [
  {
    asset: 'BTC',
    free: 1.23456789,
    locked: 0.05,
    total: 1.28456789,
    usdValue: 125678.90,
  },
  {
    asset: 'ETH',
    free: 15.456789,
    locked: 2.5,
    total: 17.956789,
    usdValue: 58234.56,
  },
  {
    asset: 'USDT',
    free: 45678.90,
    locked: 5000,
    total: 50678.90,
    usdValue: 50678.90,
  },
  {
    asset: 'SOL',
    free: 234.5678,
    locked: 0,
    total: 234.5678,
    usdValue: 46547.23,
  },
  {
    asset: 'XRP',
    free: 12345.6789,
    locked: 1000,
    total: 13345.6789,
    usdValue: 29145.67,
  },
];

// Mock open orders
export const MOCK_ORDERS: Order[] = [
  {
    id: 'ORD-001',
    symbol: 'BTC/USDT',
    type: 'limit',
    side: 'buy',
    price: 95000,
    quantity: 0.5,
    filled: 0,
    status: 'open',
    timeInForce: 'GTC',
    createdAt: Date.now() - 3600000,
    updatedAt: Date.now() - 3600000,
  },
  {
    id: 'ORD-002',
    symbol: 'ETH/USDT',
    type: 'limit',
    side: 'sell',
    price: 3500,
    quantity: 5,
    filled: 2.5,
    status: 'partially_filled',
    timeInForce: 'GTC',
    createdAt: Date.now() - 7200000,
    updatedAt: Date.now() - 1800000,
  },
  {
    id: 'ORD-003',
    symbol: 'SOL/USDT',
    type: 'stop-limit',
    side: 'sell',
    price: 180,
    quantity: 50,
    filled: 0,
    status: 'open',
    timeInForce: 'GTC',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
  },
];

// Mock sessions for security settings
export const MOCK_SESSIONS: Session[] = [
  {
    id: 'sess-001',
    device: 'Chrome on Windows',
    ip: '192.168.1.xxx',
    location: 'New York, US',
    lastActive: Date.now(),
    current: true,
  },
  {
    id: 'sess-002',
    device: 'Safari on iPhone',
    ip: '192.168.1.xxx',
    location: 'New York, US',
    lastActive: Date.now() - 86400000,
    current: false,
  },
  {
    id: 'sess-003',
    device: 'Firefox on MacOS',
    ip: '10.0.0.xxx',
    location: 'Los Angeles, US',
    lastActive: Date.now() - 172800000,
    current: false,
  },
];

// Price update simulator for mock WebSocket
export function simulatePriceUpdate(pair: TradingPair): TradingPair {
  const volatility = pair.price * 0.0005; // 0.05% max change per tick
  const change = (Math.random() - 0.5) * volatility;
  const newPrice = pair.price + change;
  
  // Recalculate 24h change
  const basePrice = pair.price / (1 + pair.change24h / 100);
  const newChange24h = ((newPrice - basePrice) / basePrice) * 100;
  
  return {
    ...pair,
    price: newPrice,
    change24h: newChange24h,
    high24h: Math.max(pair.high24h, newPrice),
    low24h: Math.min(pair.low24h, newPrice),
    lastUpdate: Date.now(),
  };
}

// Orderbook update simulator
export function simulateOrderbookUpdate(orderbook: Orderbook): Orderbook {
  // Randomly update some levels
  const updateCount = Math.floor(Math.random() * 5) + 1;
  
  const newAsks = [...orderbook.asks];
  const newBids = [...orderbook.bids];
  
  for (let i = 0; i < updateCount; i++) {
    const level = Math.floor(Math.random() * newAsks.length);
    newAsks[level] = {
      ...newAsks[level],
      quantity: Math.max(0.01, newAsks[level].quantity + (Math.random() - 0.5) * 0.5),
    };
  }
  
  for (let i = 0; i < updateCount; i++) {
    const level = Math.floor(Math.random() * newBids.length);
    newBids[level] = {
      ...newBids[level],
      quantity: Math.max(0.01, newBids[level].quantity + (Math.random() - 0.5) * 0.5),
    };
  }
  
  // Recalculate totals
  let askTotal = 0;
  let bidTotal = 0;
  
  newAsks.forEach(level => {
    askTotal += level.quantity;
    level.total = askTotal;
  });
  
  newBids.forEach(level => {
    bidTotal += level.quantity;
    level.total = bidTotal;
  });
  
  const maxTotal = Math.max(askTotal, bidTotal);
  newAsks.forEach(level => (level.percentage = (level.total / maxTotal) * 100));
  newBids.forEach(level => (level.percentage = (level.total / maxTotal) * 100));
  
  return {
    ...orderbook,
    asks: newAsks,
    bids: newBids,
    lastUpdate: Date.now(),
  };
}

