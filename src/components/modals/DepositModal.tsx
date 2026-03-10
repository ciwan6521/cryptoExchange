'use client';

import React, { useEffect, useState } from 'react';
import { X, Copy, Check, Wallet, Building2, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DepositMethod {
  id: string;
  method_type: 'crypto_wallet' | 'bank_transfer';
  label: string;
  asset: string | null;
  network: string | null;
  address: string | null;
  memo_tag: string | null;
  bank_name: string | null;
  account_holder: string | null;
  iban: string | null;
  swift_code: string | null;
  currency: string | null;
  reference_note: string | null;
  notes: string | null;
  min_amount: string | null;
}

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose }) => {
  const [methods, setMethods] = useState<DepositMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'crypto' | 'bank'>('crypto');
  const [copiedId, setCopiedId] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<DepositMethod | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch('/api/market/deposit-methods')
      .then(r => r.json())
      .then(data => {
        setMethods(data.methods || []);
        setSelectedMethod(null);
      })
      .catch(() => setMethods([]))
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const cryptos = methods.filter(m => m.method_type === 'crypto_wallet');
  const banks = methods.filter(m => m.method_type === 'bank_transfer');
  const currentList = tab === 'crypto' ? cryptos : banks;

  const copyToClip = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 2000);
  };

  const CopyButton = ({ text, id }: { text: string; id: string }) => (
    <button
      onClick={() => copyToClip(text, id)}
      className="inline-flex items-center gap-1 px-2 py-1 text-[10px] bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded text-gray-400 hover:text-white transition-colors"
    >
      {copiedId === id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
      {copiedId === id ? 'Copied' : 'Copy'}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-surface-200 border border-glass-border rounded-2xl shadow-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-glass-border flex items-center justify-between shrink-0">
          <h2 className="text-lg font-display font-bold text-white">Deposit</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab selector */}
        <div className="px-6 pt-4 shrink-0">
          <div className="flex gap-1 p-1 bg-surface-100 rounded-xl">
            <button
              onClick={() => { setTab('crypto'); setSelectedMethod(null); }}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors',
                tab === 'crypto' ? 'bg-surface-200 text-white shadow-sm' : 'text-gray-400 hover:text-gray-300'
              )}
            >
              <Wallet className="w-4 h-4" /> Crypto
            </button>
            <button
              onClick={() => { setTab('bank'); setSelectedMethod(null); }}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors',
                tab === 'bank' ? 'bg-surface-200 text-white shadow-sm' : 'text-gray-400 hover:text-gray-300'
              )}
            >
              <Building2 className="w-4 h-4" /> Bank Transfer
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
            </div>
          ) : currentList.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center mx-auto mb-3">
                {tab === 'crypto' ? <Wallet className="w-6 h-6 text-gray-500" /> : <Building2 className="w-6 h-6 text-gray-500" />}
              </div>
              <p className="text-sm text-gray-400">No {tab === 'crypto' ? 'crypto deposit addresses' : 'bank accounts'} available</p>
              <p className="text-xs text-gray-600 mt-1">Contact support for deposit instructions</p>
            </div>
          ) : !selectedMethod ? (
            /* Method list */
            <div className="space-y-2">
              {currentList.map(m => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMethod(m)}
                  className="w-full p-4 rounded-xl border border-glass-border bg-surface-100 hover:border-brand-500/30 hover:bg-brand-500/5 transition-colors text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
                        <span className="text-brand-400 font-bold text-xs">
                          {m.asset ? m.asset.slice(0, 3) : m.currency ? m.currency.slice(0, 3) : '?'}
                        </span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">{m.label}</div>
                        {m.network && <div className="text-xs text-gray-500">{m.network}</div>}
                        {m.bank_name && <div className="text-xs text-gray-500">{m.bank_name}</div>}
                      </div>
                    </div>
                    {m.min_amount && (
                      <span className="text-[10px] text-gray-500">Min: {m.min_amount}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            /* Method detail */
            <div className="space-y-4">
              <button
                onClick={() => setSelectedMethod(null)}
                className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                &larr; Back to list
              </button>

              <div className="text-center mb-4">
                <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center mx-auto mb-2">
                  <span className="text-brand-400 font-bold text-sm">
                    {selectedMethod.asset || selectedMethod.currency || '?'}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-white">{selectedMethod.label}</h3>
                {selectedMethod.network && (
                  <span className="inline-block mt-1 px-2 py-0.5 text-[10px] bg-brand-500/10 text-brand-400 rounded-full">
                    {selectedMethod.network}
                  </span>
                )}
              </div>

              {/* Crypto detail */}
              {selectedMethod.method_type === 'crypto_wallet' && selectedMethod.address && (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-surface-100 border border-glass-border">
                    <label className="block text-[11px] text-gray-500 mb-1.5">Deposit Address</label>
                    <div className="flex items-start justify-between gap-2">
                      <code className="text-sm text-white font-mono break-all leading-relaxed">{selectedMethod.address}</code>
                      <CopyButton text={selectedMethod.address} id={selectedMethod.id + '-addr'} />
                    </div>
                  </div>

                  {selectedMethod.memo_tag && (
                    <div className="p-4 rounded-xl bg-surface-100 border border-glass-border">
                      <label className="block text-[11px] text-gray-500 mb-1.5">Memo / Tag</label>
                      <div className="flex items-center justify-between gap-2">
                        <code className="text-sm text-white font-mono">{selectedMethod.memo_tag}</code>
                        <CopyButton text={selectedMethod.memo_tag} id={selectedMethod.id + '-memo'} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Bank detail */}
              {selectedMethod.method_type === 'bank_transfer' && (
                <div className="space-y-3">
                  {selectedMethod.bank_name && (
                    <div className="p-3 rounded-xl bg-surface-100 border border-glass-border">
                      <label className="block text-[11px] text-gray-500 mb-1">Bank Name</label>
                      <p className="text-sm text-white">{selectedMethod.bank_name}</p>
                    </div>
                  )}
                  {selectedMethod.account_holder && (
                    <div className="p-3 rounded-xl bg-surface-100 border border-glass-border">
                      <label className="block text-[11px] text-gray-500 mb-1">Account Holder</label>
                      <p className="text-sm text-white">{selectedMethod.account_holder}</p>
                    </div>
                  )}
                  {selectedMethod.iban && (
                    <div className="p-3 rounded-xl bg-surface-100 border border-glass-border">
                      <label className="block text-[11px] text-gray-500 mb-1">IBAN</label>
                      <div className="flex items-center justify-between gap-2">
                        <code className="text-sm text-white font-mono">{selectedMethod.iban}</code>
                        <CopyButton text={selectedMethod.iban} id={selectedMethod.id + '-iban'} />
                      </div>
                    </div>
                  )}
                  {selectedMethod.swift_code && (
                    <div className="p-3 rounded-xl bg-surface-100 border border-glass-border">
                      <label className="block text-[11px] text-gray-500 mb-1">SWIFT Code</label>
                      <div className="flex items-center justify-between gap-2">
                        <code className="text-sm text-white font-mono">{selectedMethod.swift_code}</code>
                        <CopyButton text={selectedMethod.swift_code} id={selectedMethod.id + '-swift'} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Reference note warning */}
              {selectedMethod.reference_note && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300">{selectedMethod.reference_note}</p>
                </div>
              )}

              {/* Notes */}
              {selectedMethod.notes && (
                <p className="text-xs text-gray-500 leading-relaxed">{selectedMethod.notes}</p>
              )}

              {/* Min amount */}
              {selectedMethod.min_amount && (
                <p className="text-xs text-gray-500">
                  Minimum deposit: <span className="text-white font-medium">{selectedMethod.min_amount} {selectedMethod.asset || selectedMethod.currency || ''}</span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-glass-border shrink-0">
          <p className="text-[11px] text-gray-600 text-center">
            Deposits are credited after network confirmation. Contact support for assistance.
          </p>
        </div>
      </div>
    </div>
  );
};
