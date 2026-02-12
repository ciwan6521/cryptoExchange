'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Plus,
  Minus,
  AlertTriangle,
  X,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminStore } from '@/stores/admin-store';
import { RequirePermission } from '@/components/admin/RequirePermission';
import { adminUsersApi, adminLogsApi, AdminApiError, type AdminUserItem, type AuditLogItem } from '@/lib/admin-api';

// ============================================
// Balance & Internal Ledger Module — wired to real backend
// Credit/debit goes through LedgerService on backend.
// ============================================

function AdjustmentModal({
  user,
  onClose,
  onDone,
}: {
  user: AdminUserItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const hasPermission = useAdminStore((s) => s.hasPermission);
  const canManage = hasPermission('canManageBalances');
  const [asset, setAsset] = useState('USDT');
  const [type, setType] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = () => {
    if (!amount || parseFloat(amount) <= 0) { setError('Enter a valid amount'); return; }
    if (!reason.trim()) { setError('Reason is mandatory'); return; }
    setError('');
    setStep('confirm');
  };

  const handleConfirm = async () => {
    if (!canManage) return;
    setSubmitting(true);
    setError('');
    try {
      const fn = type === 'credit' ? adminUsersApi.credit : adminUsersApi.debit;
      await fn(user.id, { asset: asset.toUpperCase(), amount, reason: reason.trim() });
      onDone();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.detail : 'Operation failed');
      setStep('form');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-[#0f0f18] border border-white/[0.08] rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Balance Adjustment — {user.username}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/[0.05] text-gray-500"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-3">
          {step === 'form' && (
            <>
              {/* Asset */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Asset</label>
                <input
                  type="text"
                  value={asset}
                  onChange={(e) => setAsset(e.target.value.toUpperCase())}
                  placeholder="USDT"
                  className="w-full h-8 px-3 text-xs bg-white/[0.03] border border-white/[0.08] rounded-lg text-white placeholder-gray-700 focus:outline-none focus:border-white/[0.15]"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Type</label>
                <div className="flex gap-1">
                  <button
                    onClick={() => setType('credit')}
                    className={cn('flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium transition-colors',
                      type === 'credit' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'text-gray-600 border border-white/[0.06]'
                    )}
                  >
                    <Plus className="w-3 h-3" /> Credit
                  </button>
                  <button
                    onClick={() => setType('debit')}
                    className={cn('flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium transition-colors',
                      type === 'debit' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-gray-600 border border-white/[0.06]'
                    )}
                  >
                    <Minus className="w-3 h-3" /> Debit
                  </button>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Amount</label>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00000000"
                  className="w-full h-8 px-3 text-xs font-mono bg-white/[0.03] border border-white/[0.08] rounded-lg text-white placeholder-gray-700 focus:outline-none focus:border-white/[0.15]"
                />
              </div>

              {/* Reason (mandatory) */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-1">Reason <span className="text-red-400">*</span></label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="Mandatory reason for this adjustment..."
                  className="w-full text-xs bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-gray-700 focus:outline-none focus:border-white/[0.15] resize-none"
                />
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-1.5">{error}</p>
              )}

              <button
                onClick={handleSubmit}
                className="w-full h-8 rounded-lg text-xs font-medium bg-white/[0.06] text-white hover:bg-white/[0.1] transition-colors"
              >
                Review Adjustment
              </button>
            </>
          )}

          {step === 'confirm' && (
            <>
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <p className="text-xs font-medium text-amber-400">Confirm Balance Change</p>
                </div>
                <div className="space-y-1 text-[11px]">
                  <p className="text-gray-400">User: <span className="text-white">{user.email}</span></p>
                  <p className="text-gray-400">Asset: <span className="text-white">{asset}</span></p>
                  <p className="text-gray-400">Type: <span className={type === 'credit' ? 'text-green-400' : 'text-red-400'}>{type.toUpperCase()}</span></p>
                  <p className="text-gray-400">Amount: <span className="text-white font-mono">{amount}</span></p>
                  <p className="text-gray-400">Reason: <span className="text-white">{reason}</span></p>
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-1.5">{error}</p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setStep('form')}
                  disabled={submitting}
                  className="flex-1 h-8 rounded-lg text-xs font-medium text-gray-500 border border-white/[0.06] hover:bg-white/[0.04] transition-colors disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={submitting}
                  className="flex-1 h-8 rounded-lg text-xs font-medium bg-red-500/80 text-white hover:bg-red-500 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Processing...' : 'Confirm Adjustment'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BalancesPage() {
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [adjustUser, setAdjustUser] = useState<AdminUserItem | null>(null);
  const [recentLogs, setRecentLogs] = useState<AuditLogItem[]>([]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminUsersApi.list({ search: search || undefined, limit: 50 });
      setUsers(res.users);
    } catch { /* ignore */ }
    setLoading(false);
  }, [search]);

  const fetchRecentAdjustments = useCallback(async () => {
    try {
      const [credits, debits] = await Promise.all([
        adminLogsApi.list({ action: 'admin_credit', limit: 10 }),
        adminLogsApi.list({ action: 'admin_debit', limit: 10 }),
      ]);
      const combined = [...credits.logs, ...debits.logs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 20);
      setRecentLogs(combined);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const timer = setTimeout(fetchUsers, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchUsers, search]);

  useEffect(() => { fetchRecentAdjustments(); }, [fetchRecentAdjustments]);

  return (
    <RequirePermission permission="canManageBalances">
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-white">Balance & Ledger</h1>
        <button onClick={() => { fetchUsers(); fetchRecentAdjustments(); }} className="p-1 rounded hover:bg-white/[0.05] text-gray-500">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users..."
          className="w-full h-8 pl-9 pr-3 text-xs bg-white/[0.03] border border-white/[0.08] rounded-lg text-white placeholder-gray-700 focus:outline-none focus:border-white/[0.15]"
        />
      </div>

      {/* User Table */}
      <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-600 border-b border-white/[0.06]">
              <th className="text-left px-3 py-2 font-medium">User</th>
              <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Status</th>
              <th className="text-right px-3 py-2 font-medium w-24">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-3 py-2"><div className="h-3 w-24 bg-white/[0.05] rounded animate-pulse" /></td>
                  <td className="px-3 py-2 hidden md:table-cell"><div className="h-3 w-16 bg-white/[0.05] rounded animate-pulse" /></td>
                  <td className="px-3 py-2"></td>
                </tr>
              ))
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2">
                    <p className="text-white font-medium">{user.username}</p>
                    <p className="text-[10px] text-gray-600">{user.email}</p>
                  </td>
                  <td className="px-3 py-2 hidden md:table-cell">
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', user.is_active ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400')}>
                      {user.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setAdjustUser(user)}
                      className="px-2 py-1 rounded text-[10px] font-medium text-blue-400 hover:bg-blue-500/10 transition-colors"
                    >
                      Adjust
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!loading && users.length === 0 && (
          <p className="text-center text-[11px] text-gray-600 py-6">No users found</p>
        )}
      </div>

      {/* Recent Adjustments from audit log */}
      {recentLogs.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-white mb-2">Recent Adjustments (Audit Log)</h2>
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-gray-600 border-b border-white/[0.06]">
                  <th className="text-left px-3 py-1.5 font-medium">Time</th>
                  <th className="text-left px-3 py-1.5 font-medium">Action</th>
                  <th className="text-left px-3 py-1.5 font-medium hidden lg:table-cell">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {recentLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-3 py-1.5 text-gray-500">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="px-3 py-1.5">
                      <span className={cn(log.action === 'admin_credit' ? 'text-green-400' : 'text-red-400')}>
                        {log.action.replace('admin_', '').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-500 hidden lg:table-cell truncate max-w-[300px]">
                      {log.details ? `${(log.details as any).amount} ${(log.details as any).asset} — ${(log.details as any).reason}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adjustment Modal */}
      {adjustUser && (
        <AdjustmentModal
          user={adjustUser}
          onClose={() => setAdjustUser(null)}
          onDone={() => { setAdjustUser(null); fetchRecentAdjustments(); }}
        />
      )}
    </div>
    </RequirePermission>
  );
}
