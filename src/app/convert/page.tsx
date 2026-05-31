'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDownUp, Loader2, ChevronDown, Wallet, RefreshCw,
} from 'lucide-react';
import { Header, Sidebar } from '@/components/layout';
import { KycBanner } from '@/components/common/KycBanner';
import { Button, CoinIcon } from '@/components/ui';
import { cn, formatNumber } from '@/lib/utils';
import { convertApi, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useBalanceStore } from '@/stores/balance-store';
import { toast } from 'sonner';

export default function ConvertPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAuthenticated, user } = useAuthStore();
  const { balances, fetchBalances } = useBalanceStore();

  const [assets, setAssets] = useState<string[]>([]);
  const [fromAsset, setFromAsset] = useState('USDT');
  const [toAsset, setToAsset] = useState('BTC');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<{
    to_amount: string;
    rate: string;
    fee_usd: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<'from' | 'to' | null>(null);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await convertApi.getAssets();
      const list = res.assets?.length ? res.assets : ['USDT', 'BTC', 'ETH'];
      setAssets(list);
      if (!list.includes(fromAsset)) setFromAsset(list[0]);
      if (!list.includes(toAsset)) setToAsset(list.find(a => a !== list[0]) || list[0]);
      if (isAuthenticated) await fetchBalances();
    } catch {
      setAssets(['USDT', 'BTC', 'ETH']);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, fetchBalances, fromAsset, toAsset]);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const availableBalance = useMemo(() => {
    const b = balances.find(x => x.asset === fromAsset);
    return parseFloat(b?.available || '0');
  }, [balances, fromAsset]);

  useEffect(() => {
    if (!amount || parseFloat(amount) <= 0 || fromAsset === toAsset) {
      setQuote(null);
      return;
    }
    const timer = setTimeout(async () => {
      setQuoting(true);
      try {
        const res = await convertApi.quote({
          from_asset: fromAsset,
          to_asset: toAsset,
          from_amount: amount,
        });
        setQuote({ to_amount: res.to_amount, rate: res.rate, fee_usd: res.fee_usd });
      } catch {
        setQuote(null);
      } finally {
        setQuoting(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [fromAsset, toAsset, amount]);

  const swapAssets = () => {
    setFromAsset(toAsset);
    setToAsset(fromAsset);
    setQuote(null);
  };

  const handleConvert = async () => {
    if (!isAuthenticated) {
      toast.error('Please log in to convert');
      return;
    }
    if (user?.kycStatus !== 'approved') {
      toast.error('Complete KYC verification first');
      return;
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (fromAsset === toAsset) {
      toast.error('Select different assets');
      return;
    }
    if (amt > availableBalance) {
      toast.error('Insufficient balance');
      return;
    }

    setConverting(true);
    try {
      const res = await convertApi.execute({
        from_asset: fromAsset,
        to_asset: toAsset,
        from_amount: amount,
      });
      toast.success(`Converted to ${formatNumber(parseFloat(res.to_amount))} ${toAsset}`);
      setAmount('');
      setQuote(null);
      await fetchBalances();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Convert failed');
    } finally {
      setConverting(false);
    }
  };

  const AssetPicker = ({ side }: { side: 'from' | 'to' }) => {
    const selected = side === 'from' ? fromAsset : toAsset;
    const setSelected = side === 'from' ? setFromAsset : setToAsset;
    const isOpen = pickerOpen === side;

    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen(isOpen ? null : side)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-100 border border-glass-border hover:border-brand-500/30 transition-colors"
        >
          <CoinIcon symbol={selected} size={22} />
          <span className="text-sm font-semibold text-white">{selected}</span>
          <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', isOpen && 'rotate-180')} />
        </button>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute right-0 top-full mt-1 z-20 w-40 max-h-48 overflow-y-auto rounded-lg border border-glass-border bg-surface-200 shadow-xl"
            >
              {assets.map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => {
                    setSelected(a);
                    setPickerOpen(null);
                    if (side === 'from' && a === toAsset) setToAsset(fromAsset);
                    if (side === 'to' && a === fromAsset) setFromAsset(toAsset);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5',
                    a === selected && 'bg-brand-500/10 text-brand-400',
                  )}
                >
                  <CoinIcon symbol={a} size={18} />
                  {a}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-surface-500 flex flex-col">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="pt-16">
        <KycBanner action="convert assets" />
      </div>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center gap-2 text-brand-400 text-sm font-medium mb-2">
            <ArrowDownUp className="w-4 h-4" />
            Instant Convert
          </div>
          <h1 className="text-2xl font-display font-bold text-white mb-1">Swap Assets</h1>
          <p className="text-sm text-gray-400">Convert between supported assets at live rates</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-glass-border bg-surface-200 p-5 space-y-4"
        >
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* From */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-gray-500 uppercase tracking-wider">From</label>
                  {isAuthenticated && (
                    <button
                      type="button"
                      onClick={() => setAmount(String(availableBalance))}
                      className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                    >
                      <Wallet className="w-3 h-3" />
                      {formatNumber(availableBalance)} {fromAsset}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 bg-surface-100 border border-glass-border rounded-lg px-3 py-3 text-lg text-white placeholder-gray-600 focus:outline-none focus:border-brand-500/50 tabular-nums"
                  />
                  <AssetPicker side="from" />
                </div>
              </div>

              {/* Swap button */}
              <div className="flex justify-center -my-1">
                <button
                  type="button"
                  onClick={swapAssets}
                  className="p-2 rounded-full bg-surface-100 border border-glass-border hover:border-brand-500/40 hover:bg-brand-500/10 transition-colors"
                  aria-label="Swap assets"
                >
                  <RefreshCw className="w-4 h-4 text-brand-400" />
                </button>
              </div>

              {/* To */}
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wider mb-1.5 block">To</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-surface-100/50 border border-glass-border rounded-lg px-3 py-3 text-lg text-white tabular-nums min-h-[52px] flex items-center">
                    {quoting ? (
                      <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
                    ) : quote ? (
                      formatNumber(parseFloat(quote.to_amount))
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </div>
                  <AssetPicker side="to" />
                </div>
              </div>

              {/* Quote preview */}
              {quote && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 space-y-1.5 text-xs"
                >
                  <div className="flex justify-between text-gray-400">
                    <span>Rate</span>
                    <span className="text-white tabular-nums">1 {fromAsset} ≈ {formatNumber(parseFloat(quote.rate))} {toAsset}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Fee</span>
                    <span className="text-white tabular-nums">${formatNumber(parseFloat(quote.fee_usd))}</span>
                  </div>
                </motion.div>
              )}

              <Button
                fullWidth
                size="lg"
                loading={converting}
                disabled={!quote || quoting || fromAsset === toAsset}
                onClick={handleConvert}
                icon={<ArrowDownUp className="w-4 h-4" />}
              >
                Convert
              </Button>
            </>
          )}
        </motion.div>
      </main>
    </div>
  );
}
