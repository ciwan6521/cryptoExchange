'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Rocket, Loader2, AlertTriangle, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { adminLaunchpadApi, type AdminLaunchpadSale } from '@/lib/admin-api';

export default function AdminLaunchpadPage() {
  const [sales, setSales] = useState<AdminLaunchpadSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    token_symbol: '',
    name: '',
    description: '',
    price_usdt: '',
    total_allocation: '',
    min_purchase_usdt: '10',
    max_purchase_usdt: '10000',
  });

  const fetchSales = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminLaunchpadApi.listSales();
      setSales(res.sales);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load sales');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await adminLaunchpadApi.createSale(form);
      setShowForm(false);
      setForm({ token_symbol: '', name: '', description: '', price_usdt: '', total_allocation: '', min_purchase_usdt: '10', max_purchase_usdt: '10000' });
      fetchSales();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (sale: AdminLaunchpadSale) => {
    try {
      await adminLaunchpadApi.updateSale(sale.id, { is_active: !sale.is_active });
      fetchSales();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Update failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-white flex items-center gap-2">
          <Rocket className="w-4 h-4" />
          Launchpad Sales
        </h1>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-brand-500/20 text-brand-400 hover:bg-brand-500/30"
        >
          {showForm ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          {showForm ? 'Cancel' : 'New Sale'}
        </button>
      </div>

      {showForm && (
        <div className="p-4 rounded-lg border border-white/10 bg-white/[0.02] space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {(['token_symbol', 'name', 'price_usdt', 'total_allocation', 'min_purchase_usdt', 'max_purchase_usdt'] as const).map(field => (
              <input
                key={field}
                placeholder={field.replace(/_/g, ' ')}
                value={form[field]}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                className="px-3 py-2 text-sm rounded-lg bg-surface-100 border border-white/10 text-white placeholder-gray-600"
              />
            ))}
          </div>
          <textarea
            placeholder="Description"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="w-full px-3 py-2 text-sm rounded-lg bg-surface-100 border border-white/10 text-white placeholder-gray-600"
            rows={2}
          />
          <button
            onClick={handleCreate}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create Sale'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-gray-600 animate-spin" /></div>
      ) : error ? (
        <div className="text-center py-12 space-y-2">
          <AlertTriangle className="w-5 h-5 text-red-400 mx-auto" />
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={fetchSales} className="text-xs underline text-gray-500">Retry</button>
        </div>
      ) : sales.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-600">No launchpad sales</div>
      ) : (
        <div className="space-y-1.5">
          {sales.map(s => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{s.token_symbol} — {s.name}</span>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded', s.is_active ? 'text-profit bg-profit/10' : 'text-gray-500 bg-gray-500/10')}>
                    {s.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {s.price_usdt} USDT/token · Sold {s.sold_amount}/{s.total_allocation}
                </p>
              </div>
              <button
                onClick={() => toggleActive(s)}
                className="text-xs px-2 py-1 rounded border border-white/10 text-gray-400 hover:text-white"
              >
                {s.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
