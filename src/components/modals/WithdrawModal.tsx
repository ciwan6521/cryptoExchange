'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { X, Send, AlertTriangle, Loader2, ChevronDown, Check, Shield, Settings, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBalanceStore } from '@/stores/balance-store';
import { useAuthStore } from '@/stores/auth-store';
import { depositApi, type ChainInfo } from '@/lib/api';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({ isOpen, onClose }) => {
  const { balances, fetchBalances } = useBalanceStore();
  const user = useAuthStore((s) => s.user);
  const [chains, setChains] = useState<ChainInfo[]>([]);
  const [selectedChain, setSelectedChain] = useState('bsc');
  const [chainDropdownOpen, setChainDropdownOpen] = useState(false);
  const [asset, setAsset] = useState('USDT');
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const currentChain = useMemo(
    () => chains.find(c => c.name === selectedChain),
    [chains, selectedChain],
  );

  const availableTokens = useMemo(() => {
    if (!currentChain) return [];
    return [
      currentChain.gasToken,
      ...currentChain.tokens.map(t => t.symbol),
    ];
  }, [currentChain]);

  useEffect(() => {
    if (isOpen) {
      fetchBalances();
      setError('');
      setSuccess(false);
      setAddress('');
      setAmount('');
      setTotpCode('');

      depositApi.getChains()
        .then(data => {
          const ch = data.chains || [];
          setChains(ch);
          if (ch.length > 0 && !ch.find(c => c.name === selectedChain)) {
            setSelectedChain(ch[0].name);
            const firstTokens = ch[0].tokens;
            setAsset(firstTokens[0]?.symbol || ch[0].gasToken);
          }
        })
        .catch(() => setChains([]));
    }
  }, [isOpen, fetchBalances]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (availableTokens.length > 0 && !availableTokens.includes(asset)) {
      setAsset(availableTokens.find(t => t === 'USDT') || availableTokens[0]);
    }
  }, [availableTokens, asset]);

  if (!isOpen) return null;

  const selectedBalance = balances.find(b => b.asset === asset);
  const available = parseFloat(selectedBalance?.available || '0');

  const handleSubmit = async () => {
    setError('');
    if (!address.trim()) { setError('Enter a withdrawal address'); return; }
    if (!amount || parseFloat(amount) <= 0) { setError('Enter a valid amount'); return; }
    if (parseFloat(amount) > available) { setError('Insufficient balance'); return; }
    if (!totpCode || totpCode.length !== 6) { setError('Enter the 6-digit code from your authenticator app'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/withdrawals/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          asset,
          network: selectedChain,
          amount,
          to_address: address,
          totp_code: totpCode,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Withdrawal failed');
      }
      setSuccess(true);
      fetchBalances();
      toast.success('Withdrawal submitted', { description: `${amount} ${asset} withdrawal is pending approval.` });
    } catch (e: unknown) {
      const err = e as Error;
      setError(err.message || 'Withdrawal failed');
    }
    setSubmitting(false);
  };

  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  useEffect(() => {
    const cd = user?.depositCooldownUntil;
    if (!cd) { setCooldownSeconds(0); return; }
    const tick = () => {
      const rem = Math.max(0, Math.floor((new Date(cd).getTime() - Date.now()) / 1000));
      setCooldownSeconds(rem);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [user?.depositCooldownUntil]);

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
        ) : cooldownSeconds > 0 ? (
          <div className="p-8 text-center">
            <div className="relative w-24 h-24 mx-auto mb-4">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                <circle cx="48" cy="48" r="42" fill="none" stroke="#f59e0b" strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 42} strokeDashoffset={2 * Math.PI * 42 * (1 - cooldownSeconds / 900)}
                  className="transition-[stroke-dashoffset] duration-1000 ease-linear" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold text-white font-mono">
                  {String(Math.floor(cooldownSeconds / 60)).padStart(2, '0')}:{String(cooldownSeconds % 60).padStart(2, '0')}
                </span>
              </div>
            </div>
            <h3 className="text-base font-semibold text-white mb-2">Withdrawal Temporarily Paused</h3>
            <p className="text-sm text-gray-400 mb-4">
              A deposit is currently being processed. Withdrawals will be available once the processing period ends.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
              <Clock className="w-3.5 h-3.5" />
              Processing deposit
            </div>
          </div>
        ) : !user?.totp_enabled ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
              <Shield className="w-7 h-7 text-amber-400" />
            </div>
            <h3 className="text-base font-semibold text-white mb-2">2FA Required</h3>
            <p className="text-sm text-gray-400 mb-6">
              You must enable Two-Factor Authentication (Google Authenticator) before making withdrawals.
            </p>
            <button
              onClick={() => { onClose(); window.location.href = '/settings'; }}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-brand-500 hover:bg-brand-600 text-white rounded-xl transition-colors"
            >
              <Settings className="w-4 h-4" />
              Go to Security Settings
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {/* Chain selector */}
            {chains.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Network</label>
                <div className="relative">
                  <button
                    onClick={() => setChainDropdownOpen(!chainDropdownOpen)}
                    className={cn(inputCls, 'flex items-center justify-between cursor-pointer')}
                  >
                    <span>{currentChain?.displayName || selectedChain}</span>
                    <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", chainDropdownOpen && "rotate-180")} />
                  </button>

                  {chainDropdownOpen && (
                    <div className="absolute z-10 mt-1 w-full rounded-xl bg-surface-200 border border-glass-border shadow-xl overflow-hidden">
                      {chains.map(c => (
                        <button
                          key={c.name}
                          onClick={() => {
                            setSelectedChain(c.name);
                            setChainDropdownOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.04] transition-colors text-sm",
                            c.name === selectedChain && "bg-brand-500/5"
                          )}
                        >
                          <div>
                            <div className="text-white font-medium">{c.displayName}</div>
                            <div className="text-[11px] text-gray-500">{c.tokens.map(t => t.symbol).join(', ')}</div>
                          </div>
                          {c.name === selectedChain && (
                            <Check className="w-4 h-4 text-brand-400" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Token select */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Token</label>
              <div className="flex gap-2 flex-wrap">
                {availableTokens.map(t => (
                  <button
                    key={t}
                    onClick={() => { setAsset(t); setError(''); }}
                    className={cn(
                      "px-3 py-2 text-xs rounded-xl border transition-colors font-medium",
                      asset === t
                        ? "bg-brand-500/10 text-brand-400 border-brand-500/30"
                        : "text-gray-400 border-glass-border hover:text-gray-300 hover:border-white/[0.12] bg-surface-100"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
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

            {/* 2FA Code */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Google Authenticator Code</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                  <Shield className="w-4 h-4 text-gray-500" />
                </div>
                <input
                  className={inputCls + ' pl-9 tracking-[0.3em] font-mono'}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totpCode}
                  onChange={e => { setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                  placeholder="000000"
                  autoComplete="one-time-code"
                />
              </div>
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
              disabled={submitting || !address || !amount || totpCode.length !== 6}
              className={cn(
                'w-full py-3 text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2',
                submitting || !address || !amount || totpCode.length !== 6
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
