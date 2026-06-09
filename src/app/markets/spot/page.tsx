'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Search, Star, AlertTriangle } from 'lucide-react';
import { Header, Sidebar } from '@/components/layout';
import { Card, CardHeader, Skeleton, CoinIcon } from '@/components/ui';
import { useTickers } from '@/hooks';
import { formatPrice, formatPercent, formatNumber, cn } from '@/lib/utils';
import { getFavoritePairs, isFavoritePair, toggleFavoritePair } from '@/lib/favorite-pairs';

function SpotMarketsContent() {
  const searchParams = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteRevision, setFavoriteRevision] = useState(0);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setSearch(q);
  }, [searchParams]);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const tickers = useTickers();
  const isLoading = tickers.length === 0 && !loadTimedOut;

  useEffect(() => {
    if (tickers.length > 0) {
      setLoadTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setLoadTimedOut(true), 10000);
    return () => clearTimeout(timer);
  }, [tickers.length]);

  const filtered = tickers.filter((t) => {
    const pairKey = `${t.baseAsset}-${t.quoteAsset}`;
    const matchesSearch =
      t.symbol.toLowerCase().includes(search.toLowerCase()) ||
      t.baseAsset.toLowerCase().includes(search.toLowerCase());
    const matchesFavorites = !favoritesOnly || isFavoritePair(pairKey);
    return matchesSearch && matchesFavorites;
  });

  const handleToggleFavorite = (pairKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavoritePair(pairKey);
    setFavoriteRevision((v) => v + 1);
  };

  return (
    <div className="min-h-screen bg-surface-500">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main id="main-content" className="pt-16 pb-8 px-4 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="py-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-2xl font-display font-bold text-white mb-1">Spot Markets</h1>
              <p className="text-gray-400">Trade cryptocurrencies at real-time market prices</p>
            </motion.div>
          </div>

          {/* Search */}
          <div className="mb-6 flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search markets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 pl-10 pr-4 text-sm bg-surface-100 border border-glass-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50"
              />
            </div>
            <button
              type="button"
              onClick={() => setFavoritesOnly((v) => !v)}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors',
                favoritesOnly
                  ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400'
                  : 'border-glass-border text-gray-400 hover:text-white',
              )}
            >
              <Star className={cn('w-4 h-4', favoritesOnly && 'fill-current')} />
              Favorites{favoriteRevision >= 0 && getFavoritePairs().length > 0 ? ` (${getFavoritePairs().length})` : ''}
            </button>
          </div>

          {/* Markets table */}
          <Card padding="none">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-glass-border">
                    <th className="px-4 py-3 font-medium">Pair</th>
                    <th className="px-4 py-3 font-medium text-right">Price</th>
                    <th className="px-4 py-3 font-medium text-right">24h Change</th>
                    <th className="px-4 py-3 font-medium text-right">24h Volume</th>
                    <th className="px-4 py-3 font-medium text-right">24h High</th>
                    <th className="px-4 py-3 font-medium text-right">24h Low</th>
                    <th className="px-4 py-3 font-medium text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-glass-border">
                  {loadTimedOut && tickers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-16 text-center">
                        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
                        <p className="text-sm text-red-400 mb-2">Failed to load market data</p>
                        <p className="text-xs text-gray-500 mb-4">Market prices are taking longer than expected.</p>
                        <button
                          onClick={() => {
                            setLoadTimedOut(false);
                            window.location.reload();
                          }}
                          className="text-sm text-brand-400 hover:text-brand-300 underline"
                        >
                          Retry
                        </button>
                      </td>
                    </tr>
                  ) : isLoading
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i}>
                          <td className="px-4 py-3"><Skeleton width={100} height={16} /></td>
                          <td className="px-4 py-3 text-right"><Skeleton width={80} height={16} className="ml-auto" /></td>
                          <td className="px-4 py-3 text-right"><Skeleton width={60} height={16} className="ml-auto" /></td>
                          <td className="px-4 py-3 text-right"><Skeleton width={70} height={16} className="ml-auto" /></td>
                          <td className="px-4 py-3 text-right"><Skeleton width={80} height={16} className="ml-auto" /></td>
                          <td className="px-4 py-3 text-right"><Skeleton width={80} height={16} className="ml-auto" /></td>
                          <td className="px-4 py-3 text-right"><Skeleton width={50} height={28} className="ml-auto" /></td>
                        </tr>
                      ))
                    : filtered.map((ticker) => {
                        const pairKey = `${ticker.baseAsset}-${ticker.quoteAsset}`;
                        const favorited = isFavoritePair(pairKey);
                        return (
                        <tr key={ticker.symbol} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={(e) => handleToggleFavorite(pairKey, e)}
                                className={cn(
                                  'p-1 rounded transition-colors',
                                  favorited ? 'text-yellow-500' : 'text-gray-600 hover:text-gray-400',
                                )}
                                aria-label={favorited ? 'Remove favorite' : 'Add favorite'}
                              >
                                <Star className={cn('w-4 h-4', favorited && 'fill-current')} />
                              </button>
                              <CoinIcon symbol={ticker.baseAsset} size={32} />
                              <div>
                                <span className="font-medium text-white">{ticker.baseAsset}</span>
                                <span className="text-gray-500">/{ticker.quoteAsset}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-sm text-white tabular-nums">
                            {formatPrice(ticker.price)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={cn(
                              'inline-flex items-center gap-0.5 text-sm tabular-nums',
                              ticker.change24h >= 0 ? 'text-profit' : 'text-loss'
                            )}>
                              {ticker.change24h >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                              {formatPercent(ticker.change24h)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-400 tabular-nums">
                            {formatNumber(ticker.volume24h, { compact: true })}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-400 tabular-nums">
                            {formatPrice(ticker.high24h)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-400 tabular-nums">
                            {formatPrice(ticker.low24h)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/trade/${ticker.baseAsset}-${ticker.quoteAsset}`}
                              className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded-lg hover:bg-brand-500/20 transition-colors"
                            >
                              Trade
                            </Link>
                          </td>
                        </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
            {!isLoading && filtered.length === 0 && (
              <div className="py-12 text-center text-gray-500 text-sm">
                No markets found for &ldquo;{search}&rdquo;
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}

export default function SpotMarketsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-surface-500 flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading markets…</div>
      </div>
    }>
      <SpotMarketsContent />
    </Suspense>
  );
}
