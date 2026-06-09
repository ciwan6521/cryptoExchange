'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Star,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Volume2,
  Clock,
  ChevronDown,
  MoreHorizontal,
} from 'lucide-react';
import { Header, Sidebar } from '@/components/layout';
import { KycBanner } from '@/components/common/KycBanner';
import { Orderbook, TradingChart, TradingViewChart, toTradingViewSymbol, OrderForm, RecentTrades, TradingErrorBoundary, ConnectionBanner, ConnectionDot } from '@/components/trading';
import { Card, Badge, Skeleton, AnimatedNumber, CoinIcon } from '@/components/ui';
import { useTicker, useTickers } from '@/hooks';
import { formatPrice, formatPercent, formatNumber, cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { useOrderStore } from '@/stores/order-store';
import { useBalanceStore } from '@/stores/balance-store';
import { marketApi } from '@/lib/api';
import { isFavoritePair, toggleFavoritePair } from '@/lib/favorite-pairs';

// ============================================
// Trading Page
// Main exchange trading interface
// NO Three.js - optimized for performance
// ============================================

export default function TradingPage() {
  const params = useParams();
  const pairParam = params.pair as string;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [pairEnabled, setPairEnabled] = useState(true);
  const pairPickerRef = React.useRef<HTMLDivElement>(null);
  const [mobilePanel, setMobilePanel] = useState<'chart' | 'book' | 'trade'>('chart');
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { openOrders, openOrdersLoading, orderHistory, orderHistoryLoading, userTrades, userTradesLoading, fetchOpenOrders, fetchOrderHistory, fetchUserTrades } = useOrderStore();
  const { balances, fetchBalances } = useBalanceStore();
  const [activeTab, setActiveTab] = useState<'open' | 'history' | 'trades'>('open');
  const [chartMode, setChartMode] = useState<'native' | 'tradingview'>('tradingview');
  const [showPairPicker, setShowPairPicker] = useState(false);
  const [bookPrice, setBookPrice] = useState<number | null>(null);
  
  // Parse pair from URL (e.g., "BTC-USDT" -> "BTC/USDT")
  const symbol = useMemo(() => {
    return pairParam?.replace('-', '/') || 'BTC/USDT';
  }, [pairParam]);
  
  const dashSymbol = useMemo(() => pairParam?.toUpperCase() || 'BTC-USDT', [pairParam]);
  const [baseAsset, quoteAsset] = symbol.split('/');

  useEffect(() => {
    setIsFavorite(isFavoritePair(dashSymbol));
  }, [dashSymbol]);

  useEffect(() => {
    marketApi.getPairs()
      .then((res) => {
        const match = res.pairs.find((p) => p.symbol === dashSymbol);
        setPairEnabled(match?.is_enabled ?? true);
      })
      .catch(() => setPairEnabled(true));
  }, [dashSymbol]);

  useEffect(() => {
    if (!showPairPicker) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (pairPickerRef.current && !pairPickerRef.current.contains(event.target as Node)) {
        setShowPairPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPairPicker]);
  
  // Get ticker data
  const ticker = useTicker(symbol);
  const allTickers = useTickers();
  
  // Fetch user orders/trades and balances when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchOpenOrders(dashSymbol);
      fetchBalances();
    }
  }, [isAuthenticated, dashSymbol, fetchOpenOrders, fetchBalances]);

  const handleTabChange = useCallback((tab: 'open' | 'history' | 'trades') => {
    setActiveTab(tab);
    if (!isAuthenticated) return;
    if (tab === 'history') fetchOrderHistory({ symbol: dashSymbol });
    if (tab === 'trades') fetchUserTrades({ symbol: dashSymbol });
  }, [isAuthenticated, dashSymbol, fetchOrderHistory, fetchUserTrades]);
  
  // Real balances for the active trading pair
  const userBaseBalance = useMemo(() => {
    const b = balances.find(x => x.asset === baseAsset);
    return b ? parseFloat(b.available || '0') : 0;
  }, [balances, baseAsset]);
  const userQuoteBalance = useMemo(() => {
    const b = balances.find(x => x.asset === quoteAsset);
    return b ? parseFloat(b.available || '0') : 0;
  }, [balances, quoteAsset]);

  // Loading state
  const isLoading = !ticker;
  
  return (
    <div className="min-h-screen bg-surface-500 flex flex-col">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      {/* Connection status banner */}
      <div className="pt-16">
        <ConnectionBanner />
        <KycBanner action="place orders" />
      </div>
      
      {/* Trading interface */}
      <main id="main-content" className="flex-1 flex flex-col lg:flex-row">
        {/* Left sidebar - Market list */}
        <aside className="hidden xl:block w-64 border-r border-glass-border bg-surface-300/30">
          <div className="p-3 border-b border-glass-border">
            <input
              type="text"
              placeholder="Search markets..."
              className="w-full h-9 px-3 text-sm bg-surface-100 border border-glass-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50"
            />
          </div>
          
          {/* Markets list */}
          <div className="overflow-auto h-[calc(100vh-8rem)]">
            {allTickers.length === 0 ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Skeleton variant="circular" width={24} height={24} />
                    <div className="flex-1">
                      <Skeleton height={14} className="w-16 mb-1" />
                      <Skeleton height={12} className="w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              allTickers.map((pair) => (
                <Link
                  key={pair.symbol}
                  href={`/trade/${pair.baseAsset}-${pair.quoteAsset}`}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors',
                    pair.symbol === symbol && 'bg-white/5'
                  )}
                >
                  <CoinIcon symbol={pair.baseAsset} size={24} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white">
                      {pair.baseAsset}
                      <span className="text-gray-500">/{pair.quoteAsset}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 tabular-nums">
                        {formatPrice(pair.price)}
                      </span>
                      <span className={cn(
                        'text-xs tabular-nums',
                        pair.change24h >= 0 ? 'text-profit' : 'text-loss'
                      )}>
                        {formatPercent(pair.change24h)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </aside>
        
        {/* Main trading area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Pair info header */}
          <div className="h-14 px-4 flex items-center gap-6 border-b border-glass-border bg-surface-300/50">
            {/* Pair selector */}
            <div className="relative z-30" ref={pairPickerRef}>
              <button
                type="button"
                onClick={() => setShowPairPicker((v) => !v)}
                className="flex items-center gap-2 hover:bg-white/5 rounded-lg px-2 py-1 transition-colors min-w-0"
              >
                <CoinIcon symbol={baseAsset} size={32} />
                <div className="text-left min-w-0">
                  <div className="text-sm font-semibold text-white flex items-center gap-1 truncate">
                    {baseAsset}/{quoteAsset}
                    <ChevronDown className={cn('w-3 h-3 text-gray-500 transition-transform shrink-0', showPairPicker && 'rotate-180')} />
                  </div>
                </div>
              </button>
              {showPairPicker && (
                <div className="absolute top-full left-0 mt-1 z-40 w-[min(100vw-2rem,14rem)] max-h-64 overflow-y-auto py-1 bg-surface-200 border border-glass-border rounded-xl shadow-xl">
                  {allTickers.length === 0 ? (
                    <Link
                      href="/markets/spot"
                      onClick={() => setShowPairPicker(false)}
                      className="block px-4 py-2 text-sm text-brand-400 hover:bg-white/5"
                    >
                      Browse all markets →
                    </Link>
                  ) : (
                    allTickers.map((pair) => (
                      <Link
                        key={pair.symbol}
                        href={`/trade/${pair.baseAsset}-${pair.quoteAsset}`}
                        onClick={() => setShowPairPicker(false)}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5 transition-colors',
                          pair.symbol === symbol && 'bg-brand-500/10 text-brand-400',
                        )}
                      >
                        <CoinIcon symbol={pair.baseAsset} size={20} />
                        {pair.baseAsset}/{pair.quoteAsset}
                      </Link>
                    ))
                  )}
                </div>
              )}
            </div>
            
            {/* Favorite button */}
            <button
              onClick={() => {
                toggleFavoritePair(dashSymbol);
                setIsFavorite(isFavoritePair(dashSymbol));
              }}
              className={cn(
                'p-1 rounded transition-colors shrink-0',
                isFavorite ? 'text-yellow-500' : 'text-gray-500 hover:text-gray-300'
              )}
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Star className={cn('w-4 h-4', isFavorite && 'fill-current')} />
            </button>
            
            {/* Price info */}
            <div className="flex items-center gap-6">
              {isLoading ? (
                <>
                  <Skeleton width={100} height={24} />
                  <Skeleton width={60} height={16} />
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <AnimatedNumber
                      value={ticker?.price || 0}
                      decimals={2}
                      prefix="$"
                      className="text-xl font-bold text-white"
                      colored
                    />
                    <span className={cn(
                      'flex items-center text-sm',
                      (ticker?.change24h || 0) >= 0 ? 'text-profit' : 'text-loss'
                    )}>
                      {(ticker?.change24h || 0) >= 0 ? (
                        <ArrowUpRight className="w-4 h-4" />
                      ) : (
                        <ArrowDownRight className="w-4 h-4" />
                      )}
                      {formatPercent(ticker?.change24h || 0)}
                    </span>
                  </div>
                </>
              )}
            </div>
            
            {/* 24h stats */}
            <div className="hidden md:flex items-center gap-6 text-xs text-gray-400 ml-auto">
              <ConnectionDot />
              <div>
                <span className="text-gray-500">24h High</span>
                <span className="ml-2 text-white tabular-nums">
                  {isLoading ? '—' : formatPrice(ticker?.high24h || 0)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">24h Low</span>
                <span className="ml-2 text-white tabular-nums">
                  {isLoading ? '—' : formatPrice(ticker?.low24h || 0)}
                </span>
              </div>
              <div>
                <span className="text-gray-500">24h Vol</span>
                <span className="ml-2 text-white tabular-nums">
                  {isLoading ? '—' : formatNumber(ticker?.volume24h || 0, { compact: true })}
                </span>
              </div>
            </div>
          </div>
          
          {/* Mobile panel tabs */}
          <div className="lg:hidden flex border-b border-glass-border bg-surface-300/50">
            {(['chart', 'book', 'trade'] as const).map((panel) => (
              <button
                key={panel}
                type="button"
                onClick={() => setMobilePanel(panel)}
                className={cn(
                  'flex-1 py-2.5 text-xs font-medium capitalize transition-colors',
                  mobilePanel === panel ? 'text-white border-b-2 border-brand-500' : 'text-gray-500',
                )}
              >
                {panel === 'book' ? 'Order Book' : panel === 'trade' ? 'Trade' : 'Chart'}
              </button>
            ))}
          </div>

          {/* Trading grid — mobile: chart → orderbook → form */}
          <div className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-px bg-glass-border">
            {/* Chart */}
            <div className={cn(
              'lg:col-span-8 bg-surface-400 min-h-[320px] lg:min-h-[400px] flex flex-col',
              mobilePanel !== 'chart' && 'hidden lg:flex',
            )}>
              <div className="flex items-center gap-1 px-3 py-1.5 border-b border-glass-border bg-surface-300/50">
                <button
                  type="button"
                  onClick={() => setChartMode('tradingview')}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                    chartMode === 'tradingview' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300',
                  )}
                >
                  TradingView
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode('native')}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                    chartMode === 'native' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300',
                  )}
                >
                  Native
                </button>
              </div>
              <div className="flex-1 min-h-[360px]">
                <TradingErrorBoundary componentName="Chart">
                  {chartMode === 'tradingview' ? (
                    <TradingViewChart
                      key={dashSymbol}
                      symbol={toTradingViewSymbol(dashSymbol)}
                    />
                  ) : ticker ? (
                    <TradingChart
                      symbol={symbol}
                      basePrice={ticker.price}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-sm text-gray-500">
                      Waiting for market data...
                    </div>
                  )}
                </TradingErrorBoundary>
              </div>
            </div>
            
            {/* Order form — sticky on mobile when trade tab active */}
            <div className={cn(
              'lg:col-span-4 bg-surface-400',
              mobilePanel !== 'trade' && 'hidden lg:block',
              mobilePanel === 'trade' && 'sticky bottom-0 z-20 lg:static',
            )}>
              <TradingErrorBoundary componentName="Order Form">
                {ticker ? (
                  <OrderForm
                    symbol={symbol}
                    baseAsset={baseAsset}
                    quoteAsset={quoteAsset}
                    currentPrice={ticker.price}
                    availableBase={userBaseBalance}
                    availableQuote={userQuoteBalance}
                    bookPrice={bookPrice}
                    pairEnabled={pairEnabled}
                  />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                    <Skeleton width={120} height={24} className="mb-3" />
                    <Skeleton width={200} height={16} className="mb-2" />
                    <p className="text-sm text-gray-500 mt-4">Loading market price...</p>
                    <p className="text-xs text-gray-600 mt-1">Order form will appear when ticker data is ready</p>
                  </div>
                )}
              </TradingErrorBoundary>
            </div>
            
            {/* Orderbook */}
            <div className={cn(
              'lg:col-span-4 bg-surface-400 min-h-[320px] lg:min-h-[400px]',
              mobilePanel !== 'book' && 'hidden lg:block',
            )}>
              <TradingErrorBoundary componentName="Order Book">
                <Orderbook
                  symbol={symbol}
                  onPriceClick={(price) => setBookPrice(price)}
                />
              </TradingErrorBoundary>
            </div>
            
            {/* Recent trades */}
            <div className="lg:col-span-4 bg-surface-400 min-h-[300px]">
              <TradingErrorBoundary componentName="Recent Trades" compact>
                <RecentTrades symbol={symbol} />
              </TradingErrorBoundary>
            </div>
            
            {/* Open orders / Order History / Trade History */}
            <div className="lg:col-span-4 bg-surface-400 min-h-[300px]">
              <div className="h-full flex flex-col">
                <div className="px-3 py-2 border-b border-glass-border flex items-center gap-4">
                  {(['open', 'history', 'trades'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => handleTabChange(tab)}
                      className={cn(
                        'text-sm font-medium transition-colors',
                        activeTab === tab ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                      )}
                    >
                      {tab === 'open' ? `Open Orders (${openOrders.length})` : tab === 'history' ? 'Order History' : 'Trade History'}
                    </button>
                  ))}
                </div>
                
                <div className="flex-1 overflow-auto">
                  {!isAuthenticated ? (
                    <div className="flex-1 flex items-center justify-center p-6">
                      <div className="text-center">
                        <p className="text-sm text-gray-500">Sign in to view your orders</p>
                      </div>
                    </div>
                  ) : activeTab === 'open' ? (
                    openOrdersLoading ? (
                      <div className="p-3 space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="flex gap-2">
                            <Skeleton width={60} height={12} />
                            <Skeleton width={40} height={12} />
                            <Skeleton width={80} height={12} />
                          </div>
                        ))}
                      </div>
                    ) : openOrders.length === 0 ? (
                      <div className="flex-1 flex items-center justify-center p-6">
                        <div className="text-center">
                          <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center mx-auto mb-3">
                            <Clock className="w-6 h-6 text-gray-500" />
                          </div>
                          <p className="text-sm text-gray-500">No open orders</p>
                          <p className="text-xs text-gray-600 mt-1">Place an order to see it here</p>
                        </div>
                      </div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500 border-b border-glass-border">
                            <th className="px-3 py-1.5 text-left">Side</th>
                            <th className="px-3 py-1.5 text-right">Price</th>
                            <th className="px-3 py-1.5 text-right">Qty</th>
                            <th className="px-3 py-1.5 text-right">Filled</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-glass-border">
                          {openOrders.map((o) => {
                            const qty = parseFloat(o.quantity);
                            const filled = parseFloat(o.filled_quantity);
                            return (
                              <tr key={o.id} className="hover:bg-white/[0.02]">
                                <td className={cn('px-3 py-1.5', o.side === 'buy' ? 'text-profit' : 'text-loss')}>
                                  {o.side.toUpperCase()} {o.order_type}
                                </td>
                                <td className="px-3 py-1.5 text-right text-white font-mono">
                                  {o.price ? formatPrice(parseFloat(o.price)) : 'MKT'}
                                </td>
                                <td className="px-3 py-1.5 text-right text-gray-300 font-mono">
                                  {formatNumber(qty, { decimals: 4 })}
                                </td>
                                <td className="px-3 py-1.5 text-right text-gray-500">
                                  {qty > 0 ? ((filled / qty) * 100).toFixed(0) : 0}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )
                  ) : activeTab === 'history' ? (
                    orderHistoryLoading ? (
                      <div className="p-3 space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="flex gap-2"><Skeleton width={60} height={12} /><Skeleton width={80} height={12} /></div>
                        ))}
                      </div>
                    ) : orderHistory.length === 0 ? (
                      <div className="flex items-center justify-center p-6">
                        <p className="text-sm text-gray-500">No order history</p>
                      </div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500 border-b border-glass-border">
                            <th className="px-3 py-1.5 text-left">Side</th>
                            <th className="px-3 py-1.5 text-right">Price</th>
                            <th className="px-3 py-1.5 text-right">Qty</th>
                            <th className="px-3 py-1.5 text-left">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-glass-border">
                          {orderHistory.map((o) => (
                            <tr key={o.id} className="hover:bg-white/[0.02]">
                              <td className={cn('px-3 py-1.5', o.side === 'buy' ? 'text-profit' : 'text-loss')}>
                                {o.side.toUpperCase()}
                              </td>
                              <td className="px-3 py-1.5 text-right text-white font-mono">
                                {o.price ? formatPrice(parseFloat(o.price)) : 'MKT'}
                              </td>
                              <td className="px-3 py-1.5 text-right text-gray-300 font-mono">
                                {formatNumber(parseFloat(o.quantity), { decimals: 4 })}
                              </td>
                              <td className="px-3 py-1.5">
                                <Badge variant={o.status === 'filled' ? 'success' : o.status === 'cancelled' ? 'danger' : 'default'}>
                                  {o.status}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  ) : (
                    userTradesLoading ? (
                      <div className="p-3 space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="flex gap-2"><Skeleton width={60} height={12} /><Skeleton width={80} height={12} /></div>
                        ))}
                      </div>
                    ) : userTrades.length === 0 ? (
                      <div className="flex items-center justify-center p-6">
                        <p className="text-sm text-gray-500">No trade history</p>
                      </div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500 border-b border-glass-border">
                            <th className="px-3 py-1.5 text-left">Side</th>
                            <th className="px-3 py-1.5 text-right">Price</th>
                            <th className="px-3 py-1.5 text-right">Qty</th>
                            <th className="px-3 py-1.5 text-left">Role</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-glass-border">
                          {userTrades.map((t) => (
                            <tr key={t.id} className="hover:bg-white/[0.02]">
                              <td className={cn('px-3 py-1.5', t.side === 'buy' ? 'text-profit' : 'text-loss')}>
                                {t.side.toUpperCase()}
                              </td>
                              <td className="px-3 py-1.5 text-right text-white font-mono">
                                {formatPrice(parseFloat(t.price))}
                              </td>
                              <td className="px-3 py-1.5 text-right text-gray-300 font-mono">
                                {formatNumber(parseFloat(t.quantity), { decimals: 4 })}
                              </td>
                              <td className="px-3 py-1.5">
                                <Badge variant={t.role === 'maker' ? 'brand' : 'default'}>
                                  {t.role}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

