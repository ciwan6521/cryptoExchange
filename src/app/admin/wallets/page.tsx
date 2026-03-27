'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RequirePermission } from '@/components/admin/RequirePermission';

// ============================================
// Hot wallet config — GET /api/admin/wallets/hot-balances
// ============================================

interface HotBalanceRow {
  id: string;
  asset: string;
  network: string;
  address: string;
  min_balance_threshold: string;
  max_balance_threshold: string;
  is_active: boolean;
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

export default function WalletsPage() {
  const [rows, setRows] = useState<HotBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetchJson<{ balances: HotBalanceRow[] }>('/api/admin/wallets/hot-balances');
      setRows(data.balances);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load hot wallet data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <RequirePermission permission="canManageWallets">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-white">Wallet Operations</h1>
            <p className="text-[11px] text-gray-600 mt-0.5">
              Hot wallet addresses and rebalance thresholds. On-chain balances are not synced in this build.
            </p>
          </div>
          <button type="button" onClick={() => void load()} className="p-1 rounded hover:bg-white/[0.05] text-gray-500">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-1.5">{error}</p>
        )}

        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="text-gray-600 border-b border-white/[0.06]">
                <th className="text-left px-3 py-2 font-medium">Asset</th>
                <th className="text-left px-3 py-2 font-medium">Network</th>
                <th className="text-left px-3 py-2 font-medium">Address</th>
                <th className="text-right px-3 py-2 font-medium">Min threshold</th>
                <th className="text-right px-3 py-2 font-medium">Max threshold</th>
                <th className="text-center px-3 py-2 font-medium">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-3 py-2">
                          <div className="h-3 w-full max-w-[8rem] bg-white/[0.05] rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.map((r) => (
                    <tr key={r.id} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-2 text-white font-medium">{r.asset}</td>
                      <td className="px-3 py-2 text-gray-400">{r.network}</td>
                      <td className="px-3 py-2 text-gray-500 font-mono text-[10px] break-all max-w-[240px]">{r.address}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-300">{r.min_balance_threshold}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-300">{r.max_balance_threshold}</td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={cn(
                            'px-1.5 py-0.5 rounded text-[10px] font-medium',
                            r.is_active ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-500',
                          )}
                        >
                          {r.is_active ? 'Yes' : 'No'}
                        </span>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
          {!loading && rows.length === 0 && (
            <p className="text-center text-[11px] text-gray-600 py-6">No hot wallet records. Seed or configure hot wallets in the database.</p>
          )}
        </div>
      </div>
    </RequirePermission>
  );
}
