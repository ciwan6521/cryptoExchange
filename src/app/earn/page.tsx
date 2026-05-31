'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, Lock, Sparkles, Clock, CheckCircle2, Loader2,
  AlertTriangle, X, ChevronRight, Shield, Wallet,
} from 'lucide-react';
import { Header, Sidebar } from '@/components/layout';
import { Button, CoinIcon } from '@/components/ui';
import { cn } from '@/lib/utils';
import { stakingApi, ApiError, type StakingProductItem, type StakingPeriodItem, type StakingPositionItem } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useBalanceStore } from '@/stores/balance-store';
import { toast } from 'sonner';

function formatCountdown(unlockAt: string): string {
  const rem = Math.max(0, Math.floor((new Date(unlockAt).getTime() - Date.now()) / 1000));
  const d = Math.floor(rem / 86400);
  const h = Math.floor((rem % 86400) / 3600);
  const m = Math.floor((rem % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function EarnPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAuthenticated, user } = useAuthStore();
  const { balances, fetchBalances } = useBalanceStore();

  const [products, setProducts] = useState<StakingProductItem[]>([]);
  const [positions, setPositions] = useState<StakingPositionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<StakingProductItem | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<StakingPeriodItem | null>(null);
  const [amount, setAmount] = useState('');
  const [staking, setStaking] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [, setTick] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const prodRes = await stakingApi.getProducts();
      setProducts(prodRes.products || []);
      if (isAuthenticated) {
        const [posRes] = await Promise.all([
          stakingApi.getPositions(),
          fetchBalances(),
        ]);
        setPositions(posRes.positions || []);
      } else {
        setPositions([]);
      }
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, fetchBalances]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(iv);
  }, []);

  const activePositions = useMemo(
    () => positions.filter(p => p.status === 'active'),
    [positions],
  );

  const availableBalance = useMemo(() => {
    if (!selectedProduct) return 0;
    const b = balances.find(x => x.asset === selectedProduct.asset);
    return parseFloat(b?.available || '0');
  }, [balances, selectedProduct]);

  const estimatedReward = useMemo(() => {
    if (!selectedPeriod || !amount) return null;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return null;
    const pct = parseFloat(selectedPeriod.reward_percent);
    return amt * pct / 100;
  }, [amount, selectedPeriod]);

  const openStake = (product: StakingProductItem) => {
    if (!isAuthenticated) {
      toast.error('Please log in to stake');
      return;
    }
    if (user?.kycStatus !== 'approved') {
      toast.error('Complete KYC verification to stake');
      return;
    }
    setSelectedProduct(product);
    setSelectedPeriod(product.periods[0] || null);
    setAmount('');
    setError('');
  };

  const closeModal = () => {
    setSelectedProduct(null);
    setSelectedPeriod(null);
    setAmount('');
    setError('');
  };

  const handleStake = async () => {
    if (!selectedProduct || !selectedPeriod) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setError('Enter a valid amount');
      return;
    }
    if (selectedProduct.min_stake && amt < parseFloat(selectedProduct.min_stake)) {
      setError(`Minimum stake is ${selectedProduct.min_stake} ${selectedProduct.asset}`);
      return;
    }
    if (amt > availableBalance) {
      setError('Insufficient balance');
      return;
    }

    setStaking(true);
    setError('');
    try {
      await stakingApi.stake({
        product_id: selectedProduct.id,
        period_id: selectedPeriod.id,
        amount,
      });
      toast.success('Stake created', { description: `${amount} ${selectedProduct.asset} locked for ${selectedPeriod.label}` });
      closeModal();
      await loadData();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Stake failed');
    } finally {
      setStaking(false);
    }
  };

  const handleClaim = async (pos: StakingPositionItem) => {
    setClaimingId(pos.id);
    try {
      const res = await stakingApi.claim(pos.id);
      toast.success('Stake claimed', { description: `Received ${res.total_received} ${pos.asset}` });
      await loadData();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.detail : 'Claim failed');
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-surface-500">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main id="main-content" className="pt-16 pb-16">
        {/* Hero Banner */}
        <section className="relative overflow-hidden border-b border-glass-border">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-500/20 via-purple-500/10 to-surface-500" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-brand-400/10 via-transparent to-transparent" />
          <div className="relative max-w-6xl mx-auto px-4 py-14 md:py-20">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/15 border border-brand-500/25 text-brand-300 text-xs font-medium mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                Earn passive income
              </div>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-3">
                Lock & Earn
              </h1>
              <p className="text-gray-400 max-w-xl text-sm md:text-base leading-relaxed">
                Stake your crypto for a fixed period and earn guaranteed returns.
                Choose your coin, pick a lock duration, and watch your rewards grow.
              </p>
              <div className="flex flex-wrap gap-6 mt-8">
                <div>
                  <p className="text-2xl font-bold text-white">{products.length}</p>
                  <p className="text-xs text-gray-500">Assets available</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-brand-400">{activePositions.length}</p>
                  <p className="text-xs text-gray-500">Your active stakes</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Shield className="w-4 h-4 text-green-400" />
                  Funds secured in platform ledger
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-4 py-10 space-y-12">
          {/* Active Stakes */}
          {isAuthenticated && activePositions.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Lock className="w-5 h-5 text-amber-400" />
                My Active Stakes
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {activePositions.map(pos => (
                  <div key={pos.id} className="p-5 rounded-2xl bg-surface-100 border border-glass-border">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <CoinIcon symbol={pos.asset} size={36} />
                        <div>
                          <p className="font-semibold text-white">{pos.amount} {pos.asset}</p>
                          <p className="text-xs text-gray-500">{pos.product_name} · {pos.period_label}</p>
                        </div>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-brand-500/10 text-brand-400 font-medium">
                        +{pos.reward_percent}%
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div>
                        <p className="text-[11px] text-gray-500">Expected reward</p>
                        <p className="text-sm font-medium text-green-400">+{parseFloat(pos.expected_reward).toLocaleString()} {pos.asset}</p>
                      </div>
                      {pos.can_claim ? (
                        <button
                          onClick={() => handleClaim(pos)}
                          disabled={claimingId === pos.id}
                          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-green-500 hover:bg-green-400 text-white rounded-xl disabled:opacity-50"
                        >
                          {claimingId === pos.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          Claim
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                          <Clock className="w-4 h-4 text-amber-400" />
                          <span className="text-sm font-mono text-amber-300">{formatCountdown(pos.unlock_at)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Products */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-brand-400" />
              Staking Products
            </h2>

            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-16 rounded-2xl border border-dashed border-white/[0.08]">
                <TrendingUp className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No staking products available yet</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((product, i) => {
                  const maxReturn = Math.max(...product.periods.map(p => parseFloat(p.reward_percent)));
                  return (
                    <motion.button
                      key={product.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => openStake(product)}
                      className="group text-left p-5 rounded-2xl bg-surface-100 border border-glass-border hover:border-brand-500/40 hover:bg-brand-500/[0.04] transition-all"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <CoinIcon symbol={product.asset} size={44} />
                          <div>
                            <p className="font-semibold text-white group-hover:text-brand-300 transition-colors">{product.name}</p>
                            <p className="text-xs text-gray-500">{product.asset}</p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-brand-400 transition-colors" />
                      </div>
                      {product.description && (
                        <p className="text-xs text-gray-500 mb-4 line-clamp-2">{product.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {product.periods.map(p => (
                          <span key={p.id} className="text-[10px] px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-gray-400">
                            {p.label}: <span className="text-brand-400 font-semibold">{p.reward_percent}%</span>
                          </span>
                        ))}
                      </div>
                      <div className="flex items-end justify-between pt-3 border-t border-white/[0.04]">
                        <div>
                          <p className="text-[10px] text-gray-600 uppercase tracking-wide">Up to</p>
                          <p className="text-2xl font-bold text-brand-400">{maxReturn}%</p>
                        </div>
                        {product.min_stake && (
                          <p className="text-[10px] text-gray-600">Min {parseFloat(product.min_stake).toLocaleString()} {product.asset}</p>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </section>

          {!isAuthenticated && (
            <div className="p-6 rounded-2xl bg-brand-500/10 border border-brand-500/20 text-center">
              <Wallet className="w-8 h-8 text-brand-400 mx-auto mb-3" />
              <p className="text-white font-medium mb-1">Log in to start staking</p>
              <p className="text-sm text-gray-400 mb-4">Create an account and complete KYC to lock your crypto and earn rewards.</p>
              <Link href="/auth/login">
                <Button variant="primary">Log In</Button>
              </Link>
            </div>
          )}
        </div>
      </main>

      {/* Stake Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-surface-200 border border-glass-border rounded-2xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-glass-border flex items-center justify-between bg-gradient-to-r from-brand-500/10 to-transparent">
                <div className="flex items-center gap-3">
                  <CoinIcon symbol={selectedProduct.asset} size={36} />
                  <div>
                    <h3 className="font-semibold text-white">Stake {selectedProduct.asset}</h3>
                    <p className="text-xs text-gray-500">{selectedProduct.name}</p>
                  </div>
                </div>
                <button onClick={closeModal} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-2">Lock Period</label>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedProduct.periods.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPeriod(p)}
                        className={cn(
                          'p-3 rounded-xl border-2 text-left transition-all',
                          selectedPeriod?.id === p.id
                            ? 'border-brand-500/50 bg-brand-500/[0.08]'
                            : 'border-glass-border hover:border-brand-500/20',
                        )}
                      >
                        <p className="text-sm font-semibold text-white">{p.label}</p>
                        <p className="text-lg font-bold text-brand-400">{p.reward_percent}%</p>
                        <p className="text-[10px] text-gray-600">{p.duration_days} days lock</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs text-gray-500">Amount</label>
                    <button
                      type="button"
                      onClick={() => setAmount(String(availableBalance))}
                      className="text-[10px] text-brand-400 hover:text-brand-300"
                    >
                      Max: {availableBalance.toLocaleString()} {selectedProduct.asset}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 h-11 px-3 text-sm bg-white/[0.03] border border-white/[0.08] rounded-xl text-white focus:outline-none focus:border-brand-500/40"
                    />
                    <span className="flex items-center px-3 h-11 text-sm text-gray-400 bg-white/[0.03] border border-white/[0.08] rounded-xl">
                      {selectedProduct.asset}
                    </span>
                  </div>
                  {selectedProduct.min_stake && (
                    <p className="text-[10px] text-gray-600 mt-1">
                      Min: {parseFloat(selectedProduct.min_stake).toLocaleString()} {selectedProduct.asset}
                    </p>
                  )}
                </div>

                {estimatedReward != null && selectedPeriod && (
                  <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">You lock</span>
                      <span className="text-white font-medium">{amount} {selectedProduct.asset}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">Expected reward ({selectedPeriod.reward_percent}%)</span>
                      <span className="text-green-400 font-medium">+{estimatedReward.toLocaleString(undefined, { maximumFractionDigits: 8 })} {selectedProduct.asset}</span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-green-500/20">
                      <span className="text-gray-300 font-medium">Total at unlock</span>
                      <span className="text-white font-bold">
                        {(parseFloat(amount) + estimatedReward).toLocaleString(undefined, { maximumFractionDigits: 8 })} {selectedProduct.asset}
                      </span>
                    </div>
                  </div>
                )}

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-300/90">
                    Your funds will be locked for the selected period. You cannot trade or withdraw staked amounts until unlock.
                  </p>
                </div>

                {error && <p className="text-xs text-red-400">{error}</p>}

                <button
                  onClick={handleStake}
                  disabled={staking || !amount || !selectedPeriod}
                  className="w-full flex items-center justify-center gap-2 h-11 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl font-semibold text-sm"
                >
                  {staking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  {staking ? 'Locking...' : 'Confirm Stake'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
