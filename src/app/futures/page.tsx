'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Zap, AlertTriangle, Loader2,
  X, ChevronDown, Shield, Wallet, BarChart3,
} from 'lucide-react';
import { Header, Sidebar } from '@/components/layout';
import { KycBanner } from '@/components/common/KycBanner';
import { Button, CoinIcon } from '@/components/ui';
import { cn, formatNumber, formatPrice } from '@/lib/utils';
import {
  leverageApi, ApiError,
  type LeverageConfigResponse, type LeveragePositionItem, type LeveragePreviewResponse,
} from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useBalanceStore } from '@/stores/balance-store';
import { useTickers } from '@/hooks';
import { isEnabled } from '@/lib/feature-flags';
import { toast } from 'sonner';

const LEVERAGE_STEPS = [1, 2, 3, 5, 10, 20, 25, 50, 75, 100];

export default function FuturesPage() {
  const futuresEnabled = isEnabled('ENABLE_FUTURES');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAuthenticated, user } = useAuthStore();
  const { balances, fetchBalances } = useBalanceStore();
  const allTickers = useTickers();

  const [config, setConfig] = useState<LeverageConfigResponse | null>(null);
  const [positions, setPositions] = useState<LeveragePositionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState('BTC-USDT');
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [leverage, setLeverage] = useState(10);
  const [margin, setMargin] = useState('');
  const [preview, setPreview] = useState<LeveragePreviewResponse | null>(null);
  const [opening, setOpening] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [showPairPicker, setShowPairPicker] = useState(false);
  const [, setTick] = useState(0);

  const baseAsset = selectedSymbol.split('-')[0] || 'BTC';
  const ticker = allTickers.find(t => t.baseAsset === baseAsset);
  const markPrice = ticker?.price || (preview ? parseFloat(preview.mark_price) : 0);

  const usdtBalance = useMemo(() => {
    const b = balances.find(x => x.asset === 'USDT');
    return parseFloat(b?.available || '0');
  }, [balances]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await leverageApi.getConfig();
      setConfig(cfg);
      if (cfg.pairs.length > 0 && !cfg.pairs.find(p => p.symbol === selectedSymbol)) {
        setSelectedSymbol(cfg.pairs[0].symbol);
      }
      if (isAuthenticated) {
        const [posRes] = await Promise.all([
          leverageApi.getPositions(),
          fetchBalances(),
        ]);
        setPositions(posRes.positions || []);
      } else {
        setPositions([]);
      }
    } catch {
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, fetchBalances, selectedSymbol]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const iv = setInterval(() => {
      setTick(t => t + 1);
      if (isAuthenticated) {
        leverageApi.getPositions().then(r => setPositions(r.positions || [])).catch(() => {});
      }
    }, 15000);
    return () => clearInterval(iv);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!margin || parseFloat(margin) <= 0) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(() => {
      leverageApi.preview({
        symbol: selectedSymbol,
        side,
        leverage,
        margin_usdt: margin,
      }).then(setPreview).catch(() => setPreview(null));
    }, 300);
    return () => clearTimeout(timer);
  }, [selectedSymbol, side, leverage, margin]);

  const openPositions = useMemo(
    () => positions.filter(p => p.status === 'open'),
    [positions],
  );

  const handleOpen = async () => {
    if (!isAuthenticated) {
      toast.error('Please log in to open a position');
      return;
    }
    if (user?.kycStatus !== 'approved') {
      toast.error('Complete KYC verification first');
      return;
    }
    const amt = parseFloat(margin);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Enter a valid margin amount');
      return;
    }
    const minMargin = parseFloat(config?.min_margin_usdt || '10');
    if (amt < minMargin) {
      toast.error(`Minimum margin is ${minMargin} USDT`);
      return;
    }
    if (amt > usdtBalance) {
      toast.error('Insufficient USDT balance');
      return;
    }

    setOpening(true);
    try {
      await leverageApi.open({
        symbol: selectedSymbol,
        side,
        leverage,
        margin_usdt: margin,
      });
      toast.success(`${side === 'long' ? 'Long' : 'Short'} position opened`);
      setMargin('');
      setPreview(null);
      await loadData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Failed to open position');
    } finally {
      setOpening(false);
    }
  };

  const handleClose = async (id: string) => {
    setClosingId(id);
    try {
      await leverageApi.close(id);
      toast.success('Position closed');
      await loadData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Failed to close position');
    } finally {
      setClosingId(null);
    }
  };

  if (!futuresEnabled) {
    return (
      <div className="min-h-screen bg-surface-500 flex flex-col">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 pt-24 px-4 flex items-center justify-center">
          <div className="text-center max-w-md">
            <Zap className="w-12 h-12 text-gray-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-white mb-2">Futures Trading</h1>
            <p className="text-gray-400 mb-6">Leverage trading is not enabled on this deployment.</p>
            <Link href="/trade/BTC-USDT">
              <Button>Go to Spot Trading</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-500 flex flex-col">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="pt-16">
        <KycBanner action="open leverage positions" />
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 space-y-6">
        {/* Hero banner */}
        <div className="relative overflow-hidden rounded-2xl border border-glass-border bg-gradient-to-br from-brand-500/20 via-surface-200 to-surface-300 p-6 md:p-8">
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-brand-400 text-sm font-medium mb-2">
              <Zap className="w-4 h-4" />
              USDT-Margined Futures
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-white mb-2">
              Trade with up to {config?.max_leverage || 100}x Leverage
            </h1>
            <p className="text-gray-400 max-w-xl">
              Open long or short positions on top markets. Margin is locked in USDT;
              positions are marked to market and liquidated automatically at the liquidation price.
            </p>
          </div>
          <Zap className="absolute -right-4 -bottom-4 w-32 h-32 text-brand-500/10" />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Order panel */}
          <div className="lg:col-span-1 rounded-xl border border-glass-border bg-surface-200 p-5 space-y-5">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-brand-400" />
              Open Position
            </h2>

            {/* Pair selector */}
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Market</label>
              <button
                type="button"
                onClick={() => setShowPairPicker(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface-100 border border-glass-border text-white"
              >
                <span className="flex items-center gap-2">
                  <CoinIcon symbol={baseAsset} size={22} />
                  {selectedSymbol.replace('-', '/')}
                </span>
                <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', showPairPicker && 'rotate-180')} />
              </button>
              <AnimatePresence>
                {showPairPicker && config && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-glass-border bg-surface-100"
                  >
                    {config.pairs.map(p => (
                      <button
                        key={p.symbol}
                        type="button"
                        onClick={() => { setSelectedSymbol(p.symbol); setShowPairPicker(false); }}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5',
                          p.symbol === selectedSymbol && 'bg-brand-500/10 text-brand-400',
                        )}
                      >
                        <CoinIcon symbol={p.base_asset} size={18} />
                        {p.symbol.replace('-', '/')}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
              {markPrice > 0 && (
                <p className="text-xs text-gray-500 mt-1">Mark: {formatPrice(markPrice)}</p>
              )}
            </div>

            {/* Long / Short */}
            <div className="grid grid-cols-2 gap-2">
              {(['long', 'short'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  className={cn(
                    'py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors',
                    side === s
                      ? s === 'long'
                        ? 'bg-profit/20 text-profit border border-profit/30'
                        : 'bg-loss/20 text-loss border border-loss/30'
                      : 'bg-surface-100 text-gray-400 border border-glass-border hover:text-white',
                  )}
                >
                  {s === 'long' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {s === 'long' ? 'Long' : 'Short'}
                </button>
              ))}
            </div>

            {/* Leverage */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-gray-500 uppercase tracking-wider">Leverage</label>
                <span className="text-sm font-bold text-brand-400">{leverage}x</span>
              </div>
              <input
                type="range"
                min={1}
                max={config?.max_leverage || 100}
                value={leverage}
                onChange={e => setLeverage(parseInt(e.target.value, 10))}
                className="w-full accent-brand-500"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {LEVERAGE_STEPS.filter(v => v <= (config?.max_leverage || 100)).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setLeverage(v)}
                    className={cn(
                      'px-2 py-0.5 text-xs rounded-md border transition-colors',
                      leverage === v
                        ? 'bg-brand-500/20 border-brand-500/40 text-brand-400'
                        : 'border-glass-border text-gray-500 hover:text-white',
                    )}
                  >
                    {v}x
                  </button>
                ))}
              </div>
            </div>

            {/* Margin */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-gray-500 uppercase tracking-wider">Margin (USDT)</label>
                {isAuthenticated && (
                  <button
                    type="button"
                    onClick={() => setMargin(usdtBalance.toFixed(2))}
                    className="text-xs text-brand-400 hover:text-brand-300"
                  >
                    Max: {formatNumber(usdtBalance, { decimals: 2 })}
                  </button>
                )}
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder={`Min ${config?.min_margin_usdt || '10'}`}
                value={margin}
                onChange={e => setMargin(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-surface-100 border border-glass-border text-white placeholder-gray-600 focus:outline-none focus:border-brand-500/50"
              />
            </div>

            {/* Preview */}
            {preview && (
              <div className="rounded-lg bg-surface-100 border border-glass-border p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Notional</span>
                  <span className="text-white tabular-nums">{formatNumber(parseFloat(preview.notional_usdt), { decimals: 2 })} USDT</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Size</span>
                  <span className="text-white tabular-nums">{formatNumber(parseFloat(preview.quantity), { decimals: 6 })} {baseAsset}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Liq. Price</span>
                  <span className="text-loss tabular-nums">{formatPrice(parseFloat(preview.liquidation_price))}</span>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              High leverage increases liquidation risk. Only trade with funds you can afford to lose.
            </div>

            <Button
              fullWidth
              size="lg"
              loading={opening}
              onClick={handleOpen}
              className={cn(
                side === 'long'
                  ? 'bg-profit hover:bg-profit/90'
                  : 'bg-loss hover:bg-loss/90',
              )}
            >
              {side === 'long' ? 'Open Long' : 'Open Short'}
            </Button>

            {!isAuthenticated && (
              <p className="text-center text-sm text-gray-500">
                <Link href="/auth/login" className="text-brand-400 hover:underline">Log in</Link>
                {' '}to trade
              </p>
            )}
          </div>

          {/* Positions */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Wallet className="w-5 h-5 text-brand-400" />
                Positions
                {openPositions.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-400">
                    {openPositions.length} open
                  </span>
                )}
              </h2>
              <Link href="/trade/BTC-USDT" className="text-sm text-brand-400 hover:underline">
                Spot Trading
              </Link>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading...
              </div>
            ) : positions.length === 0 ? (
              <div className="rounded-xl border border-glass-border bg-surface-200 p-12 text-center">
                <Shield className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No positions yet</p>
                <p className="text-sm text-gray-500 mt-1">Open your first leveraged position using the panel</p>
              </div>
            ) : (
              <div className="space-y-3">
                {positions.map(pos => {
                  const pnl = pos.status === 'open'
                    ? parseFloat(pos.unrealized_pnl || '0')
                    : parseFloat(pos.realized_pnl || '0');
                  const isProfit = pnl >= 0;
                  return (
                    <div
                      key={pos.id}
                      className="rounded-xl border border-glass-border bg-surface-200 p-4 flex flex-col sm:flex-row sm:items-center gap-4"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <CoinIcon symbol={pos.base_asset} size={36} />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-white">{pos.symbol.replace('-', '/')}</span>
                            <span className={cn(
                              'text-xs px-2 py-0.5 rounded font-medium uppercase',
                              pos.side === 'long' ? 'bg-profit/20 text-profit' : 'bg-loss/20 text-loss',
                            )}>
                              {pos.side} {pos.leverage}x
                            </span>
                            <span className={cn(
                              'text-xs px-2 py-0.5 rounded capitalize',
                              pos.status === 'open' ? 'bg-brand-500/20 text-brand-400' :
                              pos.status === 'liquidated' ? 'bg-loss/20 text-loss' : 'bg-gray-500/20 text-gray-400',
                            )}>
                              {pos.status}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1 tabular-nums">
                            Entry {formatPrice(parseFloat(pos.entry_price))}
                            {pos.mark_price && pos.status === 'open' && (
                              <> · Mark {formatPrice(parseFloat(pos.mark_price))}</>
                            )}
                            · Margin {formatNumber(parseFloat(pos.margin_usdt), { decimals: 2 })} USDT
                          </div>
                          {pos.status === 'open' && (
                            <div className="text-xs text-gray-500 mt-0.5">
                              Liq. {formatPrice(parseFloat(pos.liquidation_price))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className={cn('font-semibold tabular-nums', isProfit ? 'text-profit' : 'text-loss')}>
                            {isProfit ? '+' : ''}{formatNumber(pnl, { decimals: 2 })} USDT
                          </div>
                          {pos.roi_percent && pos.status === 'open' && (
                            <div className={cn('text-xs tabular-nums', isProfit ? 'text-profit' : 'text-loss')}>
                              {isProfit ? '+' : ''}{pos.roi_percent}%
                            </div>
                          )}
                        </div>
                        {pos.status === 'open' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={closingId === pos.id}
                            onClick={() => handleClose(pos.id)}
                          >
                            Close
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
