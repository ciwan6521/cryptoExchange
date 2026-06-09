'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  Eye,
  EyeOff,
  Plus,
  Send,
  ArrowRightLeft,
} from 'lucide-react';
import { Header, Sidebar } from '@/components/layout';
import { Card, CardHeader, Button, Skeleton, Badge, AnimatedNumber, CoinIcon } from '@/components/ui';
import { ConnectionBanner } from '@/components/trading';
import { useTickers } from '@/hooks';
import { formatPrice, formatPercent, formatNumber, cn } from '@/lib/utils';
import { toFixedWithCommas } from '@/lib/decimal';
import { isEnabled } from '@/lib/feature-flags';
import { useAdminStore } from '@/stores/admin-store';
import { useAuthStore } from '@/stores/auth-store';
import { useBalanceStore } from '@/stores/balance-store';
import { useOrderStore } from '@/stores/order-store';
import { useUserFlags } from '@/hooks/useUserFlags';
import { CMSBanners } from '@/components/layout/CMSRenderer';
import { DepositModal } from '@/components/modals/DepositModal';
import { WithdrawModal } from '@/components/modals/WithdrawModal';
import { walletApi } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

// ============================================
// Dashboard Page
// Main overview with portfolio and market data
// ============================================

export default function DashboardPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [totalValue, setTotalValue] = useState(0);
  const [walletLoading, setWalletLoading] = useState(false);
  const tickers = useTickers();
  const { depositsEnabled, withdrawalsEnabled } = useAdminStore((s) => s.systemFlags);
  const { userWithdrawalsEnabled } = useUserFlags();
  const { t } = useI18n();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const { balances, isLoading: balancesLoading, fetchBalances } = useBalanceStore();
  const { openOrders, openOrdersLoading, fetchOpenOrders } = useOrderStore();

  // Fetch real balances, wallet value, and open orders from backend on mount
  useEffect(() => {
    if (isAuthenticated) {
      fetchBalances();
      fetchOpenOrders();
      setWalletLoading(true);
      walletApi.getWallet()
        .then((data) => {
          const val = parseFloat(data.total_value_usd || '0');
          setTotalValue(isNaN(val) ? 0 : val);
        })
        .catch(() => setTotalValue(0))
        .finally(() => setWalletLoading(false));
    } else {
      setTotalValue(0);
    }
  }, [isAuthenticated, fetchBalances, fetchOpenOrders]);

  const totalChange = useMemo(() => {
    if (!isAuthenticated || balances.length === 0 || tickers.length === 0) return 0;
    let pnlUsd = 0;
    let totalUsd = 0;
    for (const balance of balances) {
      const total = parseFloat(balance.available || '0') + parseFloat(balance.locked || '0');
      if (total <= 0) continue;
      const ticker = tickers.find(
        (tk) => tk.baseAsset === balance.asset || (balance.asset === 'USDT' && tk.baseAsset === 'USDT'),
      );
      const price = balance.asset === 'USDT'
        ? 1
        : ticker?.price ?? 0;
      if (price <= 0) continue;
      const valueUsd = total * price;
      totalUsd += valueUsd;
      const change24h = balance.asset === 'USDT' ? 0 : (ticker?.change24h ?? 0);
      pnlUsd += valueUsd * (change24h / 100);
    }
    if (totalUsd <= 0) return 0;
    return (pnlUsd / totalUsd) * 100;
  }, [isAuthenticated, balances, tickers]);
  
  return (
    <div className="min-h-screen bg-surface-500">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="pt-16">
        <ConnectionBanner />
      </div>
      
      <main id="main-content" className="pb-8 px-4 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Page header */}
          <div className="py-6">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h1 className="text-2xl font-display font-bold text-white mb-1">
                {t('dashboard.title')}
              </h1>
              <p className="text-gray-400">
                {t('dashboard.subtitle')}
              </p>
            </motion.div>
          </div>
          
          {/* CMS Banners */}
          <div className="mb-4">
            <CMSBanners />
          </div>

          {/* Portfolio summary */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8"
          >
            <Card className="relative overflow-hidden">
              {/* Background decoration */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-brand-500/5 rounded-full blur-[80px]" />
              
              <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-400">{t('dashboard.totalValue')}</span>
                    <button
                      onClick={() => setBalanceHidden(!balanceHidden)}
                      className="text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      {balanceHidden ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  
                  <div className="flex items-baseline gap-4">
                    {balanceHidden ? (
                      <span className="text-4xl font-bold text-white">••••••</span>
                    ) : walletLoading ? (
                      <Skeleton width={180} height={40} />
                    ) : (
                      <AnimatedNumber
                        value={totalValue}
                        prefix="$"
                        decimals={2}
                        className="text-4xl font-bold text-white"
                      />
                    )}
                    
                    <span className={cn(
                      'flex items-center gap-1 text-sm font-medium',
                      totalChange >= 0 ? 'text-profit' : 'text-loss'
                    )}>
                      {totalChange >= 0 ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <TrendingDown className="w-4 h-4" />
                      )}
                      {formatPercent(totalChange)}
                    </span>
                  </div>
                </div>
                
                {/* Quick actions */}
                <div className="flex items-center gap-3">
                  {isEnabled('ENABLE_DEPOSIT') && (
                    <Button variant="secondary" icon={<Plus className="w-4 h-4" />} disabled={!depositsEnabled} onClick={() => setDepositOpen(true)}>
                      {depositsEnabled ? 'Deposit' : 'Deposits Paused'}
                    </Button>
                  )}
                  {isEnabled('ENABLE_WITHDRAW') && (
                    <Button variant="secondary" icon={<Send className="w-4 h-4" />} disabled={!withdrawalsEnabled || !userWithdrawalsEnabled} onClick={() => setWithdrawOpen(true)}>
                      {!withdrawalsEnabled ? 'Withdrawals Paused' : !userWithdrawalsEnabled ? 'Withdrawals Restricted' : 'Withdraw'}
                    </Button>
                  )}
                  <Link href="/trade/BTC-USDT">
                    <Button variant="primary" icon={<ArrowRightLeft className="w-4 h-4" />}>
                      Trade
                    </Button>
                  </Link>
                  <Link href="/earn">
                    <Button variant="secondary" icon={<TrendingUp className="w-4 h-4" />}>
                      Earn
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          </motion.div>
          
          {/* Main grid */}
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Left column - Assets */}
            <div className="lg:col-span-2 space-y-6">
              {/* Assets */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <Card padding="none">
                  <CardHeader
                    title={t('dashboard.yourAssets')}
                    subtitle={`${balances.length} asset${balances.length !== 1 ? 's' : ''}`}
                    action={
                      <Link href="/wallet">
                        <Button variant="ghost" size="sm">
                          {t('dashboard.viewAll')}
                        </Button>
                      </Link>
                    }
                    className="px-4 pt-4"
                  />
                  
                  <div className="divide-y divide-glass-border">
                    {balancesLoading ? (
                      Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Skeleton variant="circular" width={40} height={40} />
                            <div>
                              <Skeleton width={60} height={16} className="mb-1" />
                              <Skeleton width={80} height={12} />
                            </div>
                          </div>
                          <div className="text-right">
                            <Skeleton width={70} height={16} className="mb-1" />
                            <Skeleton width={40} height={12} className="ml-auto" />
                          </div>
                        </div>
                      ))
                    ) : balances.length === 0 ? (
                      <div className="px-4 py-8 text-center text-gray-500 text-sm">
                        {isAuthenticated ? 'No assets yet. Deposit or earn rewards to get started.' : 'Sign in to view your assets.'}
                      </div>
                    ) : (
                      balances.map((balance, index) => {
                        const available = parseFloat(balance.available || '0');
                        const locked = parseFloat(balance.locked || '0');
                        const total = available + locked;
                        return (
                          <motion.div
                            key={balance.asset}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 + index * 0.05 }}
                            className="px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <CoinIcon symbol={balance.asset} size={40} />
                              <div>
                                <div className="font-medium text-white">{balance.asset}</div>
                                <div className="text-sm text-gray-500">
                                  {balanceHidden ? '••••' : `${toFixedWithCommas(total, 4)} total`}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-medium text-white tabular-nums">
                                {balanceHidden ? '••••' : `$${toFixedWithCommas(available, 2)}`}
                              </div>
                              {locked > 0 && (
                                <div className="text-xs text-amber-400">
                                  {toFixedWithCommas(locked, 4)} locked
                                </div>
                              )}
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                </Card>
              </motion.div>
              
              {/* Open Orders */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Card padding="none">
                  <CardHeader
                    title={t('dashboard.openOrders')}
                    subtitle={`${openOrders.length} active`}
                    action={
                      <Link href="/trade/BTC-USDT">
                        <Button variant="ghost" size="sm">
                          {t('dashboard.viewAll')}
                        </Button>
                      </Link>
                    }
                    className="px-4 pt-4"
                  />
                  
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 border-b border-glass-border">
                          <th className="px-4 py-3 font-medium">Pair</th>
                          <th className="px-4 py-3 font-medium">Type</th>
                          <th className="px-4 py-3 font-medium">Side</th>
                          <th className="px-4 py-3 font-medium text-right">Price</th>
                          <th className="px-4 py-3 font-medium text-right">Amount</th>
                          <th className="px-4 py-3 font-medium text-right">Filled</th>
                          <th className="px-4 py-3 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-glass-border">
                        {openOrdersLoading ? (
                          Array.from({ length: 2 }).map((_, i) => (
                            <tr key={i}>
                              {Array.from({ length: 7 }).map((_, j) => (
                                <td key={j} className="px-4 py-3">
                                  <Skeleton width={j === 0 ? 80 : 60} height={14} />
                                </td>
                              ))}
                            </tr>
                          ))
                        ) : openOrders.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-gray-500 text-sm">
                              {isAuthenticated ? 'No open orders.' : 'Sign in to view your orders.'}
                            </td>
                          </tr>
                        ) : (
                          openOrders.map((order) => {
                            const qty = parseFloat(order.quantity);
                            const filled = parseFloat(order.filled_quantity);
                            const filledPct = qty > 0 ? ((filled / qty) * 100).toFixed(0) : '0';
                            return (
                              <tr key={order.id} className="hover:bg-white/[0.02]">
                                <td className="px-4 py-3 font-medium text-white">
                                  {order.symbol}
                                </td>
                                <td className="px-4 py-3">
                                  <Badge variant="default">
                                    {order.order_type.replace('_', ' ')}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge variant={order.side === 'buy' ? 'success' : 'danger'}>
                                    {order.side}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-sm text-white">
                                  {order.price ? `$${formatNumber(parseFloat(order.price), { decimals: 2 })}` : 'Market'}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-sm text-gray-400">
                                  {formatNumber(qty, { decimals: 4 })}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="text-gray-400">
                                    {filledPct}%
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <Link
                                    href={`/trade/${order.symbol}`}
                                    className="inline-flex text-gray-500 hover:text-white transition-colors"
                                  >
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Link>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </motion.div>
            </div>
            
            {/* Right column - Markets */}
            <div className="space-y-6">
              {/* Market overview */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Card padding="none">
                  <CardHeader
                    title={t('dashboard.markets')}
                    action={
                      <Link href="/markets/spot">
                        <Button variant="ghost" size="sm">
                          {t('dashboard.viewAll')}
                        </Button>
                      </Link>
                    }
                    className="px-4 pt-4"
                  />
                  
                  <div className="divide-y divide-glass-border">
                    {tickers.length === 0 ? (
                      // Loading skeleton
                      Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Skeleton variant="circular" width={32} height={32} />
                            <div>
                              <Skeleton width={60} height={16} className="mb-1" />
                              <Skeleton width={40} height={12} />
                            </div>
                          </div>
                          <div className="text-right">
                            <Skeleton width={70} height={16} className="mb-1" />
                            <Skeleton width={50} height={12} className="ml-auto" />
                          </div>
                        </div>
                      ))
                    ) : (
                      tickers.slice(0, 6).map((ticker, index) => (
                        <Link
                          key={ticker.symbol}
                          href={`/trade/${ticker.baseAsset}-${ticker.quoteAsset}`}
                        >
                          <motion.div
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.5 + index * 0.05 }}
                            className="px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <CoinIcon symbol={ticker.baseAsset} size={32} />
                              <div>
                                <div className="font-medium text-white text-sm">
                                  {ticker.baseAsset}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {ticker.quoteAsset}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-medium text-white text-sm tabular-nums">
                                {formatPrice(ticker.price)}
                              </div>
                              <div className={cn(
                                'flex items-center justify-end gap-0.5 text-xs tabular-nums',
                                ticker.change24h >= 0 ? 'text-profit' : 'text-loss'
                              )}>
                                {ticker.change24h >= 0 ? (
                                  <ArrowUpRight className="w-3 h-3" />
                                ) : (
                                  <ArrowDownRight className="w-3 h-3" />
                                )}
                                {formatPercent(ticker.change24h)}
                              </div>
                            </div>
                          </motion.div>
                        </Link>
                      ))
                    )}
                  </div>
                </Card>
              </motion.div>
              
              {/* Quick stats */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <Card>
                  <CardHeader title={t('dashboard.quickStats')} />
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 text-sm">{t('dashboard.pnl24h')}</span>
                      <span className={cn('font-medium tabular-nums', totalChange >= 0 ? 'text-profit' : 'text-loss')}>
                        {totalChange >= 0 ? '+' : ''}{formatPercent(totalChange)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 text-sm">{t('dashboard.openOrders')}</span>
                      <span className="text-white font-medium">{openOrders.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 text-sm">{t('dashboard.yourAssets')}</span>
                      <span className="text-white font-medium">{balances.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 text-sm">Fee Tier</span>
                      <Badge variant="brand">{user?.memberTier || 'Standard'}</Badge>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </div>
          </div>
        </div>
      </main>
      {/* Modals */}
      <DepositModal isOpen={depositOpen} onClose={() => setDepositOpen(false)} />
      <WithdrawModal isOpen={withdrawOpen} onClose={() => setWithdrawOpen(false)} />
    </div>
  );
}

