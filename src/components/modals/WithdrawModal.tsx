'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { X, Send, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBalanceStore } from '@/stores/balance-store';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({ isOpen, onClose }) => {
  const { balances, fetchBalances } = useBalanceStore();
  const [asset, setAsset] = useState('USDT');
  const [network, setNetwork] = useState('TRC20');
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchBalances();
      setError('');
      setSuccess(false);
      setAddress('');
      setAmount('');
    }
  }, [isOpen, fetchBalances]);

  if (!isOpen) return null;

  const selectedBalance = balances.find(b => b.asset === asset);
  const available = parseFloat(selectedBalance?.available || '0');

  const assets = balances.length > 0
    ? balances.map(b => b.asset)
    : ['USDT', 'BTC', 'ETH'];

  const networks = asset === 'USDT'
    ? ['TRC20', 'ERC20', 'BEP20']
    : asset === 'BTC'
      ? ['Bitcoin']
      : asset === 'ETH'
        ? ['ERC20']
        : ['ERC20', 'TRC20'];

  const handleSubmit = async () => {
    setError('');
    if (!address.trim()) { setError('Enter a withdrawal address'); return; }
    if (!amount || parseFloat(amount) <= 0) { setError('Enter a valid amount'); return; }
    if (parseFloat(amount) > available) { setError('Insufficient balance'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/withdrawals/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          asset,
          network,
          amount,
          to_address: address,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Withdrawal failed');
      }
      setSuccess(true);
      fetchBalances();
      toast.success('Withdrawal submitted', { description: `${amount} ${asset} withdrawal is pending approval.` });
    } catch (e: any) {
      setError(e.message || 'Withdrawal failed');
    }
    setSubmitting(false);
  };

  const inputCls = 'w-full h-10 px-3 text-sm bg-surface-100 border border-glass-border rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-brand-500/40 focus:ring-1 focus:ring-brand-500/20';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-surface-200 border border-glass-border rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-glass-border flex items-center justify-between">
          <h2 className="text-lg font-display font-bold text-white">Withdraw</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-4">
              <Send className="w-7 h-7 text-green-400" />
            </div>
            <h3 className="text-base font-semibold text-white mb-2">Withdrawal Submitted</h3>
            <p className="text-sm text-gray-400 mb-6">
              Your withdrawal is pending approval. You will be notified once it is processed.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 text-sm font-medium bg-brand-500 hover:bg-brand-600 text-white rounded-xl transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {/* Asset select */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Asset</label>
              <select
                value={asset}
                onChange={e => { setAsset(e.target.value); setError(''); }}
                className={inputCls + ' appearance-none'}
              >
                {assets.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            {/* Network select */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Network</label>
              <select
                value={network}
                onChange={e => setNetwork(e.target.value)}
                className={inputCls + ' appearance-none'}
              >
                {networks.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            {/* Address */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Withdrawal Address</label>
              <input
                className={inputCls}
                value={address}
                onChange={e => { setAddress(e.target.value); setError(''); }}
                placeholder="Enter destination address"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Amount</label>
              <div className="relative">
                <input
                  className={inputCls + ' pr-20'}
                  type="number"
                  value={amount}
                  onChange={e => { setAmount(e.target.value); setError(''); }}
                  placeholder="0.00"
                  step="any"
                />
                <button
                  onClick={() => setAmount(String(available))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-brand-400 hover:text-brand-300 px-1.5 py-0.5 bg-brand-500/10 rounded"
                >
                  MAX
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Available: <span className="text-gray-300">{available.toFixed(4)} {asset}</span>
              </p>
            </div>

            {/* Warning */}
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-300 leading-relaxed">
                Please double-check the address and network. Sending to the wrong address or network will result in permanent loss of funds.
              </p>
            </div>

            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={submitting || !address || !amount}
              className={cn(
                'w-full py-3 text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2',
                submitting || !address || !amount
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-brand-500 hover:bg-brand-600 text-white'
              )}
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
              ) : (
                <><Send className="w-4 h-4" /> Withdraw {asset}</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
