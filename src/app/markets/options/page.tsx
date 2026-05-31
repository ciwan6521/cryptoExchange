'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3, TrendingUp, TrendingDown, Loader2, X, Clock,
} from 'lucide-react';
import { Header, Sidebar } from '@/components/layout';
import { KycBanner } from '@/components/common/KycBanner';
import { Button, CoinIcon } from '@/components/ui';
import { cn, formatNumber, formatPrice } from '@/lib/utils';
import { optionsApi, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useBalanceStore } from '@/stores/balance-store';
import { useTickers } from '@/hooks';
import { toast } from 'sonner';

const ASSETS = ['BTC', 'ETH', 'SOL'];
const DURATIONS = [
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
];

export default function OptionsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAuthenticated, user } = useAuthStore();
  const { balances, fetchBalances } = useBalanceStore();
  const allTickers = useTickers();

  const [positions, setPositions] = useState<Array<{
    id: string; asset: string; option_type: string; strike_price: string;
    premium_usdt: string; quantity: string; expiry_at: string; status: string;
    unrealized_pnl: string | null;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);

  const [asset, setAsset] = useState('BTC');
  const [optionType, setOptionType] = useState<'call' | 'put'>('call');
  const [strikePrice, setStrikePrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [durationDays, setDurationDays] = useState(30);

  const spotPrice = useMemo(() => {
    const t = allTickers.find(x => x.baseAsset === asset);
    return t?.price || 0;
  }, [allTickers, asset]);

  const usdtBalance = useMemo(() => {
    const b = balances.find(x => x.asset === 'USDT');
    return parseFloat(b?.available || '0');
  }, [balances]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (isAuthenticated) {
        const [posRes] = await Promise.all([
          optionsApi.getPositions(),
          fetchBalances(),
        ]);
        setPositions(posRes.positions || []);
      } else {
        setPositions([]);
      }
    } catch {
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, fetchBalances]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (spotPrice > 0 && !strikePrice) {
      setStrikePrice(String(Math.round(spotPrice / 100) * 100));
    }
  }, [spotPrice, asset]);

  const openPositions = useMemo(
    () => positions.filter(p => p.status === 'open'),
    [positions],
  );

  const handleOpen = async () => {
    if (!isAuthenticated) {
      toast.error('Please log in to open options');
      return;
    }
    if (user?.kycStatus !== 'approved') {
      toast.error('Complete KYC verification first');
      return;
    }
    const qty = parseFloat(quantity);
    const strike = parseFloat(strikePrice);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Enter a valid quantity');
      return;
    }
    if (isNaN(strike) || strike <= 0) {
      toast.error('Enter a valid strike price');
      return;
    }

    setOpening(true);
    try {
      const res = await optionsApi.open({
        asset,
        option_type: optionType,
        strike_price: strikePrice,
        quantity,
        duration_days: durationDays,
      });
      toast.success(`Option opened — premium ${res.premium_usdt} USDT`);
      setQuantity('');
      await loadData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Failed to open option');
    } finally {
      setOpening(false);
    }
  };

  const handleClose = async (id: string) => {
    setClosingId(id);
    try {
      const res = await optionsApi.close(id);
      toast.success(`Position closed — PnL ${res.realized_pnl} USDT`);
      await loadData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Failed to close position');
    } finally {
      setClosingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-surface-500 flex flex-col">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="pt-16">
        <KycBanner action="trade options" />
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border border-glass-border bg-gradient-to-br from-purple-500/20 via-surface-200 to-surface-300 p-6 md:p-8"
        >
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-purple-400 text-sm font-medium mb-2">
              <BarChart3 className="w-4 h-4" />
              Crypto Options
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-white mb-2">
              Options Trading
            </h1>
            <p className="text-gray-400 max-w-xl">
              Buy call or put options on top assets. Pay premium upfront and close early to realize PnL.
            </p>
          </div>
          <BarChart3 className="absolute -right-4 -bottom-4 w-32 h-32 text-purple-500/10" />
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Open panel */}
          <div className="lg:col-span-1 rounded-xl border border-glass-border bg-surface-200 p-5 space-y-5">
            <h2 className="text-lg font-semibold text-white">Open Option</h2>

            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Asset</label>
              <div className="flex gap-2">
                {ASSETS.map(a => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => { setAsset(a); setStrikePrice(''); }}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border transition-colors',
                      asset === a
                        ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                        : 'border-glass-border bg-surface-100 text-gray-400 hover:text-white',
                    )}
                  >
                    <CoinIcon symbol={a} size={18} />
                    {a}
                  </button>
                ))}
              </div>
              {spotPrice > 0 && (
                <p className="text-xs text-gray-500 mt-1">Spot: {formatPrice(spotPrice)}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(['call', 'put'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOptionType(t)}
                  className={cn(
                    'py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors',
                    optionType === t
                      ? t === 'call'
                        ? 'bg-profit/20 text-profit border border-profit/30'
                        : 'bg-loss/20 text-loss border border-loss/30'
                      : 'bg-surface-100 text-gray-400 border border-glass-border hover:text-white',
                  )}
                >
                  {t === 'call' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {t === 'call' ? 'Call' : 'Put'}
                </button>
              ))}
            </div>

            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Strike Price (USDT)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={strikePrice}
                onChange={e => setStrikePrice(e.target.value)}
                className="w-full bg-surface-100 border border-glass-border rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-brand-500/50 tabular-nums"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Quantity</label>
              <input
                type="number"
                min="0"
                step="any"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="0.00"
                className="w-full bg-surface-100 border border-glass-border rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-brand-500/50 tabular-nums"
              />
              {isAuthenticated && (
                <p className="text-xs text-gray-500 mt-1">USDT available: {formatNumber(usdtBalance)}</p>
              )}
            </div>

            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">Duration</label>
              <div className="grid grid-cols-2 gap-2">
                {DURATIONS.map(d => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDurationDays(d.value)}
                    className={cn(
                      'py-2 rounded-lg text-xs font-medium border transition-colors',
                      durationDays === d.value
                        ? 'border-brand-500/50 bg-brand-500/10 text-brand-400'
                        : 'border-glass-border bg-surface-100 text-gray-400 hover:text-white',
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <Button fullWidth loading={opening} onClick={handleOpen}>
              Open {optionType === 'call' ? 'Call' : 'Put'}
            </Button>
          </div>

          {/* Positions */}
          <div className="lg:col-span-2 rounded-xl border border-glass-border bg-surface-200 p-5">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-brand-400" />
              Open Positions
              <span className="text-xs text-gray-500 font-normal ml-1">({openPositions.length})</span>
            </h2>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
              </div>
            ) : !isAuthenticated ? (
              <p className="text-center py-16 text-sm text-gray-600">Log in to view positions</p>
            ) : openPositions.length === 0 ? (
              <p className="text-center py-16 text-sm text-gray-600">No open positions</p>
            ) : (
              <div className="space-y-3">
                {openPositions.map(pos => {
                  const pnl = pos.unrealized_pnl ? parseFloat(pos.unrealized_pnl) : null;
                  return (
                    <div
                      key={pos.id}
                      className="rounded-lg border border-glass-border bg-surface-100 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <CoinIcon symbol={pos.asset} size={32} />
                        <div>
                          <p className="text-sm font-semibold text-white capitalize flex items-center gap-2">
                            {pos.option_type} · {pos.asset}
                            <span className={cn(
                              'text-xs px-1.5 py-0.5 rounded',
                              pos.option_type === 'call' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss',
                            )}>
                              {pos.option_type}
                            </span>
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Strike {formatPrice(parseFloat(pos.strike_price))} · Qty {pos.quantity} · Premium {pos.premium_usdt} USDT
                          </p>
                          <p className="text-[10px] text-gray-600 mt-0.5">
                            Expires {new Date(pos.expiry_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {pnl != null && (
                          <span className={cn(
                            'text-sm font-semibold tabular-nums',
                            pnl >= 0 ? 'text-profit' : 'text-loss',
                          )}>
                            {pnl >= 0 ? '+' : ''}{formatNumber(pnl)} USDT
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={closingId === pos.id}
                          onClick={() => handleClose(pos.id)}
                          icon={<X className="w-3.5 h-3.5" />}
                        >
                          Close
                        </Button>
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
