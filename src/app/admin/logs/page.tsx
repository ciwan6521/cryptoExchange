'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Download,
  Clock,
  User,
  Shield,
  Wallet,
  ArrowLeftRight,
  BarChart3,
  Megaphone,
  CreditCard,
  KeyRound,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { adminLogsApi, AdminApiError, type AuditLogItem } from '@/lib/admin-api';
import { RequirePermission } from '@/components/admin/RequirePermission';

// ============================================
// Audit Logs & Compliance Viewer — wired to real backend
// ============================================

const TARGET_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  admin_user: { icon: KeyRound, color: 'text-purple-400 bg-purple-500/10', label: 'Auth' },
  user: { icon: User, color: 'text-blue-400 bg-blue-500/10', label: 'User' },
  campaign: { icon: Megaphone, color: 'text-pink-400 bg-pink-500/10', label: 'Campaign' },
  cms_content: { icon: Megaphone, color: 'text-indigo-400 bg-indigo-500/10', label: 'CMS' },
  system_flag: { icon: Shield, color: 'text-red-400 bg-red-500/10', label: 'System' },
  trading_pair: { icon: ArrowLeftRight, color: 'text-amber-400 bg-amber-500/10', label: 'Market' },
};

const TARGET_TYPE_FILTERS = ['all', 'user', 'admin_user', 'campaign', 'cms_content', 'system_flag', 'trading_pair'];

function exportCSV(entries: AuditLogItem[]) {
  const headers = ['Timestamp', 'Admin ID', 'Action', 'Target Type', 'Target ID', 'Details', 'IP'];
  const rows = entries.map((e) => [
    e.created_at,
    e.admin_id || '',
    e.action,
    e.target_type,
    e.target_id || '',
    `"${JSON.stringify(e.details || {}).replace(/"/g, '""')}"`,
    e.ip_address || '',
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LogsPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetTypeFilter, setTargetTypeFilter] = useState('all');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: { target_type?: string; limit: number } = { limit: 200 };
      if (targetTypeFilter !== 'all') params.target_type = targetTypeFilter;
      const res = await adminLogsApi.list(params);
      setLogs(res.logs);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.detail : 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [targetTypeFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <RequirePermission permission="canViewLogs">
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Audit Logs</h1>
          <p className="text-[11px] text-gray-600 mt-0.5">{total} total entries</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchLogs} className="p-1 rounded hover:bg-white/[0.05] text-gray-500">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => exportCSV(logs)}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 border border-white/[0.06] hover:bg-white/[0.04] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-1.5">{error}</p>
      )}

      {/* Filters */}
      <div className="flex gap-1 flex-wrap">
        {TARGET_TYPE_FILTERS.map((tt) => (
          <button
            key={tt}
            onClick={() => setTargetTypeFilter(tt)}
            className={cn(
              'px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors capitalize',
              targetTypeFilter === tt ? 'bg-white/[0.08] text-white' : 'text-gray-600 hover:text-gray-400'
            )}
          >
            {tt === 'all' ? 'All' : (TARGET_TYPE_CONFIG[tt]?.label || tt)}
          </button>
        ))}
      </div>

      {/* Log Table */}
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-x-auto">
        <table className="w-full text-xs min-w-[700px]">
          <thead>
            <tr className="text-gray-600 border-b border-white/[0.06]">
              <th className="text-left px-3 py-2 font-medium w-40">Timestamp</th>
              <th className="text-left px-3 py-2 font-medium">Type</th>
              <th className="text-left px-3 py-2 font-medium">Action</th>
              <th className="text-left px-3 py-2 font-medium">Target</th>
              <th className="text-left px-3 py-2 font-medium">Details</th>
              <th className="text-left px-3 py-2 font-medium">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-3 py-2"><div className="h-3 w-28 bg-white/[0.05] rounded animate-pulse" /></td>
                  <td className="px-3 py-2"><div className="h-3 w-14 bg-white/[0.05] rounded animate-pulse" /></td>
                  <td className="px-3 py-2"><div className="h-3 w-20 bg-white/[0.05] rounded animate-pulse" /></td>
                  <td className="px-3 py-2"><div className="h-3 w-16 bg-white/[0.05] rounded animate-pulse" /></td>
                  <td className="px-3 py-2"><div className="h-3 w-32 bg-white/[0.05] rounded animate-pulse" /></td>
                  <td className="px-3 py-2"><div className="h-3 w-16 bg-white/[0.05] rounded animate-pulse" /></td>
                </tr>
              ))
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-600">
                  No audit entries found.
                </td>
              </tr>
            ) : (
              logs.map((entry) => {
                const typeConfig = TARGET_TYPE_CONFIG[entry.target_type] || TARGET_TYPE_CONFIG.user;
                const TypeIcon = typeConfig.icon;

                return (
                  <tr key={entry.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-gray-700" />
                        {new Date(entry.created_at).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium', typeConfig.color)}>
                        <TypeIcon className="w-2.5 h-2.5" />
                        {typeConfig.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-white font-medium">{entry.action}</td>
                    <td className="px-3 py-2 text-gray-400 font-mono text-[10px]">{entry.target_id || '—'}</td>
                    <td className="px-3 py-2 text-gray-500 max-w-[250px] truncate">
                      {entry.details ? JSON.stringify(entry.details) : '—'}
                    </td>
                    <td className="px-3 py-2 text-gray-600 font-mono text-[10px]">{entry.ip_address || '—'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
    </RequirePermission>
  );
}
