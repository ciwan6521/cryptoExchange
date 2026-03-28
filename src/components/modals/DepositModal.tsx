'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { X, Copy, Check, Wallet, AlertTriangle, Loader2, ArrowRight, Clock, Shield, CreditCard, Building2, ChevronLeft, ChevronDown, Send, CheckCircle2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/lib/utils';
import { depositApi, type PaymentMethod, type ChainInfo } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  crypto: 'Crypto',
  bank_transfer: 'Bank Transfer',
  papara: 'Papara',
  external_api: 'External',
  manual: 'Manual',
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  crypto: Wallet,
  bank_transfer: Building2,
  papara: CreditCard,
  external_api: CreditCard,
  manual: CreditCard,
};

const CHAIN_CONFIRMATIONS: Record<string, { blocks: number; time: string }> = {
  bsc: { blocks: 15, time: '~1 min' },
  ethereum: { blocks: 12, time: '~3 min' },
};

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuthStore();

  // Chain & token state
  const [chains, setChains] = useState<ChainInfo[]>([]);
  const [selectedChain, setSelectedChain] = useState<string>('bsc');
  const [selectedToken, setSelectedToken] = useState<string>('USDT');
  const [chainDropdownOpen, setChainDropdownOpen] = useState(false);

  // Wallet address
  const [walletAddress, setWalletAddress] = useState('');
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState('');

  // Payment methods
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('wallet');
  const [copiedId, setCopiedId] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);

  // History
  const [showHistory, setShowHistory] = useState(false);
  const [deposits, setDeposits] = useState<Array<{
    id: string; asset: string; amount: string; status: string; tx_hash: string | null; created_at: string | null;
  }>>([]);

  // Claim state
  const [claimAmount, setClaimAmount] = useState('');
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [claimError, setClaimError] = useState('');

  const currentChain = useMemo(
    () => chains.find(c => c.name === selectedChain),
    [chains, selectedChain],
  );

  const availableTokens = useMemo(() => {
    if (!currentChain) return [];
    const gasToken = currentChain.gasToken;
    return [
      { symbol: gasToken, decimals: 18, isGas: true },
      ...currentChain.tokens.map(t => ({ ...t, isGas: false })),
    ];
  }, [currentChain]);

  const methodTypes = useMemo(() => {
    const types = new Set(methods.map(m => m.type));
    return Array.from(types);
  }, [methods]);

  const tabs = useMemo(() => {
    const t: { id: string; label: string; icon: React.ElementType }[] = [];
    if (user) {
      t.push({ id: 'wallet', label: 'My Wallet', icon: Shield });
    }
    for (const type of methodTypes) {
      t.push({
        id: type,
        label: TYPE_LABELS[type] || type,
        icon: TYPE_ICONS[type] || CreditCard,
      });
    }
    return t;
  }, [user, methodTypes]);

  const fetchAddress = useCallback(async (chain: string) => {
    if (!user) return;
    setWalletLoading(true);
    setWalletError('');
    try {
      const data = await depositApi.getAddress(chain);
      setWalletAddress(data.address);
    } catch (err: unknown) {
      const apiErr = err as { detail?: string };
      setWalletError(apiErr.detail || 'Failed to load deposit address');
    } finally {
      setWalletLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!isOpen) return;

    depositApi.getChains()
      .then(data => {
        const ch = data.chains || [];
        setChains(ch);
        if (ch.length > 0 && !ch.find(c => c.name === selectedChain)) {
          setSelectedChain(ch[0].name);
        }
      })
      .catch(() => setChains([]));

    setLoading(true);
    depositApi.getPaymentMethods()
      .then(data => {
        setMethods(data.methods || []);
        setSelectedMethod(null);
      })
      .catch(() => setMethods([]))
      .finally(() => setLoading(false));
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen || !user || activeTab !== 'wallet') return;
    fetchAddress(selectedChain);
  }, [isOpen, user, activeTab, selectedChain, fetchAddress]);

  useEffect(() => {
    if (!showHistory || !user) return;
    depositApi.getHistory({ limit: 20 })
      .then(data => setDeposits(data.deposits || []))
      .catch(() => setDeposits([]));
  }, [showHistory, user]);

  useEffect(() => {
    if (!isOpen) return;
    if (!user && activeTab === 'wallet') {
      setActiveTab(methodTypes[0] || 'wallet');
    }
  }, [isOpen, user, activeTab, methodTypes]);

  if (!isOpen) return null;

  const filteredMethods = methods.filter(m => m.type === activeTab);
  const chainConf = CHAIN_CONFIRMATIONS[selectedChain] || { blocks: 15, time: '~2 min' };

  const resetClaimForm = () => {
    setClaimAmount('');
    setClaimSubmitting(false);
    setClaimSuccess(false);
    setClaimError('');
  };

  const handleClaimDeposit = async (method: PaymentMethod) => {
    if (!claimAmount || !user) return;
    const numAmount = parseFloat(claimAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setClaimError('Please enter a valid amount');
      return;
    }

    setClaimSubmitting(true);
    setClaimError('');
    try {
      await depositApi.claimDeposit({
        amount: claimAmount,
        currency: method.currency || 'USDT',
        method: method.type,
        payment_method_id: method.id,
      });
      setClaimSuccess(true);
    } catch (err: unknown) {
      const apiErr = err as { detail?: string; message?: string };
      setClaimError(apiErr.detail || apiErr.message || 'Failed to submit claim');
    } finally {
      setClaimSubmitting(false);
    }
  };

  const copyToClip = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 2000);
  };

  const CopyButton = ({ text, id, label = 'Copy' }: { text: string; id: string; label?: string }) => (
    <button
      onClick={() => copyToClip(text, id)}
      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg text-gray-400 hover:text-white transition-colors"
    >
      {copiedId === id ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      {copiedId === id ? 'Copied!' : label}
    </button>
  );

  const statusColor = (s: string) => {
    if (s === 'completed') return 'text-green-400';
    if (s === 'confirming' || s === 'pending') return 'text-yellow-400';
    return 'text-red-400';
  };

  const renderMethodDetail = (m: PaymentMethod) => {
    const config = m.config || {};

    if (m.type === 'crypto') {
      const addr = (config.wallet_address || config.address || '') as string;
      const network = (config.network || '') as string;
      const coin = (config.coin || m.currency || '') as string;
      const minDeposit = (config.min_deposit || '') as string;
      const confirmations = (config.required_confirmations || '') as string;

      return (
        <div className="space-y-4">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-500/10 text-brand-400 text-xs font-medium mb-3">
              <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
              {coin} — {network}
            </div>
          </div>

          {addr && (
            <div className="p-5 rounded-2xl bg-surface-100 border border-glass-border text-center">
              <div className="w-44 h-44 bg-white rounded-xl mx-auto mb-4 flex items-center justify-center p-2">
                <QRCodeSVG value={addr} size={152} level="H" bgColor="#ffffff" fgColor="#000000" />
              </div>
              <label className="block text-[11px] text-gray-500 mb-2">Deposit Address</label>
              <code className="block text-sm text-white font-mono break-all leading-relaxed mb-3">{addr}</code>
              <CopyButton text={addr} id={m.id + '-addr'} label="Copy Address" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {confirmations && (
              <div className="p-3 rounded-xl bg-surface-100 border border-glass-border">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-[11px] text-gray-500">Confirmations</span>
                </div>
                <p className="text-sm font-medium text-white">{confirmations} blocks</p>
              </div>
            )}
            {minDeposit && (
              <div className="p-3 rounded-xl bg-surface-100 border border-glass-border">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-[11px] text-gray-500">Min Deposit</span>
                </div>
                <p className="text-sm font-medium text-white">{minDeposit} {coin}</p>
              </div>
            )}
          </div>

          {addr && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-300">
                <p className="font-medium mb-0.5">Only send {coin} on {network} network to this address</p>
                <p className="text-amber-300/70">Sending tokens on wrong network may result in permanent loss of funds.</p>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (m.type === 'bank_transfer') {
      const bankName = (config.bank_name || config.bankName || '') as string;
      const holder = (config.account_holder || config.accountHolder || config.holder_name || config.account_name || '') as string;
      const iban = (config.iban || config.IBAN || '') as string;
      const swift = (config.swift_code || config.swift || '') as string;
      const currency = (config.currency || m.currency || '') as string;
      const reference = (config.reference_note || config.reference || '') as string;
      const minDeposit = (config.min_deposit || '') as string;

      return (
        <div className="space-y-3">
          {bankName && (
            <div className="p-3 rounded-xl bg-surface-100 border border-glass-border">
              <label className="block text-[11px] text-gray-500 mb-1">Bank Name</label>
              <p className="text-sm text-white">{bankName}</p>
            </div>
          )}
          {holder && (
            <div className="p-3 rounded-xl bg-surface-100 border border-glass-border">
              <label className="block text-[11px] text-gray-500 mb-1">Account Holder</label>
              <p className="text-sm text-white">{holder}</p>
            </div>
          )}
          {iban && (
            <div className="p-3 rounded-xl bg-surface-100 border border-glass-border">
              <label className="block text-[11px] text-gray-500 mb-1">IBAN</label>
              <div className="flex items-center justify-between gap-2">
                <code className="text-sm text-white font-mono">{iban}</code>
                <CopyButton text={iban} id={m.id + '-iban'} />
              </div>
            </div>
          )}
          {swift && (
            <div className="p-3 rounded-xl bg-surface-100 border border-glass-border">
              <label className="block text-[11px] text-gray-500 mb-1">SWIFT Code</label>
              <div className="flex items-center justify-between gap-2">
                <code className="text-sm text-white font-mono">{swift}</code>
                <CopyButton text={swift} id={m.id + '-swift'} />
              </div>
            </div>
          )}
          {currency && (
            <div className="p-3 rounded-xl bg-surface-100 border border-glass-border">
              <label className="block text-[11px] text-gray-500 mb-1">Currency</label>
              <p className="text-sm text-white">{currency}</p>
            </div>
          )}
          {reference && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">{reference}</p>
            </div>
          )}
          {minDeposit && (
            <p className="text-xs text-gray-500">
              Minimum deposit: <span className="text-white font-medium">{minDeposit} {currency}</span>
            </p>
          )}
        </div>
      );
    }

    const entries = Object.entries(config).filter(
      ([, v]) => v !== null && v !== undefined && v !== ''
    );
    const displayAddr = (config.wallet_address || config.address || config.account_number || config.papara_number || '') as string;

    return (
      <div className="space-y-3">
        {displayAddr && (
          <div className="p-4 rounded-xl bg-surface-100 border border-glass-border">
            <label className="block text-[11px] text-gray-500 mb-1.5">Account / Address</label>
            <div className="flex items-start justify-between gap-2">
              <code className="text-sm text-white font-mono break-all leading-relaxed">{displayAddr}</code>
              <CopyButton text={displayAddr} id={m.id + '-addr'} />
            </div>
          </div>
        )}
        {entries
          .filter(([k]) => !['wallet_address', 'address', 'account_number', 'papara_number'].includes(k))
          .map(([key, val]) => (
            <div key={key} className="p-3 rounded-xl bg-surface-100 border border-glass-border">
              <label className="block text-[11px] text-gray-500 mb-1 capitalize">{key.replace(/_/g, ' ')}</label>
              <p className="text-sm text-white">{String(val)}</p>
            </div>
          ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-surface-200 border border-glass-border rounded-2xl shadow-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-glass-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-display font-bold text-white">Deposit</h2>
            {user && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-lg border transition-colors",
                  showHistory
                    ? "bg-brand-500/10 text-brand-400 border-brand-500/30"
                    : "text-gray-500 border-glass-border hover:text-gray-300"
                )}
              >
                {showHistory ? 'Back' : 'History'}
              </button>
            )}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {showHistory ? (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {deposits.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-12">No deposits yet</p>
            ) : (
              <div className="space-y-2">
                {deposits.map(d => (
                  <div key={d.id} className="p-3 rounded-xl bg-surface-100 border border-glass-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-white">{d.amount} {d.asset}</span>
                        {d.tx_hash && (
                          <span className="text-[10px] text-gray-600 ml-2 font-mono">
                            {d.tx_hash.slice(0, 10)}...
                          </span>
                        )}
                      </div>
                      <span className={cn("text-xs font-medium capitalize", statusColor(d.status))}>
                        {d.status}
                      </span>
                    </div>
                    {d.created_at && (
                      <p className="text-[10px] text-gray-600 mt-1">
                        {new Date(d.created_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Tab selector */}
            <div className="px-6 pt-4 shrink-0">
              {loading && tabs.length <= 1 ? (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="w-4 h-4 text-brand-400 animate-spin" />
                </div>
              ) : (
                <div className="flex gap-1 p-1 bg-surface-100 rounded-xl overflow-x-auto">
                  {tabs.map(t => {
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        onClick={() => { setActiveTab(t.id); setSelectedMethod(null); }}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-colors whitespace-nowrap min-w-0',
                          activeTab === t.id ? 'bg-surface-200 text-white shadow-sm' : 'text-gray-400 hover:text-gray-300'
                        )}
                      >
                        <Icon className="w-4 h-4 shrink-0" /> {t.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {activeTab === 'wallet' ? (
                <div className="space-y-4">
                  {/* Chain selector */}
                  {chains.length > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => setChainDropdownOpen(!chainDropdownOpen)}
                        className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-surface-100 border border-glass-border hover:border-brand-500/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center">
                            <Wallet className="w-4 h-4 text-brand-400" />
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-medium text-white">
                              {currentChain?.displayName || selectedChain}
                            </div>
                            <div className="text-[11px] text-gray-500">
                              Gas: {currentChain?.gasToken || '—'}
                            </div>
                          </div>
                        </div>
                        <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", chainDropdownOpen && "rotate-180")} />
                      </button>

                      {chainDropdownOpen && (
                        <div className="absolute z-10 mt-1 w-full rounded-xl bg-surface-200 border border-glass-border shadow-xl overflow-hidden">
                          {chains.map(c => (
                            <button
                              key={c.name}
                              onClick={() => {
                                setSelectedChain(c.name);
                                setSelectedToken(c.tokens[0]?.symbol || c.gasToken);
                                setChainDropdownOpen(false);
                              }}
                              className={cn(
                                "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] transition-colors",
                                c.name === selectedChain && "bg-brand-500/5"
                              )}
                            >
                              <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
                                <span className="text-brand-400 font-bold text-[10px]">{c.gasToken}</span>
                              </div>
                              <div>
                                <div className="text-sm font-medium text-white">{c.displayName}</div>
                                <div className="text-[11px] text-gray-500">
                                  {c.tokens.map(t => t.symbol).join(', ')}
                                </div>
                              </div>
                              {c.name === selectedChain && (
                                <Check className="w-4 h-4 text-brand-400 ml-auto" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Token selector pills */}
                  {availableTokens.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {availableTokens.map(t => (
                        <button
                          key={t.symbol}
                          onClick={() => setSelectedToken(t.symbol)}
                          className={cn(
                            "px-3 py-1.5 text-xs rounded-lg border transition-colors font-medium",
                            selectedToken === t.symbol
                              ? "bg-brand-500/10 text-brand-400 border-brand-500/30"
                              : "text-gray-400 border-glass-border hover:text-gray-300 hover:border-white/[0.12]"
                          )}
                        >
                          {t.symbol}
                        </button>
                      ))}
                    </div>
                  )}

                  {walletLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
                    </div>
                  ) : walletError ? (
                    <div className="text-center py-12">
                      <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto mb-3" />
                      <p className="text-sm text-gray-400">{walletError}</p>
                      <p className="text-xs text-gray-600 mt-1">Please try again later</p>
                    </div>
                  ) : walletAddress ? (
                    <>
                      <div className="text-center">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-500/10 text-brand-400 text-xs font-medium mb-3">
                          <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
                          {selectedToken} — {currentChain?.displayName || selectedChain}
                        </div>
                      </div>

                      <div className="p-5 rounded-2xl bg-surface-100 border border-glass-border text-center">
                        <div className="w-44 h-44 bg-white rounded-xl mx-auto mb-4 flex items-center justify-center p-2">
                          <QRCodeSVG
                            value={walletAddress}
                            size={152}
                            level="H"
                            bgColor="#ffffff"
                            fgColor="#000000"
                          />
                        </div>
                        <label className="block text-[11px] text-gray-500 mb-2">Your Personal Deposit Address</label>
                        <code className="block text-sm text-white font-mono break-all leading-relaxed mb-3">
                          {walletAddress}
                        </code>
                        <CopyButton text={walletAddress} id="personal-addr" label="Copy Address" />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl bg-surface-100 border border-glass-border">
                          <div className="flex items-center gap-2 mb-1">
                            <Clock className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-[11px] text-gray-500">Est. Time</span>
                          </div>
                          <p className="text-sm font-medium text-white">{chainConf.time}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-surface-100 border border-glass-border">
                          <div className="flex items-center gap-2 mb-1">
                            <Shield className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-[11px] text-gray-500">Confirmations</span>
                          </div>
                          <p className="text-sm font-medium text-white">{chainConf.blocks} blocks</p>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div className="text-xs text-amber-300">
                          <p className="font-medium mb-0.5">
                            Only send {selectedToken} on {currentChain?.displayName || selectedChain} network to this address
                          </p>
                          <p className="text-amber-300/70">Sending tokens on wrong network may result in permanent loss of funds.</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-sm text-gray-400">Please log in to see your deposit address</p>
                    </div>
                  )}
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
                </div>
              ) : filteredMethods.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center mx-auto mb-3">
                    <CreditCard className="w-6 h-6 text-gray-500" />
                  </div>
                  <p className="text-sm text-gray-400">No {TYPE_LABELS[activeTab] || activeTab} methods available</p>
                  <p className="text-xs text-gray-600 mt-1">Contact support for deposit instructions</p>
                </div>
              ) : !selectedMethod ? (
                <div className="space-y-2">
                  {filteredMethods.map(m => {
                    const coin = (m.config?.coin || m.config?.currency || m.currency || '') as string;
                    const network = (m.config?.network || '') as string;
                    const bankName = (m.config?.bank_name || m.config?.bankName || '') as string;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setSelectedMethod(m)}
                        className="w-full p-4 rounded-xl border border-glass-border bg-surface-100 hover:border-brand-500/30 hover:bg-brand-500/5 transition-colors text-left flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
                            <span className="text-brand-400 font-bold text-xs">
                              {coin ? coin.slice(0, 4) : m.currency ? m.currency.slice(0, 4) : '?'}
                            </span>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-white">{m.name}</div>
                            {network && <div className="text-xs text-gray-500">{network}</div>}
                            {bankName && <div className="text-xs text-gray-500">{bankName}</div>}
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-gray-600" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  <button
                    onClick={() => { setSelectedMethod(null); resetClaimForm(); }}
                    className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Back to list
                  </button>
                  <div className="text-center mb-2">
                    <h3 className="text-base font-semibold text-white">{selectedMethod.name}</h3>
                    {selectedMethod.currency && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-[10px] bg-brand-500/10 text-brand-400 rounded-full">
                        {selectedMethod.currency}
                      </span>
                    )}
                  </div>
                  {renderMethodDetail(selectedMethod)}

                  {selectedMethod.type !== 'crypto' && user && (
                    claimSuccess ? (
                      <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-center">
                        <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
                        <p className="text-sm font-medium text-green-400 mb-1">Deposit Claim Submitted</p>
                        <p className="text-xs text-green-300/70">
                          Your deposit of {claimAmount} {selectedMethod.currency || 'USDT'} is pending admin verification.
                          You will be credited once confirmed.
                        </p>
                        <button
                          onClick={resetClaimForm}
                          className="mt-3 px-4 py-1.5 text-xs text-brand-400 hover:text-brand-300 border border-brand-500/30 rounded-lg transition-colors"
                        >
                          Submit Another
                        </button>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-surface-100 border border-glass-border space-y-3">
                        <p className="text-xs text-gray-400 font-medium">After sending your payment:</p>
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-1.5">Amount Sent</label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={claimAmount}
                              onChange={e => setClaimAmount(e.target.value)}
                              placeholder="0.00"
                              className="flex-1 h-10 px-3 text-sm bg-white/[0.03] border border-white/[0.08] rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-brand-500/40 focus:ring-1 focus:ring-brand-500/20"
                            />
                            <span className="flex items-center px-3 h-10 text-xs text-gray-400 bg-white/[0.03] border border-white/[0.08] rounded-lg">
                              {selectedMethod.currency || 'USDT'}
                            </span>
                          </div>
                        </div>
                        {claimError && (
                          <p className="text-xs text-red-400">{claimError}</p>
                        )}
                        <button
                          onClick={() => handleClaimDeposit(selectedMethod)}
                          disabled={claimSubmitting || !claimAmount}
                          className="w-full flex items-center justify-center gap-2 h-10 px-4 text-sm font-medium bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                        >
                          {claimSubmitting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                          {claimSubmitting ? 'Submitting...' : "I've Sent the Payment"}
                        </button>
                        <p className="text-[10px] text-gray-600 text-center">
                          Only click after you have completed the transfer. False claims may result in account restriction.
                        </p>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-glass-border shrink-0">
          <p className="text-[11px] text-gray-600 text-center">
            Deposits are credited after confirmation. Contact support for assistance.
          </p>
        </div>
      </div>
    </div>
  );
};
