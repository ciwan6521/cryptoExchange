'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Users, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { adminP2pApi, type AdminP2PAd, type AdminP2POrder } from '@/lib/admin-api';

export default function AdminP2pPage() {
  const [tab, setTab] = useState<'ads' | 'orders'>('ads');
  const [ads, setAds] = useState<AdminP2PAd[]>([]);
  const [orders, setOrders] = useState<AdminP2POrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'ads') {
        const res = await adminP2pApi.listAds({ limit: 50 });
        setAds(res.ads);
      } else {
        const res = await adminP2pApi.listOrders({ limit: 50 });
        setOrders(res.orders);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const deactivate = async (adId: string) => {
    if (!confirm('Deactivate this ad?')) return;
    try {
      await adminP2pApi.deactivateAd(adId);
      fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-base font-semibold text-white flex items-center gap-2">
        <Users className="w-4 h-4" />
        P2P Moderation
      </h1>

      <div className="flex gap-2">
        {(['ads', 'orders'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-3 py-1 text-xs rounded-lg border capitalize',
              tab === t ? 'border-brand-500/40 bg-brand-500/10 text-brand-400' : 'border-white/10 text-gray-500',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-gray-600 animate-spin" /></div>
      ) : error ? (
        <div className="text-center py-12 space-y-2">
          <AlertTriangle className="w-5 h-5 text-red-400 mx-auto" />
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={fetchData} className="text-xs underline text-gray-500">Retry</button>
        </div>
      ) : tab === 'ads' ? (
        ads.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-600">No P2P ads</div>
        ) : (
          <div className="space-y-1.5">
            {ads.map(a => (
              <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                <div className="flex-1">
                  <span className="text-sm text-white capitalize">{a.side} {a.asset}</span>
                  <p className="text-xs text-gray-500">{a.price} {a.fiat_currency} · {a.payment_method} · {a.status}</p>
                </div>
                {a.status === 'active' && (
                  <button onClick={() => deactivate(a.id)} className="text-xs text-red-400 hover:underline">Deactivate</button>
                )}
              </div>
            ))}
          </div>
        )
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-600">No P2P orders</div>
      ) : (
        <div className="space-y-1.5">
          {orders.map(o => (
            <div key={o.id} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <span className="text-sm text-white">{o.amount} {o.asset}</span>
              <p className="text-xs text-gray-500">{o.total_fiat} fiat · {o.status}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
