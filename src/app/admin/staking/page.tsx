'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus, Lock, Edit3, Trash2, RefreshCw, X, Save, Loader2, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { adminStakingApi, AdminApiError, type AdminStakingProduct } from '@/lib/admin-api';
import { RequirePermission } from '@/components/admin/RequirePermission';
import { CoinIcon } from '@/components/ui';

interface PeriodFormRow {
  label: string;
  duration_days: string;
  reward_percent: string;
  is_active: boolean;
}

const emptyPeriod = (): PeriodFormRow => ({
  label: '3 Months',
  duration_days: '90',
  reward_percent: '5',
  is_active: true,
});

const normalizeDecimal = (value: string) => value.trim().replace(',', '.').replace(/%/g, '');

const inputCls = 'w-full h-9 px-3 text-sm bg-white/[0.03] border border-white/[0.08] rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-brand-500/40';

export default function AdminStakingPage() {
  const [products, setProducts] = useState<AdminStakingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminStakingProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const [asset, setAsset] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [minStake, setMinStake] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [periods, setPeriods] = useState<PeriodFormRow[]>([emptyPeriod()]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminStakingApi.listProducts();
      setProducts(data.products || []);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.detail : 'Failed to load staking products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const openCreate = () => {
    setEditing(null);
    setAsset('');
    setName('');
    setDescription('');
    setMinStake('');
    setIsActive(true);
    setPeriods([emptyPeriod()]);
    setModalError('');
    setModalOpen(true);
  };

  const openEdit = (p: AdminStakingProduct) => {
    setEditing(p);
    setAsset(p.asset);
    setName(p.name);
    setDescription(p.description || '');
    setMinStake(p.min_stake || '');
    setIsActive(p.is_active);
    setPeriods(
      p.periods.length > 0
        ? p.periods.map(pr => ({
            label: pr.label,
            duration_days: String(pr.duration_days),
            reward_percent: pr.reward_percent,
            is_active: pr.is_active,
          }))
        : [emptyPeriod()],
    );
    setModalError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    setModalError('');
    if (!asset.trim() || !name.trim()) {
      setModalError('Asset and display name are required');
      return;
    }

    const preparedPeriods = periods.map(p => ({
      label: p.label.trim(),
      duration_days: p.duration_days.trim(),
      reward_percent: normalizeDecimal(p.reward_percent),
      is_active: p.is_active,
    }));

    const validPeriods = preparedPeriods.filter(p => p.label && p.duration_days && p.reward_percent);
    if (validPeriods.length === 0) {
      setModalError('Add at least one lock period with label, days, and return %');
      return;
    }

    for (const p of validPeriods) {
      const days = parseInt(p.duration_days, 10);
      if (!Number.isFinite(days) || days <= 0) {
        setModalError(`"${p.label}" needs a valid day count (1 or more)`);
        return;
      }
      if (Number.isNaN(Number(p.reward_percent))) {
        setModalError(`"${p.label}" needs a valid return % (e.g. 5 or 7.5)`);
        return;
      }
    }

    setSaving(true);
    setError('');
    try {
      const payload = {
        asset: asset.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || undefined,
        min_stake: minStake.trim() ? normalizeDecimal(minStake) : undefined,
        is_active: isActive,
        periods: validPeriods.map((p, i) => ({
          label: p.label,
          duration_days: parseInt(p.duration_days, 10),
          reward_percent: p.reward_percent,
          is_active: p.is_active,
          sort_order: i,
        })),
      };

      if (editing) {
        await adminStakingApi.updateProduct(editing.id, payload);
      } else {
        await adminStakingApi.createProduct(payload);
      }
      setModalOpen(false);
      await fetchProducts();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.detail : 'Save failed';
      setModalError(msg);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (p: AdminStakingProduct) => {
    if (!confirm(`Deactivate ${p.name}?`)) return;
    try {
      await adminStakingApi.deactivateProduct(p.id);
      await fetchProducts();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.detail : 'Deactivate failed');
    }
  };

  return (
    <RequirePermission permission="canManageCampaigns">
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-display font-bold text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-brand-400" />
              Staking Products
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Configure coin lock periods and return rates shown on the Earn page.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={fetchProducts} className="p-2 rounded-lg border border-white/[0.08] text-gray-400 hover:text-white">
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-brand-500 hover:bg-brand-600 text-white rounded-lg"
            >
              <Plus className="w-4 h-4" /> New Product
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border border-dashed border-white/[0.08]">
            <Lock className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No staking products yet</p>
            <button onClick={openCreate} className="mt-4 text-sm text-brand-400 hover:text-brand-300">
              Create your first product
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {products.map(p => (
              <div
                key={p.id}
                className={cn(
                  'p-5 rounded-2xl border bg-surface-100',
                  p.is_active ? 'border-glass-border' : 'border-red-500/20 opacity-60',
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <CoinIcon symbol={p.asset} size={40} />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-white">{p.name}</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400">{p.asset}</span>
                        {!p.is_active && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">Inactive</span>
                        )}
                      </div>
                      {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
                      {p.min_stake && (
                        <p className="text-[11px] text-gray-600 mt-1">Min stake: {parseFloat(p.min_stake).toLocaleString()} {p.asset}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => openEdit(p)} className="p-2 rounded-lg border border-white/[0.08] text-gray-400 hover:text-white">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    {p.is_active && (
                      <button onClick={() => handleDeactivate(p)} className="p-2 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {p.periods.map(pr => (
                    <div
                      key={pr.id}
                      className={cn(
                        'px-3 py-2 rounded-xl border text-xs',
                        pr.is_active ? 'border-brand-500/20 bg-brand-500/[0.06]' : 'border-white/[0.06] opacity-50',
                      )}
                    >
                      <span className="font-semibold text-white">{pr.label}</span>
                      <span className="text-gray-500 mx-1">·</span>
                      <span className="text-brand-400 font-bold">{pr.reward_percent}%</span>
                      <span className="text-gray-600 ml-1">({pr.duration_days}d)</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setModalOpen(false)}>
            <div
              className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-surface-200 border border-glass-border rounded-2xl shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-glass-border flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">{editing ? 'Edit Product' : 'New Staking Product'}</h2>
                <button onClick={() => setModalOpen(false)} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Asset</label>
                    <input value={asset} onChange={e => setAsset(e.target.value.toUpperCase())} placeholder="SOL" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Min Stake (optional)</label>
                    <input value={minStake} onChange={e => setMinStake(e.target.value)} placeholder="10" className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Display Name</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Solana Staking" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Description (optional)</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={cn(inputCls, 'h-auto py-2 resize-none')} />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="rounded" />
                  Active (visible on Earn page)
                </label>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-gray-400">Lock Periods & Return Rates</label>
                    <button
                      type="button"
                      onClick={() => setPeriods([...periods, emptyPeriod()])}
                      className="text-xs text-brand-400 hover:text-brand-300"
                    >
                      + Add period
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-600 mb-3">
                    Return % is the total profit for that lock period (e.g. 3 months = 5% total return).
                  </p>
                  <div className="space-y-2">
                    {periods.map((p, i) => (
                      <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-4">
                          <label className="block text-[10px] text-gray-600 mb-1">Label</label>
                          <input
                            value={p.label}
                            onChange={e => {
                              const next = [...periods];
                              next[i] = { ...next[i], label: e.target.value };
                              setPeriods(next);
                            }}
                            placeholder="3 Months"
                            className={cn(inputCls, 'h-8 text-xs')}
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="block text-[10px] text-gray-600 mb-1">Days</label>
                          <input
                            type="number"
                            value={p.duration_days}
                            onChange={e => {
                              const next = [...periods];
                              next[i] = { ...next[i], duration_days: e.target.value };
                              setPeriods(next);
                            }}
                            className={cn(inputCls, 'h-8 text-xs')}
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="block text-[10px] text-gray-600 mb-1">Return %</label>
                          <input
                            value={p.reward_percent}
                            onChange={e => {
                              const next = [...periods];
                              next[i] = { ...next[i], reward_percent: e.target.value };
                              setPeriods(next);
                            }}
                            placeholder="5"
                            className={cn(inputCls, 'h-8 text-xs')}
                          />
                        </div>
                        <div className="col-span-2 flex justify-end">
                          {periods.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setPeriods(periods.filter((_, j) => j !== i))}
                              className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {modalError && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
                    {modalError}
                  </p>
                )}

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 h-10 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editing ? 'Save Changes' : 'Create Product'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RequirePermission>
  );
}
