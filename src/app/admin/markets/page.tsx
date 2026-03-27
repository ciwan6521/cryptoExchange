'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RequirePermission } from '@/components/admin/RequirePermission';

// ============================================
// Market pairs — GET/PATCH /api/admin/markets/pairs
// ============================================

interface TradingPairRow {
  id: string;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  is_enabled: boolean;
  maker_fee: string;
  taker_fee: string;
  min_order_size: string;
  max_order_size: string;
  min_notional: string;
  tick_size: string;
  step_size: string;
}

async function adminFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
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
  if (res.status === 204) return {} as T;
  return res.json();
}

export default function MarketsPage() {
  const [pairs, setPairs] = useState<TradingPairRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busySymbol, setBusySymbol] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetchJson<{ pairs: TradingPairRow[] }>('/api/admin/markets/pairs');
      setPairs(data.pairs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load pairs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleEnabled = async (symbol: string, next: boolean) => {
    setBusySymbol(symbol);
    setError(null);
    try {
      await adminFetchJson(`/api/admin/markets/pairs/${encodeURIComponent(symbol)}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_enabled: next }),
      });
      setPairs((prev) => prev.map((p) => (p.symbol === symbol ? { ...p, is_enabled: next } : p)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusySymbol(null);
    }
  };

  return (
    <RequirePermission permission="canManageMarkets">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-white">Market & Pair Configuration</h1>
            <p className="text-[11px] text-gray-600 mt-0.5">Trading pairs, fees, and limits.</p>
          </div>
          <button type="button" onClick={() => void load()} className="p-1 rounded hover:bg-white/[0.05] text-gray-500">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-1.5">{error}</p>
        )}

        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-x-auto">
          <table className="w-full text-xs min-w-[960px]">
            <thead>
              <tr className="text-gray-600 border-b border-white/[0.06]">
                <th className="text-left px-3 py-2 font-medium">Pair</th>
                <th className="text-center px-3 py-2 font-medium">Enabled</th>
                <th className="text-right px-3 py-2 font-medium">Maker</th>
                <th className="text-right px-3 py-2 font-medium">Taker</th>
                <th className="text-right px-3 py-2 font-medium">Min size</th>
                <th className="text-right px-3 py-2 font-medium">Max size</th>
                <th className="text-right px-3 py-2 font-medium">Min notional</th>
                <th className="text-right px-3 py-2 font-medium hidden xl:table-cell">Tick</th>
                <th className="text-right px-3 py-2 font-medium hidden xl:table-cell">Step</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 9 }).map((__, j) => (
                        <td key={j} className="px-3 py-2">
                          <div className="h-3 w-16 bg-white/[0.05] rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : pairs.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-2">
                        <p className="text-white font-medium">{p.symbol}</p>
                        <p className="text-[10px] text-gray-600">
                          {p.base_asset} / {p.quote_asset}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          disabled={busySymbol === p.symbol}
                          onClick={() => void toggleEnabled(p.symbol, !p.is_enabled)}
                          className={cn(
                            'px-2 py-0.5 rounded text-[10px] font-medium transition-colors disabled:opacity-40',
                            p.is_enabled ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400',
                          )}
                        >
                          {busySymbol === p.symbol ? '…' : p.is_enabled ? 'On' : 'Off'}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-300">{p.maker_fee}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-300">{p.taker_fee}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-400">{p.min_order_size}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-400">{p.max_order_size}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-400">{p.min_notional}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-500 hidden xl:table-cell">{p.tick_size}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-500 hidden xl:table-cell">{p.step_size}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
          {!loading && pairs.length === 0 && (
            <p className="text-center text-[11px] text-gray-600 py-6">No trading pairs configured.</p>
          )}
        </div>
      </div>
    </RequirePermission>
  );
}
