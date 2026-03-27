'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Search, Star } from 'lucide-react';
import { Header, Sidebar } from '@/components/layout';
import { Card, CardHeader, Skeleton, CoinIcon } from '@/components/ui';
import { useTickers } from '@/hooks';
import { formatPrice, formatPercent, formatNumber, cn } from '@/lib/utils';

export default function SpotMarketsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');
  const tickers = useTickers();
  const isLoading = tickers.length === 0;

  const filtered = tickers.filter(
    (t) =>
      t.symbol.toLowerCase().includes(search.toLowerCase()) ||
      t.baseAsset.toLowerCase().includes(search.toLowerCase())
  );

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
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search markets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 pl-10 pr-4 text-sm bg-surface-100 border border-glass-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-brand-500/50"
              />
            </div>
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
                  {isLoading
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
                    : filtered.map((ticker) => (
                        <tr key={ticker.symbol} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
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
                      ))}
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
