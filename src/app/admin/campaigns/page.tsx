'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Play,
  Pause,
  Square,
  X,
  Calendar,
  Users,
  DollarSign,
  BarChart3,
  Tag,
  Trash2,
  Edit3,
  Save,
  Gift,
  Percent,
  ArrowUpRight,
  UserPlus,
  Repeat,
  Zap,
  AlertTriangle,
  Copy,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminStore, type CampaignType } from '@/stores/admin-store';
import { adminCampaignsApi, AdminApiError, type AdminCampaignItem } from '@/lib/admin-api';
import { RequirePermission } from '@/components/admin/RequirePermission';

// ============================================
// Campaigns & Promotions System
// Full campaign lifecycle management with
// detailed reward configuration and tracking.
// ============================================

const CAMPAIGN_TYPES: { value: CampaignType; label: string; description: string; icon: React.ElementType; color: string }[] = [
  { value: 'signup_bonus', label: 'Signup Bonus', description: 'Reward new registrations (e.g. $5 welcome bonus)', icon: UserPlus, color: 'text-emerald-400 bg-emerald-500/10' },
  { value: 'deposit_bonus', label: 'Deposit Bonus', description: 'Bonus on deposits (e.g. 10% on first deposit)', icon: ArrowUpRight, color: 'text-blue-400 bg-blue-500/10' },
  { value: 'trading_cashback', label: 'Trading Cashback', description: 'Cashback on trading fees (e.g. 20% fee refund)', icon: Repeat, color: 'text-cyan-400 bg-cyan-500/10' },
  { value: 'referral_bonus', label: 'Referral Bonus', description: 'Reward for referring new users', icon: Gift, color: 'text-purple-400 bg-purple-500/10' },
  { value: 'fee_discount', label: 'Fee Discount', description: 'Reduced trading fees for a period', icon: Percent, color: 'text-green-400 bg-green-500/10' },
  { value: 'volume_reward', label: 'Volume Reward', description: 'Reward for reaching volume targets', icon: Zap, color: 'text-amber-400 bg-amber-500/10' },
];

const TARGET_SEGMENTS = [
  { value: 'all', label: 'All Users' },
  { value: 'new_users', label: 'New Users (< 30 days)' },
  { value: 'verified', label: 'Verified Users Only' },
  { value: 'vip', label: 'VIP Users' },
  { value: 'inactive', label: 'Inactive Users (> 30 days)' },
];

const STATUS_CONFIG = {
  draft: { color: 'text-gray-400 bg-gray-500/10', label: 'Draft' },
  active: { color: 'text-green-400 bg-green-500/10', label: 'Active' },
  paused: { color: 'text-amber-400 bg-amber-500/10', label: 'Paused' },
  ended: { color: 'text-red-400 bg-red-500/10', label: 'Ended' },
};

// ── Shared input class ──
const inputCls = 'w-full h-8 px-3 text-xs bg-white/[0.03] border border-white/[0.08] rounded-lg text-white placeholder-gray-700 focus:outline-none focus:border-white/[0.15]';
const smallInputCls = 'w-full h-7 px-2.5 text-xs font-mono bg-white/[0.03] border border-white/[0.08] rounded-md text-white focus:outline-none focus:border-white/[0.15]';

interface CampaignFormData {
  name: string;
  description: string;
  type: CampaignType;
  startDate: string;
  endDate: string;
  targetSegment: string;
  budget: string;
  rewardAmount: string;
  rewardAsset: string;
  percentBased: boolean;
  maxPerUser: string;
  minRequirement: string;
  pairs: string[];
  dailyCap: string;
  totalCap: string;
  autoApply: boolean;
  oneTimeOnly: boolean;
}

const defaultForm: CampaignFormData = {
  name: '', description: '', type: 'signup_bonus', startDate: '', endDate: '',
  targetSegment: 'all', budget: '', rewardAmount: '5.00', rewardAsset: 'USDT',
  percentBased: false, maxPerUser: '', minRequirement: '0',
  pairs: [], dailyCap: '', totalCap: '', autoApply: true, oneTimeOnly: true,
};

