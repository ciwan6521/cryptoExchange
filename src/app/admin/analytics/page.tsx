'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RequirePermission } from '@/components/admin/RequirePermission';

// ============================================
// Analytics — aggregates from existing admin APIs
// ============================================

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

interface Snapshot {
  usersTotal: number;
  ordersTotal: number;
  pairsCount: number;
  campaignsCount: number;
  cmsCount: number;
  auditLogsTotal: number;
  hotWalletsCount: number;
  flags: Record<string, boolean> | null;
  loadedAt: string | null;
  error: string | null;
}

const emptySnapshot: Snapshot = {
  usersTotal: 0,
  ordersTotal: 0,
  pairsCount: 0,
  campaignsCount: 0,
  cmsCount: 0,
  auditLogsTotal: 0,
  hotWalletsCount: 0,
  flags: null,
  loadedAt: null,
  error: null,
};

export default function AnalyticsPage() {
  const [snap, setSnap] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setSnap((s) => ({ ...s, error: null }));
    try {
      const [
        usersRes,
        ordersRes,
        pairsRes,
        campaignsRes,
        cmsRes,
        logsRes,
        hotRes,
        flagsRes,
      ] = await Promise.all([
        adminFetchJson<{ total: number }>('/api/admin/users?limit=1&offset=0'),
        adminFetchJson<{ total: number }>('/api/admin/orders?limit=1&offset=0'),
        adminFetchJson<{ pairs: unknown[] }>('/api/admin/markets/pairs'),
        adminFetchJson<{ campaigns: unknown[] }>('/api/admin/campaigns'),
        adminFetchJson<{ content: unknown[] }>('/api/admin/cms'),
        adminFetchJson<{ total: number }>('/api/admin/logs?limit=1&offset=0'),
        adminFetchJson<{ balances: unknown[] }>('/api/admin/wallets/hot-balances'),
        adminFetchJson<{ flags: Record<string, boolean> }>('/api/admin/flags'),
      ]);

      setSnap({
        usersTotal: usersRes.total,
        ordersTotal: ordersRes.total,
        pairsCount: pairsRes.pairs.length,
        campaignsCount: campaignsRes.campaigns.length,
        cmsCount: cmsRes.content.length,
        auditLogsTotal: logsRes.total,
        hotWalletsCount: hotRes.balances.length,
        flags: flagsRes.flags,
        loadedAt: new Date().toISOString(),
        error: null,
      });
    } catch (e) {
      setSnap({
        ...emptySnapshot,
        error: e instanceof Error ? e.message : 'Failed to load analytics',
        loadedAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statRows = [
    { label: 'Registered users', value: snap.usersTotal },
    { label: 'Orders (all time)', value: snap.ordersTotal },
    { label: 'Trading pairs', value: snap.pairsCount },
    { label: 'Campaigns', value: snap.campaignsCount },
    { label: 'CMS items', value: snap.cmsCount },
    { label: 'Audit log entries', value: snap.auditLogsTotal },
    { label: 'Hot wallet configs', value: snap.hotWalletsCount },
  ];

  const flagRows = snap.flags
    ? Object.entries(snap.flags).sort(([a], [b]) => a.localeCompare(b))
    : [];

  return (
    <RequirePermission permission="canViewAnalytics">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-white">Analytics & Reporting</h1>
            <p className="text-[11px] text-gray-600 mt-0.5">
              Snapshot counts from admin APIs. Refreshed on demand — not a dedicated analytics pipeline.
            </p>
          </div>
          <button type="button" onClick={() => void load()} className="p-1 rounded hover:bg-white/[0.05] text-gray-500">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </button>
        </div>

        {snap.error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-1.5">{snap.error}</p>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[
            { label: 'Users', value: snap.usersTotal },
            { label: 'Orders', value: snap.ordersTotal },
            { label: 'Pairs', value: snap.pairsCount },
            { label: 'Campaigns', value: snap.campaignsCount },
          ].map((c) => (
            <div key={c.label} className="bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2">
              <p className="text-[10px] text-gray-600">{c.label}</p>
              <p className="text-lg font-semibold text-white tabular-nums">
                {loading ? <span className="inline-block h-6 w-10 bg-white/[0.06] rounded animate-pulse" /> : c.value}
              </p>
            </div>
          ))}
        </div>

        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
          <p className="text-[10px] text-gray-600 px-3 py-2 border-b border-white/[0.06]">Platform totals</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-600 border-b border-white/[0.06]">
                <th className="text-left px-3 py-2 font-medium">Metric</th>
                <th className="text-right px-3 py-2 font-medium">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <div className="h-3 w-32 bg-white/[0.05] rounded animate-pulse" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="h-3 w-8 bg-white/[0.05] rounded animate-pulse ml-auto" />
                      </td>
                    </tr>
                  ))
                : statRows.map((row) => (
                    <tr key={row.label} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-2 text-gray-400">{row.label}</td>
                      <td className="px-3 py-2 text-right text-white font-mono tabular-nums">{row.value}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {flagRows.length > 0 && (
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
            <p className="text-[10px] text-gray-600 px-3 py-2 border-b border-white/[0.06]">System flags (current)</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-600 border-b border-white/[0.06]">
                  <th className="text-left px-3 py-2 font-medium">Flag</th>
                  <th className="text-right px-3 py-2 font-medium">On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {flagRows.map(([key, on]) => (
                  <tr key={key} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2 text-gray-400 font-mono text-[10px]">{key}</td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[10px] font-medium',
                          on ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400',
                        )}
                      >
                        {on ? 'true' : 'false'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {snap.loadedAt && !snap.error && (
          <p className="text-[10px] text-gray-600">Last refreshed: {new Date(snap.loadedAt).toLocaleString()}</p>
        )}
      </div>
    </RequirePermission>
  );
}
