'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowUpFromLine,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  X,
  Copy,
} from 'lucide-react';
import { cn, formatNumber } from '@/lib/utils';
import {
  adminWithdrawalsApi,
  type AdminWithdrawalItem,
} from '@/lib/admin-api';

export default function AdminWithdrawalsPage() {
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawalItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminWithdrawalItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await adminWithdrawalsApi.listPending();
      setWithdrawals(data.withdrawals);
      setTotal(data.total);
    } catch (err: unknown) {
      setWithdrawals([]);
      setFetchError(err instanceof Error ? err.message : 'Failed to load withdrawals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const handleApprove = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await adminWithdrawalsApi.approve(selected.id);
      setSelected(null);
      fetchPending();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selected || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await adminWithdrawalsApi.reject(selected.id, rejectReason.trim());
      setSelected(null);
      fetchPending();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      setActionLoading(false);
    }
  };

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr).catch(() => {});
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-white flex items-center gap-2">
          <ArrowUpFromLine className="w-4 h-4" />
          Pending Withdrawals
        </h1>
        <span className="text-xs text-gray-500">{total} pending</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-gray-600 animate-spin" />
        </div>
      ) : fetchError ? (
        <div className="text-center py-12 space-y-2">
          <AlertTriangle className="w-5 h-5 text-red-400 mx-auto" />
          <p className="text-sm text-red-400">{fetchError}</p>
          <button onClick={fetchPending} className="text-xs text-gray-500 hover:text-white underline">
            Retry
          </button>
        </div>
      ) : withdrawals.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-600">
          No pending withdrawals
        </div>
      ) : (
        <div className="space-y-1.5">
          {withdrawals.map(w => (
            <button
              key={w.id}
              onClick={() => {
                setSelected(w);
                setShowRejectInput(false);
                setRejectReason('');
              }}
              className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white">
                    {formatNumber(parseFloat(w.amount))} {w.asset}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400">
                    {w.network}
                  </span>
                  {w.requires_multi_approval && (
                    <span className="text-[10px] text-gray-500">
                      {w.approvals_received}/{w.approvals_required} approvals
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 truncate mt-0.5 font-mono">{w.to_address}</p>
              </div>
              <span className="text-[10px] text-gray-600 flex-shrink-0">
                {w.created_at ? new Date(w.created_at).toLocaleString() : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative bg-[#12121a] border border-white/[0.08] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#12121a] border-b border-white/[0.06] p-4 flex items-center justify-between z-10">
              <h2 className="text-sm font-semibold text-white">Review Withdrawal</h2>
              <button onClick={() => setSelected(null)} className="p-1 rounded-lg hover:bg-white/[0.06]">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="Amount" value={`${selected.amount} ${selected.asset}`} />
                <InfoRow label="Fee" value={`${selected.fee} ${selected.asset}`} />
                <InfoRow label="Network" value={selected.network} />
                <InfoRow label="User ID" value={selected.user_id.slice(0, 8) + '…'} />
              </div>

              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Destination</p>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <p className="text-xs text-white font-mono break-all flex-1">{selected.to_address}</p>
                  <button
                    type="button"
                    onClick={() => copyAddress(selected.to_address)}
                    className="p-1 rounded hover:bg-white/[0.06]"
                  >
                    <Copy className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                </div>
              </div>

              {selected.requires_multi_approval && (
                <p className="text-xs text-amber-400">
                  Multi-approval required: {selected.approvals_received}/{selected.approvals_required}
                </p>
              )}

              <div className="border-t border-white/[0.06] pt-4 space-y-3">
                {showRejectInput ? (
                  <div className="space-y-2">
                    <textarea
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder="Rejection reason (required)..."
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg p-3 text-xs text-white placeholder-gray-600 resize-none h-20 focus:outline-none focus:border-red-500/40"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowRejectInput(false)}
                        className="flex-1 py-2 rounded-lg text-xs font-medium text-gray-400 bg-white/[0.04] hover:bg-white/[0.06] transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleReject}
                        disabled={actionLoading || !rejectReason.trim()}
                        className="flex-1 py-2 rounded-lg text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                      >
                        {actionLoading ? 'Rejecting...' : 'Confirm Reject'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowRejectInput(true)}
                      className="flex-1 py-2.5 rounded-lg text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Reject
                    </button>
                    <button
                      onClick={handleApprove}
                      disabled={actionLoading}
                      className="flex-1 py-2.5 rounded-lg text-xs font-medium text-green-400 bg-green-500/10 hover:bg-green-500/20 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {actionLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                      Approve
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
      <p className="text-[10px] text-gray-600 uppercase tracking-wider">{label}</p>
      <p className="text-xs text-white truncate mt-0.5">{value}</p>
    </div>
  );
}
