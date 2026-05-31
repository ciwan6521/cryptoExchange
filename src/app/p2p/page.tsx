'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Plus, List, Loader2, CheckCircle2, XCircle, ShoppingCart,
} from 'lucide-react';
import { Header, Sidebar } from '@/components/layout';
import { KycBanner } from '@/components/common/KycBanner';
import { Button, CoinIcon } from '@/components/ui';
import { cn, formatNumber } from '@/lib/utils';
import { p2pApi, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';

type Tab = 'market' | 'create' | 'orders';

const FIAT_CURRENCIES = ['USD', 'EUR', 'TRY'];
const PAYMENT_METHODS = ['Bank Transfer', 'Wise', 'PayPal', 'Revolut'];

export default function P2PPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAuthenticated } = useAuthStore();
  const [tab, setTab] = useState<Tab>('market');

  const [ads, setAds] = useState<Array<{
    id: string; side: string; asset: string; fiat_currency: string;
    price: string; min_amount: string; max_amount: string; payment_method: string;
  }>>([]);
  const [orders, setOrders] = useState<Array<{
    id: string; asset: string; amount: string; total_fiat: string; status: string; role: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [filterSide, setFilterSide] = useState<'buy' | 'sell'>('buy');
  const [orderAmount, setOrderAmount] = useState<Record<string, string>>({});
  const [startingId, setStartingId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const [adForm, setAdForm] = useState({
    side: 'sell',
    asset: 'USDT',
    fiat_currency: 'USD',
    price: '',
    min_amount: '',
    max_amount: '',
    payment_method: 'Bank Transfer',
  });
  const [creating, setCreating] = useState(false);

  const loadAds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await p2pApi.listAds({ side: filterSide });
      setAds(res.ads || []);
    } catch {
      setAds([]);
    } finally {
      setLoading(false);
    }
  }, [filterSide]);

  const loadOrders = useCallback(async () => {
    if (!isAuthenticated) {
      setOrders([]);
      return;
    }
    try {
      const res = await p2pApi.myOrders();
      setOrders(res.orders || []);
    } catch {
      setOrders([]);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (tab === 'market') loadAds();
    if (tab === 'orders') loadOrders();
  }, [tab, loadAds, loadOrders]);

  const handleStartOrder = async (adId: string) => {
    if (!isAuthenticated) {
      toast.error('Please log in to start an order');
      return;
    }
    const amount = orderAmount[adId];
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setStartingId(adId);
    try {
      const res = await p2pApi.startOrder(adId, amount);
      toast.success(`Order started — ${res.total_fiat} fiat total`);
      setOrderAmount(prev => ({ ...prev, [adId]: '' }));
      setTab('orders');
      await loadOrders();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Failed to start order');
    } finally {
      setStartingId(null);
    }
  };

  const handleCreateAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      toast.error('Please log in to create an ad');
      return;
    }
    setCreating(true);
    try {
      await p2pApi.createAd(adForm);
      toast.success('Ad created');
      setAdForm({ ...adForm, price: '', min_amount: '', max_amount: '' });
      setTab('market');
      await loadAds();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Failed to create ad');
    } finally {
      setCreating(false);
    }
  };

  const handleConfirm = async (orderId: string) => {
    setActionId(orderId);
    try {
      await p2pApi.confirm(orderId);
      toast.success('Order confirmed');
      await loadOrders();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Confirm failed');
    } finally {
      setActionId(null);
    }
  };

  const handleCancel = async (orderId: string) => {
    setActionId(orderId);
    try {
      await p2pApi.cancel(orderId);
      toast.success('Order cancelled');
      await loadOrders();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Cancel failed');
    } finally {
      setActionId(null);
    }
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'market', label: 'Marketplace', icon: List },
    { id: 'create', label: 'Create Ad', icon: Plus },
    { id: 'orders', label: 'My Orders', icon: ShoppingCart },
  ];

  return (
    <div className="min-h-screen bg-surface-500 flex flex-col">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="pt-16">
        <KycBanner action="use P2P trading" />
      </div>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 space-y-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2 text-brand-400 text-sm font-medium mb-1">
            <Users className="w-4 h-4" />
            P2P Marketplace
          </div>
          <h1 className="text-2xl font-display font-bold text-white">Peer-to-Peer Trading</h1>
          <p className="text-sm text-gray-400 mt-1">Buy and sell crypto directly with other users</p>
        </motion.div>

        <div className="flex gap-1 bg-white/[0.02] border border-white/[0.06] rounded-lg p-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex-1 py-2 px-3 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5',
                tab === t.id ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300',
              )}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {tab === 'market' && (
            <motion.div
              key="market"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="flex gap-2">
                {(['buy', 'sell'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFilterSide(s)}
                    className={cn(
                      'px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors',
                      filterSide === s
                        ? s === 'buy' ? 'bg-profit/20 text-profit' : 'bg-loss/20 text-loss'
                        : 'bg-surface-200 text-gray-400 hover:text-white',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
                </div>
              ) : ads.length === 0 ? (
                <p className="text-center py-16 text-sm text-gray-600">No ads available</p>
              ) : (
                <div className="space-y-3">
                  {ads.map(ad => (
                    <div
                      key={ad.id}
                      className="rounded-xl border border-glass-border bg-surface-200 p-4 flex flex-col sm:flex-row sm:items-center gap-4"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <CoinIcon symbol={ad.asset} size={36} />
                        <div>
                          <p className="text-sm font-semibold text-white flex items-center gap-2">
                            {ad.side === 'sell' ? 'Buy' : 'Sell'} {ad.asset}
                            <span className="text-xs text-gray-500 font-normal">{ad.fiat_currency}</span>
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {formatNumber(parseFloat(ad.price))} {ad.fiat_currency} · {ad.payment_method}
                          </p>
                          <p className="text-[10px] text-gray-600 mt-0.5">
                            Limit {ad.min_amount} – {ad.max_amount} {ad.asset}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:w-64">
                        <input
                          type="number"
                          min="0"
                          placeholder="Amount"
                          value={orderAmount[ad.id] || ''}
                          onChange={e => setOrderAmount(prev => ({ ...prev, [ad.id]: e.target.value }))}
                          className="flex-1 bg-surface-100 border border-glass-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-500/50"
                        />
                        <Button
                          size="sm"
                          loading={startingId === ad.id}
                          onClick={() => handleStartOrder(ad.id)}
                        >
                          Start
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {tab === 'create' && (
            <motion.form
              key="create"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              onSubmit={handleCreateAd}
              className="rounded-xl border border-glass-border bg-surface-200 p-5 space-y-4"
            >
              <h2 className="text-lg font-semibold text-white">Create Ad</h2>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Side</label>
                  <select
                    value={adForm.side}
                    onChange={e => setAdForm(f => ({ ...f, side: e.target.value }))}
                    className="w-full bg-surface-100 border border-glass-border rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="sell">Sell crypto</option>
                    <option value="buy">Buy crypto</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Asset</label>
                  <select
                    value={adForm.asset}
                    onChange={e => setAdForm(f => ({ ...f, asset: e.target.value }))}
                    className="w-full bg-surface-100 border border-glass-border rounded-lg px-3 py-2 text-sm text-white"
                  >
                    {['USDT', 'BTC', 'ETH'].map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Fiat</label>
                  <select
                    value={adForm.fiat_currency}
                    onChange={e => setAdForm(f => ({ ...f, fiat_currency: e.target.value }))}
                    className="w-full bg-surface-100 border border-glass-border rounded-lg px-3 py-2 text-sm text-white"
                  >
                    {FIAT_CURRENCIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Payment</label>
                  <select
                    value={adForm.payment_method}
                    onChange={e => setAdForm(f => ({ ...f, payment_method: e.target.value }))}
                    className="w-full bg-surface-100 border border-glass-border rounded-lg px-3 py-2 text-sm text-white"
                  >
                    {PAYMENT_METHODS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Price ({adForm.fiat_currency})</label>
                <input
                  required
                  type="number"
                  min="0"
                  step="any"
                  value={adForm.price}
                  onChange={e => setAdForm(f => ({ ...f, price: e.target.value }))}
                  className="w-full bg-surface-100 border border-glass-border rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Min amount</label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="any"
                    value={adForm.min_amount}
                    onChange={e => setAdForm(f => ({ ...f, min_amount: e.target.value }))}
                    className="w-full bg-surface-100 border border-glass-border rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Max amount</label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="any"
                    value={adForm.max_amount}
                    onChange={e => setAdForm(f => ({ ...f, max_amount: e.target.value }))}
                    className="w-full bg-surface-100 border border-glass-border rounded-lg px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>

              <Button type="submit" fullWidth loading={creating} icon={<Plus className="w-4 h-4" />}>
                Publish Ad
              </Button>
            </motion.form>
          )}

          {tab === 'orders' && (
            <motion.div
              key="orders"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {!isAuthenticated ? (
                <p className="text-center py-16 text-sm text-gray-600">Log in to view your orders</p>
              ) : orders.length === 0 ? (
                <p className="text-center py-16 text-sm text-gray-600">No orders yet</p>
              ) : (
                orders.map(order => (
                  <div
                    key={order.id}
                    className="rounded-xl border border-glass-border bg-surface-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">
                        {order.amount} {order.asset}
                        <span className="text-gray-500 font-normal ml-2">{order.total_fiat} fiat</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 capitalize">
                        {order.role} · {order.status}
                      </p>
                    </div>
                    {order.status === 'pending' && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={actionId === order.id}
                          onClick={() => handleCancel(order.id)}
                          icon={<XCircle className="w-3.5 h-3.5" />}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          loading={actionId === order.id}
                          onClick={() => handleConfirm(order.id)}
                          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                        >
                          Confirm
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
