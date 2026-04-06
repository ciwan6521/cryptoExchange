'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ScanFace,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  X,
  Loader2,
  User,
  Phone,
  Mail,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { adminKYCApi, type KYCRequestItem, type KYCDocItem } from '@/lib/admin-api';

type TabFilter = 'pending' | 'approved' | 'rejected';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', color: 'text-amber-400', bg: 'bg-amber-500/10', icon: Clock },
  approved: { label: 'Approved', color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'text-red-400', bg: 'bg-red-500/10', icon: XCircle },
};

export default function AdminKYCPage() {
  const [tab, setTab] = useState<TabFilter>('pending');
  const [requests, setRequests] = useState<KYCRequestItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<KYCRequestItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await adminKYCApi.list({ status: tab, limit: 50 });
      setRequests(data.requests);
      setTotal(data.total);
    } catch (err: unknown) {
      setRequests([]);
      setFetchError(err instanceof Error ? err.message : 'Failed to load KYC requests');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const openDetail = async (item: KYCRequestItem) => {
    setDetailLoading(true);
    setSelected(item);
    setShowRejectInput(false);
    setRejectReason('');
    try {
      const detail = await adminKYCApi.getDetail(item.user_id);
      setSelected(detail);
    } catch {
      // keep the list-level data
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await adminKYCApi.approve(selected.user_id);
      setSelected(null);
      fetchRequests();
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
      await adminKYCApi.reject(selected.user_id, rejectReason.trim());
      setSelected(null);
      fetchRequests();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-white flex items-center gap-2">
          <ScanFace className="w-4 h-4" />
          KYC Requests
        </h1>
        <span className="text-xs text-gray-500">{total} total</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/[0.02] border border-white/[0.06] rounded-lg p-1">
        {(['pending', 'approved', 'rejected'] as TabFilter[]).map(t => {
          const cfg = STATUS_CONFIG[t];
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1.5',
                tab === t ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300'
              )}
            >
              <cfg.icon className="w-3 h-3" />
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-gray-600 animate-spin" />
        </div>
      ) : fetchError ? (
        <div className="text-center py-12 space-y-2">
          <AlertTriangle className="w-5 h-5 text-red-400 mx-auto" />
          <p className="text-sm text-red-400">{fetchError}</p>
          <button onClick={fetchRequests} className="text-xs text-gray-500 hover:text-white underline">Retry</button>
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-600">
          No {tab} KYC requests
        </div>
      ) : (
        <div className="space-y-1.5">
          {requests.map(r => {
            const cfg = STATUS_CONFIG[r.kyc_status] || STATUS_CONFIG.pending;
            const fullName = [r.first_name, r.last_name].filter(Boolean).join(' ') || r.username;
            const docCount = r.documents?.length || 0;
            return (
              <button
                key={r.user_id}
                onClick={() => openDetail(r)}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white truncate">{fullName}</span>
                    <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', cfg.bg, cfg.color)}>
                      {cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-gray-500 truncate">{r.email}</span>
                    <span className="text-[10px] text-gray-600">{docCount} doc{docCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative bg-[#12121a] border border-white/[0.08] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-[#12121a] border-b border-white/[0.06] p-4 flex items-center justify-between z-10">
              <h2 className="text-sm font-semibold text-white">KYC Review</h2>
              <button onClick={() => setSelected(null)} className="p-1 rounded-lg hover:bg-white/[0.06]">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-5">
              {/* User Info */}
              <div className="grid grid-cols-2 gap-3">
                <InfoRow icon={User} label="Name" value={[selected.first_name, selected.last_name].filter(Boolean).join(' ') || '-'} />
                <InfoRow icon={User} label="Username" value={selected.username} />
                <InfoRow icon={Mail} label="Email" value={selected.email} />
                <InfoRow icon={Phone} label="Phone" value={selected.phone || '-'} />
              </div>

              {/* Documents */}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Documents</h3>
                {detailLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 text-gray-600 animate-spin" />
                  </div>
                ) : !selected.documents?.length ? (
                  <p className="text-xs text-gray-600 text-center py-4">No documents uploaded</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {selected.documents.map(doc => (
                      <DocCard
                        key={doc.id}
                        doc={doc}
                        onPreview={() => setPreviewDoc(adminKYCApi.getDocumentUrl(doc.id))}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              {selected.kyc_status === 'pending' && (
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
              )}

              {selected.kyc_status === 'approved' && (
                <div className="border-t border-white/[0.06] pt-4 flex items-center gap-2 justify-center">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-green-400 font-medium">KYC Approved</span>
                </div>
              )}

              {selected.kyc_status === 'rejected' && (
                <div className="border-t border-white/[0.06] pt-4">
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/[0.06] border border-red-500/10">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-medium text-red-400 mb-0.5">Rejected</p>
                      <p className="text-[11px] text-gray-400">
                        {selected.documents?.find(d => d.rejection_reason)?.rejection_reason || 'No reason provided'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80" onClick={() => setPreviewDoc(null)} />
          <div className="relative max-w-3xl max-h-[85vh]">
            <button
              onClick={() => setPreviewDoc(null)}
              className="absolute -top-10 right-0 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>
            <img
              src={previewDoc}
              alt="KYC Document"
              className="max-w-full max-h-[85vh] rounded-xl object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
      <Icon className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-gray-600 uppercase tracking-wider">{label}</p>
        <p className="text-xs text-white truncate">{value}</p>
      </div>
    </div>
  );
}

function DocCard({ doc, onPreview }: { doc: KYCDocItem; onPreview: () => void }) {
  const cfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending;
  const typeLabel = doc.document_type === 'id_front' ? 'ID Front' : doc.document_type === 'id_back' ? 'ID Back' : doc.document_type === 'proof_of_address' ? 'Proof of Address' : doc.document_type;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <button
        onClick={onPreview}
        className="w-full aspect-[16/10] bg-black/20 flex items-center justify-center hover:bg-black/30 transition-colors group"
      >
        <img
          src={adminKYCApi.getDocumentUrl(doc.id)}
          alt={typeLabel}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
            (e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="flex flex-col items-center gap-1"><svg class="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg><span class="text-[10px] text-gray-600">Click to load</span></div>';
          }}
        />
      </button>
      <div className="p-2.5 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-white">{typeLabel}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">{doc.created_at ? new Date(doc.created_at).toLocaleDateString() : ''}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', cfg.bg, cfg.color)}>
            {cfg.label}
          </span>
          <button onClick={onPreview} className="p-1 rounded hover:bg-white/[0.06] transition-colors">
            <Eye className="w-3 h-3 text-gray-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