function CampaignFormModal({ initial, title, submitLabel, onSubmit, onClose }: {
  initial: CampaignFormData;
  title: string;
  submitLabel: string;
  onSubmit: (form: CampaignFormData) => void;
  onClose: () => void;
}) {
  // Pairs fetched from backend if needed; for now use static list
  const tradingPairs = [{ pair: 'BTC-USDT' }, { pair: 'ETH-USDT' }, { pair: 'SOL-USDT' }];
  const [form, setForm] = useState<CampaignFormData>(initial);
  const set = (patch: Partial<CampaignFormData>) => setForm((p) => ({ ...p, ...patch }));

  const selectedType = CAMPAIGN_TYPES.find((t) => t.value === form.type);
  const canSubmit = form.name && form.startDate && form.endDate && form.rewardAmount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-[#0f0f18] border border-white/[0.08] rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-[#0f0f18] px-4 py-3 border-b border-white/[0.06] flex items-center justify-between z-10">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/[0.05] text-gray-500"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Campaign Type Selector */}
          <div>
            <label className="block text-[10px] font-medium text-gray-600 mb-1.5">Campaign Type *</label>
            <div className="grid grid-cols-3 gap-1.5">
              {CAMPAIGN_TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button key={t.value} onClick={() => set({ type: t.value })}
                    className={cn('flex flex-col items-center gap-1 p-2 rounded-lg border text-center transition-all',
                      form.type === t.value ? `${t.color} border-current` : 'text-gray-600 border-white/[0.06] hover:border-white/[0.12]'
                    )}>
                    <Icon className="w-4 h-4" />
                    <span className="text-[10px] font-medium leading-tight">{t.label}</span>
                  </button>
                );
              })}
            </div>
            {selectedType && (
              <p className="text-[10px] text-gray-600 mt-1.5">{selectedType.description}</p>
            )}
          </div>

          {/* Name & Description */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Campaign Name *</label>
              <input type="text" value={form.name} onChange={(e) => set({ name: e.target.value })}
                placeholder="e.g. Welcome $5 Bonus for New Users" className={inputCls} />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Description</label>
              <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} rows={2}
                placeholder="Describe the campaign details visible to users..."
                className="w-full text-xs bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-white placeholder-gray-700 focus:outline-none focus:border-white/[0.15] resize-none" />
            </div>
          </div>

          {/* Reward Configuration */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 space-y-3">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Reward Configuration</p>

            <div className="flex items-center gap-3 mb-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={!form.percentBased} onChange={() => set({ percentBased: false })}
                  className="w-3 h-3 accent-blue-500" />
                <span className="text-[11px] text-gray-400">Fixed Amount</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={form.percentBased} onChange={() => set({ percentBased: true })}
                  className="w-3 h-3 accent-blue-500" />
                <span className="text-[11px] text-gray-400">Percentage</span>
              </label>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-gray-600 mb-1">
                  {form.percentBased ? 'Reward %' : 'Reward Amount'} *
                </label>
                <input type="text" value={form.rewardAmount}
                  onChange={(e) => set({ rewardAmount: e.target.value.replace(/[^0-9.]/g, '') })}
                  placeholder={form.percentBased ? '10' : '5.00'} className={smallInputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-600 mb-1">Asset</label>
                <select value={form.rewardAsset} onChange={(e) => set({ rewardAsset: e.target.value })}
                  className={cn(smallInputCls, 'appearance-none')}>
                  <option value="USDT">USDT</option>
                  <option value="BTC">BTC</option>
                  <option value="ETH">ETH</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-600 mb-1">Max Per User</label>
                <input type="text" value={form.maxPerUser}
                  onChange={(e) => set({ maxPerUser: e.target.value.replace(/[^0-9.]/g, '') })}
                  placeholder="50" className={smallInputCls} />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">
                Min Requirement ({form.type === 'deposit_bonus' ? 'min deposit' : form.type === 'volume_reward' ? 'min volume' : 'min action'})
              </label>
              <input type="text" value={form.minRequirement}
                onChange={(e) => set({ minRequirement: e.target.value.replace(/[^0-9.]/g, '') })}
                placeholder="0" className={smallInputCls} />
            </div>
          </div>

          {/* Schedule & Targeting */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Start Date *</label>
              <input type="datetime-local" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })}
                className={cn(inputCls, '[color-scheme:dark]')} />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">End Date *</label>
              <input type="datetime-local" value={form.endDate} onChange={(e) => set({ endDate: e.target.value })}
                className={cn(inputCls, '[color-scheme:dark]')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Target Segment</label>
              <select value={form.targetSegment} onChange={(e) => set({ targetSegment: e.target.value })}
                className={cn(inputCls, 'appearance-none')}>
                {TARGET_SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Total Budget ({form.rewardAsset})</label>
              <input type="text" value={form.budget} onChange={(e) => set({ budget: e.target.value.replace(/[^0-9.]/g, '') })}
                placeholder="10000" className={inputCls} />
            </div>
          </div>

          {/* Caps & Rules */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Daily Cap ({form.rewardAsset})</label>
              <input type="text" value={form.dailyCap} onChange={(e) => set({ dailyCap: e.target.value.replace(/[^0-9.]/g, '') })}
                placeholder="1000" className={smallInputCls} />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Total Cap ({form.rewardAsset})</label>
              <input type="text" value={form.totalCap} onChange={(e) => set({ totalCap: e.target.value.replace(/[^0-9.]/g, '') })}
                placeholder="50000" className={smallInputCls} />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.autoApply} onChange={(e) => set({ autoApply: e.target.checked })}
                className="w-3.5 h-3.5 rounded accent-blue-500" />
              <span className="text-[11px] text-gray-400">Auto-apply (no manual claim needed)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.oneTimeOnly} onChange={(e) => set({ oneTimeOnly: e.target.checked })}
                className="w-3.5 h-3.5 rounded accent-blue-500" />
              <span className="text-[11px] text-gray-400">One-time only per user</span>
            </label>
          </div>

          {/* Applicable Pairs */}
          {['fee_discount', 'trading_cashback', 'volume_reward'].includes(form.type) && (
            <div>
              <label className="block text-[10px] font-medium text-gray-600 mb-1">Applicable Pairs (empty = all)</label>
              <div className="flex flex-wrap gap-1">
                {tradingPairs.map((p) => (
                  <button key={p.pair} onClick={() => set({
                    pairs: form.pairs.includes(p.pair) ? form.pairs.filter((x) => x !== p.pair) : [...form.pairs, p.pair]
                  })} className={cn('px-2 py-1 rounded text-[10px] font-medium border transition-colors',
                    form.pairs.includes(p.pair) ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : 'text-gray-600 border-white/[0.06]'
                  )}>{p.pair}</button>
                ))}
              </div>
            </div>
          )}

          {/* Submit */}
          <button onClick={() => canSubmit && onSubmit(form)} disabled={!canSubmit}
            className="w-full h-9 flex items-center justify-center gap-2 rounded-lg text-xs font-medium bg-blue-500/80 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Plus className="w-3.5 h-3.5" />
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function formToCreateData(form: CampaignFormData) {
  return {
    name: form.name,
    description: form.description,
    campaign_type: form.type,
    start_date: new Date(form.startDate).toISOString(),
    end_date: new Date(form.endDate).toISOString(),
    target_segment: form.targetSegment,
    reward_amount: form.rewardAmount || '0',
    reward_asset: form.rewardAsset,
    percent_based: form.percentBased,
    max_per_user: form.maxPerUser || '0',
    min_requirement: form.minRequirement || '0',
    total_budget: form.budget || '0',
    applicable_pairs: form.pairs,
    daily_cap: form.dailyCap || '0',
    total_cap: form.totalCap || '0',
    auto_apply: form.autoApply,
    one_time_only: form.oneTimeOnly,
  };
}

function campaignToForm(c: AdminCampaignItem): CampaignFormData {
  const toLocal = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + 'T' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  };
  return {
    name: c.name, description: c.description, type: c.campaign_type as CampaignType,
    startDate: toLocal(c.start_date), endDate: toLocal(c.end_date),
    targetSegment: c.target_segment, budget: c.total_budget,
    rewardAmount: c.reward_amount, rewardAsset: c.reward_asset,
    percentBased: c.percent_based, maxPerUser: c.max_per_user,
    minRequirement: c.min_requirement, pairs: c.applicable_pairs || [],
    dailyCap: c.daily_cap, totalCap: c.total_cap,
    autoApply: c.auto_apply, oneTimeOnly: c.one_time_only,
  };
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<AdminCampaignItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminCampaignItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminCampaignItem | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminCampaignsApi.list();
      setCampaigns(res.campaigns);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.detail : 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const filtered = filter === 'all' ? campaigns : campaigns.filter((c) => c.status === filter);

  const handleCreate = async (form: CampaignFormData) => {
    try {
      await adminCampaignsApi.create(formToCreateData(form));
      setShowCreate(false);
      fetchCampaigns();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.detail : 'Failed to create campaign');
    }
  };

  const handleEdit = async (form: CampaignFormData) => {
    if (!editTarget) return;
    try {
      await adminCampaignsApi.update(editTarget.id, { ...formToCreateData(form), status: editTarget.status });
      setEditTarget(null);
      fetchCampaigns();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.detail : 'Failed to update campaign');
    }
  };

  const handleStatusChange = async (c: AdminCampaignItem, newStatus: string) => {
    try {
      await adminCampaignsApi.update(c.id, { status: newStatus });
      fetchCampaigns();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.detail : 'Failed to update status');
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await adminCampaignsApi.delete(confirmDelete.id);
      setConfirmDelete(null);
      fetchCampaigns();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.detail : 'Failed to delete campaign');
    }
  };

  return (
    <RequirePermission permission="canManageCampaigns">
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-white">Campaigns & Promotions</h1>
          <p className="text-[11px] text-gray-600 mt-0.5">Create signup bonuses, deposit rewards, fee discounts, referral programs and more.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchCampaigns} className="p-1 rounded hover:bg-white/[0.05] text-gray-500">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/80 text-white hover:bg-blue-500 transition-colors">
            <Plus className="w-3.5 h-3.5" /> New Campaign
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-1.5">{error}</p>
      )}

      {/* Summary Stats */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2">
            <p className="text-[9px] text-gray-600">Total Campaigns</p>
            <p className="text-sm font-semibold text-white">{campaigns.length}</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2">
            <p className="text-[9px] text-gray-600">Active</p>
            <p className="text-sm font-semibold text-green-400">{campaigns.filter((c) => c.status === 'active').length}</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2">
            <p className="text-[9px] text-gray-600">Total Budget</p>
            <p className="text-sm font-semibold text-white">${campaigns.reduce((s, c) => s + parseFloat(c.total_budget || '0'), 0).toLocaleString()}</p>
          </div>
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2">
            <p className="text-[9px] text-gray-600">Total Spent</p>
            <p className="text-sm font-semibold text-amber-400">${campaigns.reduce((s, c) => s + parseFloat(c.spent_budget || '0'), 0).toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1">
        {(['all', 'draft', 'active', 'paused', 'ended'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('px-3 py-1 rounded-md text-[11px] font-medium transition-colors capitalize',
              filter === f ? 'bg-white/[0.08] text-white' : 'text-gray-600 hover:text-gray-400'
            )}>{f} {f !== 'all' ? `(${campaigns.filter((c) => c.status === f).length})` : `(${campaigns.length})`}</button>
        ))}
      </div>

      {/* Campaign Cards */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-white/[0.02] border border-white/[0.06] rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-8 text-center">
          <Tag className="w-8 h-8 text-gray-700 mx-auto mb-2" />
          <p className="text-xs text-gray-500">{campaigns.length === 0 ? 'No campaigns yet. Create your first campaign.' : 'No campaigns match this filter.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((campaign) => {
            const typeConfig = CAMPAIGN_TYPES.find((t) => t.value === campaign.campaign_type);
            const statusCfg = STATUS_CONFIG[campaign.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.draft;
            const TypeIcon = typeConfig?.icon || Tag;
            const budgetUsed = parseFloat(campaign.total_budget || '0') > 0
              ? ((parseFloat(campaign.spent_budget || '0') / parseFloat(campaign.total_budget)) * 100).toFixed(1)
              : '0';

            return (
              <div key={campaign.id} className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3">
                {/* Top row */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-start gap-2.5">
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5', typeConfig?.color)}>
                      <TypeIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <h3 className="text-xs font-semibold text-white">{campaign.name}</h3>
                        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', typeConfig?.color)}>{typeConfig?.label}</span>
                        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', statusCfg.color)}>{statusCfg.label}</span>
                        {campaign.one_time_only && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-500 bg-white/[0.03]">One-time</span>}
                        {campaign.auto_apply && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-blue-400 bg-blue-500/10">Auto</span>}
                      </div>
                      <p className="text-[10px] text-gray-600 max-w-lg">{campaign.description || 'No description'}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        Reward: <span className="text-white font-medium">
                          {campaign.percent_based ? `${campaign.reward_amount}%` : `${campaign.reward_amount} ${campaign.reward_asset}`}
                        </span>
                        {parseFloat(campaign.max_per_user) > 0 && <span> · Max/user: {campaign.max_per_user} {campaign.reward_asset}</span>}
                        {parseFloat(campaign.min_requirement) > 0 && <span> · Min req: {campaign.min_requirement}</span>}
                        {' · '}Target: {TARGET_SEGMENTS.find((s) => s.value === campaign.target_segment)?.label || campaign.target_segment}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-0.5 shrink-0">
                    {campaign.status === 'draft' && (
                      <button onClick={() => handleStatusChange(campaign, 'active')} className="p-1 rounded text-green-400 hover:bg-green-500/10 transition-colors" title="Activate"><Play className="w-3.5 h-3.5" /></button>
                    )}
                    {campaign.status === 'active' && (
                      <button onClick={() => handleStatusChange(campaign, 'paused')} className="p-1 rounded text-amber-400 hover:bg-amber-500/10 transition-colors" title="Pause"><Pause className="w-3.5 h-3.5" /></button>
                    )}
                    {campaign.status === 'paused' && (
                      <>
                        <button onClick={() => handleStatusChange(campaign, 'active')} className="p-1 rounded text-green-400 hover:bg-green-500/10 transition-colors" title="Resume"><Play className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleStatusChange(campaign, 'ended')} className="p-1 rounded text-red-400 hover:bg-red-500/10 transition-colors" title="End"><Square className="w-3.5 h-3.5" /></button>
                      </>
                    )}
                    <button onClick={() => setEditTarget(campaign)} className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/[0.05] transition-colors" title="Edit"><Edit3 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setConfirmDelete(campaign)} className="p-1 rounded text-red-400 hover:bg-red-500/10 transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-5 gap-2">
                  <div className="bg-white/[0.02] rounded px-2 py-1">
                    <p className="text-[9px] text-gray-600 flex items-center gap-1"><Calendar className="w-2.5 h-2.5" /> Duration</p>
                    <p className="text-[10px] text-white">{new Date(campaign.start_date).toLocaleDateString()} — {new Date(campaign.end_date).toLocaleDateString()}</p>
                  </div>
                  <div className="bg-white/[0.02] rounded px-2 py-1">
                    <p className="text-[9px] text-gray-600 flex items-center gap-1"><Users className="w-2.5 h-2.5" /> Participants</p>
                    <p className="text-[10px] text-white">{campaign.participant_count}</p>
                  </div>
                  <div className="bg-white/[0.02] rounded px-2 py-1">
                    <p className="text-[9px] text-gray-600 flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" /> Claimed</p>
                    <p className="text-[10px] text-white">{campaign.claimed_count}</p>
                  </div>
                  <div className="bg-white/[0.02] rounded px-2 py-1">
                    <p className="text-[9px] text-gray-600 flex items-center gap-1"><DollarSign className="w-2.5 h-2.5" /> Budget</p>
                    <p className="text-[10px] text-white">{campaign.total_budget} {campaign.reward_asset}</p>
                  </div>
                  <div className="bg-white/[0.02] rounded px-2 py-1">
                    <p className="text-[9px] text-gray-600 flex items-center gap-1"><BarChart3 className="w-2.5 h-2.5" /> Spent</p>
                    <p className="text-[10px] text-white">{campaign.spent_budget} <span className="text-gray-600">({budgetUsed}%)</span></p>
                  </div>
                </div>

                {/* Budget progress bar */}
                {parseFloat(campaign.total_budget || '0') > 0 && (
                  <div className="mt-2 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500/60 rounded-full transition-all" style={{ width: `${Math.min(parseFloat(budgetUsed), 100)}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CampaignFormModal initial={defaultForm} title="Create Campaign" submitLabel="Create Campaign" onSubmit={handleCreate} onClose={() => setShowCreate(false)} />
      )}
      {editTarget && (
        <CampaignFormModal initial={campaignToForm(editTarget)} title="Edit Campaign" submitLabel="Save Changes" onSubmit={handleEdit} onClose={() => setEditTarget(null)} />
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm bg-[#0f0f18] border border-white/[0.08] rounded-xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <p className="text-sm font-medium text-white">Delete Campaign</p>
            </div>
            <p className="text-xs text-gray-400 mb-1">Are you sure you want to delete <span className="text-white font-medium">&quot;{confirmDelete.name}&quot;</span>?</p>
            <p className="text-[10px] text-gray-600 mb-4">This action cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 h-8 rounded-lg text-xs font-medium text-gray-500 border border-white/[0.06] hover:bg-white/[0.04] transition-colors">Cancel</button>
              <button onClick={handleDelete} className="flex-1 h-8 rounded-lg text-xs font-medium text-white bg-red-500/80 hover:bg-red-500 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </RequirePermission>
  );
}
