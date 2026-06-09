'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { adminDepositsApi, type AdminDepositItem } from '@/lib/admin-api';

const STATUS_COLORS: Record<string, string> = {
  completed: 'text-profit bg-profit/10',
  pending: 'text-amber-400 bg-amber-500/10',
  confirming: 'text-blue-400 bg-blue-500/10',
  failed: 'text-red-400 bg-red-500/10',
};

export default function AdminDepositsPage() {
  const [deposits, setDeposits] = useState<AdminDepositItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<{ pending_count: number; today_completed_total: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, statsRes] = await Promise.all([
        adminDepositsApi.list({ status: statusFilter || undefined, limit: 50 }),
        adminDepositsApi.stats(),
      ]);
      setDeposits(listRes.deposits);
      setTotal(listRes.total);
      setStats(statsRes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load deposits');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-base font-semibold text-white flex items-center gap-2">
          <ArrowDownToLine className="w-4 h-4" />
          Deposits
        </h1>
        {stats && (
          <div className="flex gap-3 text-xs text-gray-500">
            <span>{stats.pending_count} pending</span>
            <span>Today: {stats.today_completed_total} USDT</span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {['', 'pending', 'confirming', 'completed', 'failed'].map(s => (
          <button
            key={s || 'all'}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1 text-xs rounded-lg border transition-colors',
              statusFilter === s
                ? 'border-brand-500/40 bg-brand-500/10 text-brand-400'
                : 'border-white/10 text-gray-500 hover:text-white',
            )}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-gray-600 animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-12 space-y-2">
          <AlertTriangle className="w-5 h-5 text-red-400 mx-auto" />
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={fetchData} className="text-xs text-gray-500 hover:text-white underline">Retry</button>
        </div>
      ) : deposits.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-600">No deposits found</div>
      ) : (
        <div className="space-y-1.5">
          {deposits.map(d => (
            <div
              key={d.id}
              className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{d.amount} {d.asset}</span>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded', STATUS_COLORS[d.status] || 'text-gray-400 bg-gray-500/10')}>
                    {d.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  User {d.user_id.slice(0, 8)}… · {d.network}
                  {d.tx_hash && ` · ${d.tx_hash.slice(0, 12)}…`}
                </p>
              </div>
              <span className="text-xs text-gray-600 flex-shrink-0">
                {d.created_at ? new Date(d.created_at).toLocaleString() : '—'}
              </span>
            </div>
          ))}
          <p className="text-xs text-gray-600 text-center pt-2">{total} total</p>
        </div>
      )}
    </div>
  );
}
