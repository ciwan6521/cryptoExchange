'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RequirePermission } from '@/components/admin/RequirePermission';

// ============================================
// Admin orders — GET /api/admin/orders
// ============================================

interface AdminOrderRow {
  id: string;
  user_id: string;
  symbol: string;
  side: string;
  order_type: string;
  status: string;
  price: string | null;
  quantity: string;
  filled_quantity: string;
  remaining: string;
  created_at: string | null;
}

async function adminFetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [symbolFilter, setSymbolFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      params.set('offset', '0');
      if (statusFilter.trim()) params.set('status', statusFilter.trim());
      if (symbolFilter.trim()) params.set('symbol', symbolFilter.trim().toUpperCase());
      const data = await adminFetchJson<{ orders: AdminOrderRow[]; total: number }>(
        `/api/admin/orders?${params.toString()}`,
      );
      setOrders(data.orders);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, symbolFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <RequirePermission permission="canManageOrders">
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold text-white">Orders & Trades</h1>
            <p className="text-[11px] text-gray-600 mt-0.5">All platform orders (newest first).</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-600">{total} total</span>
            <button
              type="button"
              onClick={() => void load()}
              className="p-1 rounded hover:bg-white/[0.05] text-gray-500"
              aria-label="Refresh"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void load()}
            placeholder="Symbol (e.g. BTC-USDT)"
            className="h-8 px-3 text-xs bg-white/[0.03] border border-white/[0.08] rounded-lg text-white placeholder-gray-700 focus:outline-none focus:border-white/[0.15] w-40"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 px-2 text-xs bg-white/[0.03] border border-white/[0.08] rounded-lg text-white focus:outline-none focus:border-white/[0.15]"
          >
            <option value="">All statuses</option>
            <option value="open">open</option>
            <option value="partially_filled">partially_filled</option>
            <option value="filled">filled</option>
            <option value="cancelled">cancelled</option>
            <option value="expired">expired</option>
          </select>
          <button
            type="button"
            onClick={() => void load()}
            className="h-8 px-3 text-[11px] font-medium rounded-lg bg-white/[0.06] text-gray-300 hover:bg-white/[0.1]"
          >
            Apply
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-1.5">{error}</p>
        )}

        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-x-auto">
          <table className="w-full text-xs min-w-[720px]">
            <thead>
              <tr className="text-gray-600 border-b border-white/[0.06]">
                <th className="text-left px-3 py-2 font-medium">Time</th>
                <th className="text-left px-3 py-2 font-medium">Symbol</th>
                <th className="text-left px-3 py-2 font-medium">Side</th>
                <th className="text-left px-3 py-2 font-medium">Type</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-right px-3 py-2 font-medium">Price</th>
                <th className="text-right px-3 py-2 font-medium">Qty / Filled</th>
                <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-3 py-2">
                          <div className="h-3 w-full max-w-[6rem] bg-white/[0.05] rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : orders.map((o) => (
                    <tr key={o.id} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                        {o.created_at ? new Date(o.created_at).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2 text-white font-medium">{o.symbol}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-medium',
                            o.side === 'buy' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400',
                          )}
                        >
                          {o.side}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-400">{o.order_type}</td>
                      <td className="px-3 py-2 text-gray-400">{o.status}</td>
                      <td className="px-3 py-2 text-right text-gray-300 font-mono">{o.price ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-300 font-mono">
                        {o.quantity} / {o.filled_quantity}
                      </td>
                      <td className="px-3 py-2 text-gray-600 font-mono text-[10px] hidden lg:table-cell truncate max-w-[8rem]" title={o.user_id}>
                        {o.user_id.slice(0, 8)}…
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
          {!loading && orders.length === 0 && (
            <p className="text-center text-[11px] text-gray-600 py-6">No orders match the current filters.</p>
          )}
        </div>
      </div>
    </RequirePermission>
  );
}
