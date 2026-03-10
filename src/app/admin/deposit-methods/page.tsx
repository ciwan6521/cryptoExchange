'use client';

import React, { useEffect, useState } from 'react';
import {
  Plus, Trash2, Edit2, Wallet, Building2, Copy, Check, ToggleLeft, ToggleRight,
} from 'lucide-react';
import {
  adminDepositMethodsApi,
  type DepositMethodItem,
  type DepositMethodCreateData,
} from '@/lib/admin-api';

type MethodType = 'crypto_wallet' | 'bank_transfer';

const empty: DepositMethodCreateData = {
  method_type: 'crypto_wallet',
  label: '',
  asset: '',
  network: '',
  address: '',
  memo_tag: '',
  bank_name: '',
  account_holder: '',
  iban: '',
  swift_code: '',
  currency: '',
  reference_note: '',
  notes: '',
  min_amount: '',
  is_active: true,
  sort_order: 0,
};

export default function DepositMethodsPage() {
  const [methods, setMethods] = useState<DepositMethodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DepositMethodCreateData>({ ...empty });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState('');

  const load = async () => {
    try {
      const res = await adminDepositMethodsApi.list();
      setMethods(res.methods);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setError('');
    setSaving(true);
    try {
      if (editingId) {
        await adminDepositMethodsApi.update(editingId, form);
      } else {
        await adminDepositMethodsApi.create(form);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ ...empty });
      await load();
    } catch (e: any) {
      setError(e.detail || e.message || 'Failed to save');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this deposit method?')) return;
    try {
      await adminDepositMethodsApi.delete(id);
      await load();
    } catch { /* ignore */ }
  };

  const handleEdit = (m: DepositMethodItem) => {
    setEditingId(m.id);
    setForm({
      method_type: m.method_type,
      label: m.label,
      asset: m.asset || '',
      network: m.network || '',
      address: m.address || '',
      memo_tag: m.memo_tag || '',
      bank_name: m.bank_name || '',
      account_holder: m.account_holder || '',
      iban: m.iban || '',
      swift_code: m.swift_code || '',
      currency: m.currency || '',
      reference_note: m.reference_note || '',
      notes: m.notes || '',
      min_amount: m.min_amount || '',
      is_active: m.is_active,
      sort_order: m.sort_order,
    });
    setShowForm(true);
  };

  const handleToggleActive = async (m: DepositMethodItem) => {
    try {
      await adminDepositMethodsApi.update(m.id, { is_active: !m.is_active });
      await load();
    } catch { /* ignore */ }
  };

  const copyToClip = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 2000);
  };

  const cryptos = methods.filter(m => m.method_type === 'crypto_wallet');
  const banks = methods.filter(m => m.method_type === 'bank_transfer');

  const inputCls = 'w-full h-9 px-3 text-sm bg-white/[0.03] border border-white/[0.08] rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-brand-500/40 focus:ring-1 focus:ring-brand-500/20';
  const labelCls = 'block text-[11px] font-medium text-gray-500 mb-1';

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-white">Deposit Methods</h1>
          <p className="text-xs text-gray-500 mt-0.5">Manage crypto wallet addresses and bank accounts shown to users for deposits</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm({ ...empty }); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add Method
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-lg bg-[#0f0f18] border border-white/[0.08] rounded-xl shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <h2 className="text-sm font-semibold text-white">{editingId ? 'Edit' : 'Add'} Deposit Method</h2>
            </div>
            <div className="p-5 space-y-3">
              {/* Type selector */}
              <div>
                <label className={labelCls}>Type</label>
                <div className="flex gap-2">
                  {(['crypto_wallet', 'bank_transfer'] as MethodType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setForm({ ...form, method_type: t })}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg border transition-colors ${
                        form.method_type === t
                          ? 'border-brand-500/40 bg-brand-500/10 text-brand-400'
                          : 'border-white/[0.08] bg-white/[0.02] text-gray-400 hover:border-white/[0.15]'
                      }`}
                    >
                      {t === 'crypto_wallet' ? <Wallet className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
                      {t === 'crypto_wallet' ? 'Crypto Wallet' : 'Bank Transfer'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelCls}>Label *</label>
                <input className={inputCls} value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="e.g. BTC - Bitcoin Network" />
              </div>

              {form.method_type === 'crypto_wallet' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Asset</label>
                      <input className={inputCls} value={form.asset} onChange={e => setForm({ ...form, asset: e.target.value })} placeholder="BTC" />
                    </div>
                    <div>
                      <label className={labelCls}>Network</label>
                      <input className={inputCls} value={form.network} onChange={e => setForm({ ...form, network: e.target.value })} placeholder="Bitcoin, ERC20, TRC20" />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Wallet Address *</label>
                    <input className={inputCls} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="0x..." />
                  </div>
                  <div>
                    <label className={labelCls}>Memo / Tag (optional)</label>
                    <input className={inputCls} value={form.memo_tag} onChange={e => setForm({ ...form, memo_tag: e.target.value })} placeholder="Required for XRP, XLM, etc." />
                  </div>
                </>
              )}

              {form.method_type === 'bank_transfer' && (
                <>
                  <div>
                    <label className={labelCls}>Bank Name *</label>
                    <input className={inputCls} value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} placeholder="e.g. Ziraat Bankası" />
                  </div>
                  <div>
                    <label className={labelCls}>Account Holder *</label>
                    <input className={inputCls} value={form.account_holder} onChange={e => setForm({ ...form, account_holder: e.target.value })} placeholder="Full name" />
                  </div>
                  <div>
                    <label className={labelCls}>IBAN *</label>
                    <input className={inputCls} value={form.iban} onChange={e => setForm({ ...form, iban: e.target.value })} placeholder="TR..." />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>SWIFT Code</label>
                      <input className={inputCls} value={form.swift_code} onChange={e => setForm({ ...form, swift_code: e.target.value })} placeholder="TCZBTR2A" />
                    </div>
                    <div>
                      <label className={labelCls}>Currency</label>
                      <input className={inputCls} value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} placeholder="TRY, USD, EUR" />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Reference Note</label>
                    <input className={inputCls} value={form.reference_note} onChange={e => setForm({ ...form, reference_note: e.target.value })} placeholder="e.g. Include your user ID" />
                  </div>
                </>
              )}

              <div>
                <label className={labelCls}>Notes / Instructions</label>
                <textarea
                  className={inputCls + ' h-16 resize-none'}
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Additional instructions for the user..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Min Amount</label>
                  <input className={inputCls} value={form.min_amount} onChange={e => setForm({ ...form, min_amount: e.target.value })} placeholder="0.001" />
                </div>
                <div>
                  <label className={labelCls}>Sort Order</label>
                  <input className={inputCls} type="number" value={form.sort_order} onChange={e => setForm({ ...form, sort_order: Number(e.target.value) })} />
                </div>
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
            <div className="px-5 py-3 border-t border-white/[0.06] flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.label} className="px-4 py-1.5 text-xs font-medium bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg transition-colors">
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : methods.length === 0 ? (
        <div className="text-center py-12">
          <Wallet className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No deposit methods configured</p>
          <p className="text-xs text-gray-600 mt-1">Add crypto wallet addresses or bank accounts for users to deposit funds</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Crypto Wallets */}
          {cryptos.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Wallet className="w-3.5 h-3.5" /> Crypto Wallets ({cryptos.length})
              </h2>
              <div className="space-y-2">
                {cryptos.map(m => (
                  <div key={m.id} className={`p-4 rounded-xl border ${m.is_active ? 'border-white/[0.08] bg-white/[0.02]' : 'border-red-500/20 bg-red-500/5 opacity-60'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-white">{m.label}</span>
                          {m.asset && <span className="px-1.5 py-0.5 text-[10px] bg-brand-500/10 text-brand-400 rounded">{m.asset}</span>}
                          {m.network && <span className="px-1.5 py-0.5 text-[10px] bg-white/[0.06] text-gray-400 rounded">{m.network}</span>}
                          {!m.is_active && <span className="px-1.5 py-0.5 text-[10px] bg-red-500/10 text-red-400 rounded">Disabled</span>}
                        </div>
                        {m.address && (
                          <div className="flex items-center gap-2 mt-1">
                            <code className="text-xs text-gray-400 font-mono truncate max-w-[400px]">{m.address}</code>
                            <button onClick={() => copyToClip(m.address!, m.id)} className="shrink-0 text-gray-500 hover:text-white">
                              {copiedId === m.id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        )}
                        {m.notes && <p className="text-[11px] text-gray-500 mt-1">{m.notes}</p>}
                      </div>
                      <div className="flex items-center gap-1 ml-3">
                        <button onClick={() => handleToggleActive(m)} className="p-1.5 text-gray-500 hover:text-white rounded transition-colors" title={m.is_active ? 'Disable' : 'Enable'}>
                          {m.is_active ? <ToggleRight className="w-4 h-4 text-green-400" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <button onClick={() => handleEdit(m)} className="p-1.5 text-gray-500 hover:text-white rounded transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(m.id)} className="p-1.5 text-gray-500 hover:text-red-400 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bank Transfers */}
          {banks.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5" /> Bank Accounts ({banks.length})
              </h2>
              <div className="space-y-2">
                {banks.map(m => (
                  <div key={m.id} className={`p-4 rounded-xl border ${m.is_active ? 'border-white/[0.08] bg-white/[0.02]' : 'border-red-500/20 bg-red-500/5 opacity-60'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-white">{m.label}</span>
                          {m.currency && <span className="px-1.5 py-0.5 text-[10px] bg-blue-500/10 text-blue-400 rounded">{m.currency}</span>}
                          {!m.is_active && <span className="px-1.5 py-0.5 text-[10px] bg-red-500/10 text-red-400 rounded">Disabled</span>}
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2 text-xs">
                          {m.bank_name && <div><span className="text-gray-500">Bank:</span> <span className="text-gray-300">{m.bank_name}</span></div>}
                          {m.account_holder && <div><span className="text-gray-500">Holder:</span> <span className="text-gray-300">{m.account_holder}</span></div>}
                          {m.iban && (
                            <div className="flex items-center gap-1.5 col-span-2">
                              <span className="text-gray-500">IBAN:</span>
                              <code className="text-gray-300 font-mono">{m.iban}</code>
                              <button onClick={() => copyToClip(m.iban!, m.id)} className="text-gray-500 hover:text-white">
                                {copiedId === m.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          )}
                          {m.swift_code && <div><span className="text-gray-500">SWIFT:</span> <span className="text-gray-300">{m.swift_code}</span></div>}
                        </div>
                        {m.reference_note && <p className="text-[11px] text-amber-400/80 mt-1.5">⚠ {m.reference_note}</p>}
                        {m.notes && <p className="text-[11px] text-gray-500 mt-1">{m.notes}</p>}
                      </div>
                      <div className="flex items-center gap-1 ml-3">
                        <button onClick={() => handleToggleActive(m)} className="p-1.5 text-gray-500 hover:text-white rounded transition-colors" title={m.is_active ? 'Disable' : 'Enable'}>
                          {m.is_active ? <ToggleRight className="w-4 h-4 text-green-400" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <button onClick={() => handleEdit(m)} className="p-1.5 text-gray-500 hover:text-white rounded transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(m.id)} className="p-1.5 text-gray-500 hover:text-red-400 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
