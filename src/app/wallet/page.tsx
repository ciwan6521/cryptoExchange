'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Wallet,
  Eye,
  EyeOff,
  RefreshCw,
  TrendingUp,
  ArrowRightLeft,
  AlertCircle,
} from 'lucide-react';
import { Header, Sidebar } from '@/components/layout';
import { Card, Button, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { walletApi, type WalletAsset } from '@/lib/api';

// Coin color mapping for visual distinction
const COIN_COLORS: Record<string, string> = {
  BTC: 'from-orange-400 to-orange-600',
  ETH: 'from-blue-400 to-blue-600',
  BNB: 'from-yellow-400 to-yellow-600',
  SOL: 'from-purple-400 to-purple-600',
  XRP: 'from-gray-300 to-gray-500',
  ADA: 'from-blue-300 to-blue-500',
  DOGE: 'from-amber-300 to-amber-500',
  TRX: 'from-red-400 to-red-600',
  USDT: 'from-emerald-400 to-emerald-600',
};

function formatUsd(value: string | null): string {
  if (!value) return '—';
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function formatPrice(value: string | null): string {
  if (!value) return '—';
  const num = parseFloat(value);
  if (isNaN(num)) return '—';
  const decimals = num >= 100 ? 2 : num >= 1 ? 4 : num >= 0.01 ? 6 : 8;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

function formatBalance(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return '0';
  if (num >= 1) return num.toLocaleString('en-US', { maximumFractionDigits: 6 });
  return num.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

export default function WalletPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [assets, setAssets] = useState<WalletAsset[]>([]);
  const [totalValue, setTotalValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const fetchWallet = useCallback(async (showRefresh = false) => {
    if (!isAuthenticated) return;
    try {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const data = await walletApi.getWallet();
      setAssets(data.assets);
      setTotalValue(data.total_value_usd);
    } catch (err: any) {
      setError(err?.detail || err?.message || 'Failed to load wallet');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAuthenticated]);

  // Initial fetch
  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => fetchWallet(true), 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchWallet]);

  return (
    <div className="min-h-screen bg-surface-500">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="pt-16 pb-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-brand-400" />
              </div>
              <div>
                <h1 className="text-2xl font-display font-bold text-white">Wallet</h1>
                <p className="text-sm text-gray-400">Manage your crypto portfolio</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setBalanceHidden(!balanceHidden)}
                className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
              >
                {balanceHidden ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
              <button
                onClick={() => fetchWallet(true)}
                disabled={refreshing}
                className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/5 disabled:opacity-50"
              >
                <RefreshCw className={cn('w-5 h-5', refreshing && 'animate-spin')} />
              </button>
            </div>
          </div>

          {/* Portfolio Summary Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Card className="bg-gradient-to-br from-surface-400 to-surface-500 border border-white/5 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400 mb-1">Total Portfolio Value</p>
                  {loading ? (
                    <Skeleton className="h-10 w-48" />
                  ) : (
                    <h2 className="text-3xl font-display font-bold text-white">
                      {balanceHidden ? '••••••' : formatUsd(totalValue)}
                    </h2>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link href="/trade/BTC-USDT">
                    <Button variant="primary" icon={<ArrowRightLeft className="w-4 h-4" />}>
                      Trade
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Error State */}
          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
              <button
                onClick={() => fetchWallet()}
                className="ml-auto text-sm text-red-400 hover:text-red-300 underline"
              >
                Retry
              </button>
            </motion.div>
          )}

          {/* Assets Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="bg-surface-400 border border-white/5 overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-white/5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                <div className="col-span-3">Asset</div>
                <div className="col-span-2 text-right">Balance</div>
                <div className="col-span-2 text-right">Locked</div>
                <div className="col-span-2 text-right">Price (USD)</div>
                <div className="col-span-3 text-right">Value (USD)</div>
              </div>

              {/* Loading Skeleton */}
              {loading && (
                <div className="divide-y divide-white/5">
                  {[...Array(9)].map((_, i) => (
                    <div key={i} className="grid grid-cols-12 gap-4 px-6 py-4 items-center">
                      <div className="col-span-3 flex items-center gap-3">
                        <Skeleton variant="circular" width={40} height={40} />
                        <div>
                          <Skeleton className="h-4 w-12 mb-1" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                      </div>
                      <div className="col-span-2"><Skeleton className="h-4 w-full ml-auto" /></div>
                      <div className="col-span-2"><Skeleton className="h-4 w-full ml-auto" /></div>
                      <div className="col-span-2"><Skeleton className="h-4 w-full ml-auto" /></div>
                      <div className="col-span-3"><Skeleton className="h-4 w-full ml-auto" /></div>
                    </div>
                  ))}
                </div>
              )}

              {/* Asset Rows */}
              {!loading && assets.length > 0 && (
                <div className="divide-y divide-white/5">
                  {assets.map((asset, idx) => {
                    const hasBalance = parseFloat(asset.total) > 0;
                    const gradient = COIN_COLORS[asset.symbol] || 'from-gray-400 to-gray-600';
                    return (
                      <motion.div
                        key={asset.symbol}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        className={cn(
                          'grid grid-cols-12 gap-4 px-6 py-4 items-center transition-colors',
                          hasBalance ? 'hover:bg-white/5' : 'opacity-60 hover:opacity-80 hover:bg-white/3'
                        )}
                      >
                        {/* Asset Info */}
                        <div className="col-span-3 flex items-center gap-3">
                          <div className={cn(
                            'w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold text-xs flex-shrink-0',
                            gradient
                          )}>
                            {asset.symbol.slice(0, 2)}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">{asset.symbol}</p>
                            <p className="text-xs text-gray-500">{asset.name}</p>
                          </div>
                        </div>

                        {/* Balance */}
                        <div className="col-span-2 text-right">
                          <p className="text-sm text-white font-mono">
                            {balanceHidden ? '••••' : formatBalance(asset.total)}
                          </p>
                          {parseFloat(asset.available) !== parseFloat(asset.total) && !balanceHidden && (
                            <p className="text-xs text-gray-500">
                              {formatBalance(asset.available)} avail
                            </p>
                          )}
                        </div>

                        {/* Locked */}
                        <div className="col-span-2 text-right">
                          <p className={cn(
                            'text-sm font-mono',
                            parseFloat(asset.locked) > 0 ? 'text-amber-400' : 'text-gray-600'
                          )}>
                            {balanceHidden ? '••••' : formatBalance(asset.locked)}
                          </p>
                        </div>

                        {/* Price */}
                        <div className="col-span-2 text-right">
                          <p className="text-sm text-gray-300 font-mono">
                            {formatPrice(asset.price_usd)}
                          </p>
                        </div>

                        {/* Value */}
                        <div className="col-span-3 text-right">
                          <p className={cn(
                            'text-sm font-mono font-semibold',
                            hasBalance ? 'text-white' : 'text-gray-600'
                          )}>
                            {balanceHidden ? '••••' : formatUsd(asset.value_usd)}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {/* Empty State */}
              {!loading && assets.length === 0 && !error && (
                <div className="py-16 text-center">
                  <Wallet className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 mb-2">No supported assets found</p>
                  <p className="text-sm text-gray-500">Contact support if this seems wrong.</p>
                </div>
              )}
            </Card>
          </motion.div>

          {/* Info footer */}
          <div className="mt-6 flex items-center gap-2 text-xs text-gray-500">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Prices from Binance, updated every 30 seconds. Balances are simulated.</span>
          </div>
        </div>
      </main>
    </div>
  );
}
