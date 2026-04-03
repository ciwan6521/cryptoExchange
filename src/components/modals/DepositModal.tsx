'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { X, Copy, Check, Wallet, AlertTriangle, Loader2, ArrowRight, Clock, Shield, CreditCard, Building2, ChevronLeft, Send, CheckCircle2, Banknote, TrendingUp, Info } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '@/lib/utils';
import { depositApi, type PaymentMethod, type ChainInfo, type MethodRateInfo } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ICON_CDN = 'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color';

const CHAIN_LOGO: Record<string, string> = {
  bsc:      `${ICON_CDN}/bnb.svg`,
  ethereum: `${ICON_CDN}/eth.svg`,
  tron:     `${ICON_CDN}/trx.svg`,
};

const TOKEN_LOGO: Record<string, string> = {
  BNB:  `${ICON_CDN}/bnb.svg`,
  ETH:  `${ICON_CDN}/eth.svg`,
  TRX:  `${ICON_CDN}/trx.svg`,
  USDT: `${ICON_CDN}/usdt.svg`,
  USDC: `${ICON_CDN}/usdc.svg`,
  DAI:  `${ICON_CDN}/dai.svg`,
  BTCB: `${ICON_CDN}/btc.svg`,
  WETH: `${ICON_CDN}/eth.svg`,
  BTC:  `${ICON_CDN}/btc.svg`,
};

const FIAT_TYPE_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  papara: 'Papara',
  external_api: 'External',
  manual: 'Manual',
};

const FIAT_TYPE_ICONS: Record<string, React.ElementType> = {
  bank_transfer: Building2,
  papara: CreditCard,
  external_api: CreditCard,
  manual: CreditCard,
};

const BANK_DOMAIN: Record<string, string> = {
  ziraat: 'ziraatbank.com.tr',
  garanti: 'garantibbva.com.tr',
  isbank: 'isbank.com.tr',
  is: 'isbank.com.tr',
  yapikredi: 'yapikredi.com.tr',
  akbank: 'akbank.com',
  halkbank: 'halkbank.com.tr',
  vakifbank: 'vakifbank.com.tr',
  finansbank: 'qnbfinansbank.com',
  qnb: 'qnbfinansbank.com',
  denizbank: 'denizbank.com',
  teb: 'teb.com.tr',
  ing: 'ing.com.tr',
  hsbc: 'hsbc.com.tr',
  kuveytturk: 'kuveytturk.com.tr',
  enpara: 'enpara.com',
  papara: 'papara.com',
};

const getBankLogo = (method: { type: string; config?: Record<string, unknown>; name?: string }): string | null => {
  if (method.type === 'papara') return 'https://www.google.com/s2/favicons?domain=papara.com&sz=64';
  const bankCode = ((method.config?.bank_code || '') as string).toLowerCase();
  if (bankCode && BANK_DOMAIN[bankCode]) {
    return `https://www.google.com/s2/favicons?domain=${BANK_DOMAIN[bankCode]}&sz=64`;
  }
  const bankName = ((method.config?.bank_name || method.config?.bankName || method.name || '') as string).toLowerCase();
  for (const [key, domain] of Object.entries(BANK_DOMAIN)) {
    if (bankName.includes(key) || bankName.includes(domain.split('.')[0])) {
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    }
  }
  return null;
};

const FLAG_CDN = 'https://flagcdn.com/w80';
const CURRENCY_FLAG: Record<string, string> = {
  TRY: `${FLAG_CDN}/tr.png`,
  USD: `${FLAG_CDN}/us.png`,
  EUR: `${FLAG_CDN}/eu.png`,
  GBP: `${FLAG_CDN}/gb.png`,
  RUB: `${FLAG_CDN}/ru.png`,
  AED: `${FLAG_CDN}/ae.png`,
  JPY: `${FLAG_CDN}/jp.png`,
  CHF: `${FLAG_CDN}/ch.png`,
  CAD: `${FLAG_CDN}/ca.png`,
  AUD: `${FLAG_CDN}/au.png`,
};

const CURRENCY_META: Record<string, { symbol: string; name: string; flag: string }> = {
  TRY: { symbol: '₺', name: 'Turkish Lira', flag: '🇹🇷' },
  USD: { symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
  EUR: { symbol: '€', name: 'Euro', flag: '🇪🇺' },
  GBP: { symbol: '£', name: 'British Pound', flag: '🇬🇧' },
  RUB: { symbol: '₽', name: 'Russian Ruble', flag: '🇷🇺' },
  AED: { symbol: 'د.إ', name: 'UAE Dirham', flag: '🇦🇪' },
};

const CHAIN_CONFIRMATIONS: Record<string, { blocks: number; time: string }> = {
  bsc: { blocks: 15, time: '~1 min' },
  ethereum: { blocks: 12, time: '~3 min' },
  tron: { blocks: 19, time: '~1 min' },
};

export const DepositModal: React.FC<DepositModalProps> = ({ isOpen, onClose }) => {
  const { user } = useAuthStore();

  const [chains, setChains] = useState<ChainInfo[]>([]);
  const [selectedChain, setSelectedChain] = useState<string>('bsc');
  const [selectedToken, setSelectedToken] = useState<string>('USDT');
  const [depositStep, setDepositStep] = useState<'select' | 'address'>('select');

  const [walletAddress, setWalletAddress] = useState('');
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState('');

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'crypto' | 'fiat'>('crypto');
  const [copiedId, setCopiedId] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [deposits, setDeposits] = useState<Array<{
    id: string; asset: string; amount: string; status: string; tx_hash: string | null; created_at: string | null;
  }>>([]);

  const [selectedFiatCurrency, setSelectedFiatCurrency] = useState<string | null>(null);
  const [selectedFiatCategory, setSelectedFiatCategory] = useState<'p2p' | 'credit_card' | null>(null);

  const [claimAmount, setClaimAmount] = useState('');
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const [claimError, setClaimError] = useState('');

  const [rateInfo, setRateInfo] = useState<MethodRateInfo | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState('');
  const rateTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const rateCancelRef = React.useRef(false);

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

  const fiatMethods = useMemo(
    () => methods.filter(m => m.type !== 'crypto'),
    [methods],
  );

  const fiatCurrencies = useMemo(() => {
    const currencySet = new Set<string>();
    for (const m of fiatMethods) {
      const cur = (m.config?.currency as string) || m.currency || '';
      if (cur) currencySet.add(cur.toUpperCase());
    }
    return Array.from(currencySet).sort();
  }, [fiatMethods]);

  const filteredFiatMethods = useMemo(() => {
    if (!selectedFiatCurrency) return [];
    const matched = fiatMethods.filter(m => {
      const cur = ((m.config?.currency as string) || m.currency || '').toUpperCase();
      return cur === selectedFiatCurrency;
    });
    const isP2P = (m: PaymentMethod) => m.name.toLowerCase().includes('p2p');
    return [...matched.filter(isP2P), ...matched.filter(m => !isP2P(m))];
  }, [fiatMethods, selectedFiatCurrency]);

  const hasFiatMethods = fiatMethods.length > 0;

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

    setDepositStep('select');
    setSelectedFiatCurrency(null);
    setSelectedFiatCategory(null);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen || !user || activeTab !== 'crypto' || depositStep !== 'address') return;
    fetchAddress(selectedChain);
  }, [isOpen, user, activeTab, depositStep, selectedChain, fetchAddress]);

  useEffect(() => {
    if (!showHistory || !user) return;
    depositApi.getHistory({ limit: 20 })
      .then(data => setDeposits(data.deposits || []))
      .catch(() => setDeposits([]));
  }, [showHistory, user]);

  useEffect(() => {
    if (!isOpen) return;
    if (!user && activeTab === 'crypto') {
      if (hasFiatMethods) setActiveTab('fiat');
    }
  }, [isOpen, user, activeTab, hasFiatMethods]);

  // Fetch exchange rate (debounced when amount changes)
  useEffect(() => {
    if (rateTimerRef.current) { clearTimeout(rateTimerRef.current); rateTimerRef.current = null; }
    rateCancelRef.current = true;

    if (!selectedMethod) { setRateInfo(null); setRateError(''); return; }
    const cur = (selectedMethod.config?.currency as string || selectedMethod.currency || '').toUpperCase();
    if (cur === 'USDT' || cur === '') { setRateInfo(null); setRateError(''); return; }

    const numAmount = parseFloat(claimAmount);
    const hasValidAmount = claimAmount !== '' && !isNaN(numAmount) && numAmount > 0;
    const methodId = selectedMethod.id;

    const doFetch = () => {
      rateCancelRef.current = false;
      const thisCancelRef = rateCancelRef;
      setRateLoading(true);
      setRateError('');
      depositApi.getMethodRate(methodId, hasValidAmount ? numAmount : undefined)
        .then(data => { if (!thisCancelRef.current) setRateInfo(data); })
        .catch((err) => {
          if (!thisCancelRef.current) {
            setRateInfo(null);
            const msg = err?.detail || err?.message || 'Rate unavailable';
            setRateError(msg);
          }
        })
        .finally(() => { if (!thisCancelRef.current) setRateLoading(false); });
    };

    if (hasValidAmount) {
      rateTimerRef.current = setTimeout(doFetch, 400);
    } else {
      doFetch();
    }

    return () => { rateCancelRef.current = true; if (rateTimerRef.current) { clearTimeout(rateTimerRef.current); rateTimerRef.current = null; } };
  }, [claimAmount, selectedMethod]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const chainConf = CHAIN_CONFIRMATIONS[selectedChain] || { blocks: 15, time: '~2 min' };

  const resetClaimForm = () => {
    setClaimAmount('');
    setClaimSubmitting(false);
    setClaimSuccess(false);
    setClaimError('');
    setRateInfo(null);
    setRateError('');
  };

  const handleContinueToAddress = () => {
    setDepositStep('address');
  };

  const handleBackToSelect = () => {
    setDepositStep('select');
    setWalletAddress('');
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

  const CryptoIcon = ({ symbol, chain, size = 20 }: { symbol?: string; chain?: string; size?: number }) => {
    const src = symbol ? TOKEN_LOGO[symbol] : chain ? CHAIN_LOGO[chain] : undefined;
    if (src) {
      return (
        <img
          src={src}
          alt={symbol || chain || ''}
          width={size}
          height={size}
          className="rounded-full shrink-0"
          style={{ width: size, height: size }}
        />
      );
    }
    return (
      <div
        className="rounded-full flex items-center justify-center shrink-0 bg-white/10"
        style={{ width: size, height: size }}
      >
        <span className="font-bold text-gray-400" style={{ fontSize: size * 0.4 }}>
          {(symbol || chain || '?').charAt(0)}
        </span>
      </div>
    );
  };

  // ── Fiat: method detail renderer ──
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
            <div className="p-4 rounded-2xl bg-surface-100 border border-glass-border flex items-start gap-4">
              <div className="w-[100px] h-[100px] bg-white rounded-lg flex items-center justify-center p-1.5 shrink-0">
                <QRCodeSVG value={addr} size={88} level="H" bgColor="#ffffff" fgColor="#000000" />
              </div>
              <div className="flex-1 min-w-0">
                <label className="block text-[11px] text-gray-500 mb-1.5">Deposit Address</label>
                <code className="block text-xs text-white font-mono break-all leading-relaxed mb-2">{addr}</code>
                <CopyButton text={addr} id={m.id + '-addr'} label="Copy Address" />
              </div>
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

  // ── Step 1: Network & Token selection ──
  const renderCryptoStep1 = () => (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-medium text-gray-400 mb-2.5">Select Network</label>
        <div className={cn("grid gap-2", chains.length <= 3 ? "grid-cols-3" : "grid-cols-2")}>
          {chains.map(c => {
            const isSelected = c.name === selectedChain;
            return (
              <button
                key={c.name}
                onClick={() => {
                  setSelectedChain(c.name);
                  const hasCurrentToken = c.tokens.some(t => t.symbol === selectedToken) || c.gasToken === selectedToken;
                  if (!hasCurrentToken) {
                    setSelectedToken(c.tokens.find(t => t.symbol === 'USDT')?.symbol || c.tokens[0]?.symbol || c.gasToken);
                  }
                }}
                className={cn(
                  "relative p-3 rounded-xl border-2 transition-all text-center",
                  isSelected
                    ? "border-brand-500/50 bg-brand-500/[0.06]"
                    : "border-glass-border hover:border-brand-500/20 bg-surface-100"
                )}
              >
                {isSelected && (
                  <div className="absolute top-1.5 right-1.5">
                    <Check className="w-3.5 h-3.5 text-brand-400" />
                  </div>
                )}
                <div className="flex items-center justify-center mx-auto mb-1.5">
                  <CryptoIcon chain={c.name} size={36} />
                </div>
                <div className={cn("text-xs font-medium", isSelected ? "text-white" : "text-gray-300")}>
                  {c.displayName}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  {(CHAIN_CONFIRMATIONS[c.name] || { time: '~2 min' }).time}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {availableTokens.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-2.5">Select Token</label>
          <div className="flex gap-2 flex-wrap">
            {availableTokens.map(t => {
              const isSelected = selectedToken === t.symbol;
              return (
                <button
                  key={t.symbol}
                  onClick={() => setSelectedToken(t.symbol)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-xs rounded-xl border-2 transition-all font-medium",
                    isSelected
                      ? "bg-brand-500/[0.06] text-brand-400 border-brand-500/50"
                      : "text-gray-400 border-glass-border hover:text-gray-300 hover:border-brand-500/20 bg-surface-100"
                  )}
                >
                  <CryptoIcon symbol={t.symbol} size={18} />
                  {t.symbol}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-300 leading-relaxed">
          <p className="font-medium">
            Only send {selectedToken} on {currentChain?.displayName || selectedChain} network.
          </p>
          <p className="text-amber-300/70 mt-0.5">Wrong network = permanent loss of funds.</p>
        </div>
      </div>

      <button
        onClick={handleContinueToAddress}
        disabled={!selectedChain || !selectedToken}
        className="w-full flex items-center justify-center gap-2 h-11 text-sm font-semibold bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
      >
        Continue
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );

  // ── Step 2: Address & QR display ──
  const renderCryptoStep2 = () => (
    <div className="space-y-4">
      <button
        onClick={handleBackToSelect}
        className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Change network / token
      </button>

      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-500/10 text-brand-400 text-xs font-medium">
          <CryptoIcon symbol={selectedToken} size={16} />
          {selectedToken} — {currentChain?.displayName || selectedChain}
        </div>
      </div>

      {walletLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
        </div>
      ) : walletError ? (
        <div className="text-center py-10">
          <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto mb-3" />
          <p className="text-sm text-gray-400">{walletError}</p>
          <button
            onClick={() => fetchAddress(selectedChain)}
            className="mt-3 text-xs text-brand-400 hover:text-brand-300"
          >
            Try again
          </button>
        </div>
      ) : walletAddress ? (
        <>
          <div className="p-4 rounded-2xl bg-surface-100 border border-glass-border flex items-start gap-4">
            <div className="w-[120px] h-[120px] bg-white rounded-xl flex items-center justify-center p-2 shrink-0">
              <QRCodeSVG value={walletAddress} size={104} level="H" bgColor="#ffffff" fgColor="#000000" />
            </div>
            <div className="flex-1 min-w-0 py-1">
              <label className="block text-[11px] text-gray-500 mb-2">Your Deposit Address</label>
              <code className="block text-[13px] text-white font-mono break-all leading-relaxed mb-3">
                {walletAddress}
              </code>
              <CopyButton text={walletAddress} id="personal-addr" label="Copy Address" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-2.5 rounded-xl bg-surface-100 border border-glass-border">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Clock className="w-3 h-3 text-gray-500" />
                <span className="text-[10px] text-gray-500">Est. Time</span>
              </div>
              <p className="text-sm font-medium text-white">{chainConf.time}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-surface-100 border border-glass-border">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Shield className="w-3 h-3 text-gray-500" />
                <span className="text-[10px] text-gray-500">Confirmations</span>
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
      ) : null}
    </div>
  );

  // ── Fiat: currency → method → detail flow ──
  const renderFiatContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
        </div>
      );
    }

    if (fiatMethods.length === 0) {
      return (
        <div className="text-center py-12">
          <div className="w-12 h-12 rounded-xl bg-surface-100 flex items-center justify-center mx-auto mb-3">
            <Banknote className="w-6 h-6 text-gray-500" />
          </div>
          <p className="text-sm text-gray-400">No fiat deposit methods available</p>
          <p className="text-xs text-gray-600 mt-1">Contact support for deposit instructions</p>
        </div>
      );
    }

    // Step 3: Method detail + claim form
    if (selectedMethod) {
      return (
        <div className="space-y-4">
          <button
            onClick={() => { setSelectedMethod(null); resetClaimForm(); }}
            className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back to methods
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

          {user && (
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

                {/* Rate info panel */}
                {(() => {
                  const methodCur = (selectedMethod.config?.currency as string || selectedMethod.currency || '').toUpperCase();
                  if (methodCur === 'USDT' || methodCur === '') return null;

                  if (rateLoading) {
                    return (
                      <div className="p-3 rounded-xl bg-brand-500/[0.04] border border-brand-500/10">
                        <div className="flex items-center justify-center gap-2 py-1">
                          <Loader2 className="w-3.5 h-3.5 text-brand-400 animate-spin" />
                          <span className="text-xs text-gray-400">Updating rate...</span>
                        </div>
                      </div>
                    );
                  }

                  if (rateError) {
                    return (
                      <div className="p-3 rounded-xl bg-red-500/[0.06] border border-red-500/15">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          <span className="text-xs text-red-400">{rateError}</span>
                        </div>
                      </div>
                    );
                  }

                  if (!rateInfo) return null;

                  return (
                    <div className="p-3 rounded-xl bg-brand-500/[0.04] border border-brand-500/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5 text-brand-400" />
                          <span className="text-[11px] text-gray-400">Current Rate</span>
                        </div>
                        <span className="text-xs font-semibold text-white">
                          1 {rateInfo.target_currency} = {rateInfo.effective_rate.toLocaleString(undefined, { maximumFractionDigits: 2 })} {rateInfo.currency}
                        </span>
                      </div>
                      {rateInfo.converted_amount != null && (
                        <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                          <span className="text-[11px] text-gray-400">You will receive</span>
                          <span className="text-sm font-bold text-brand-400">
                            ~{rateInfo.converted_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {rateInfo.target_currency}
                          </span>
                        </div>
                      )}
                      {rateInfo.markup_percent > 0 && (
                        <div className="flex items-center gap-1 pt-1">
                          <Info className="w-3 h-3 text-gray-600" />
                          <span className="text-[10px] text-gray-600">
                            Rate spread: %{rateInfo.markup_percent}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}

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
      );
    }

    // Step 3: Method list (P2P category selected)
    if (selectedFiatCurrency && selectedFiatCategory === 'p2p') {
      return (
        <div className="space-y-4">
          <button
            onClick={() => setSelectedFiatCategory(null)}
            className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back to categories
          </button>

          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-500/10 text-brand-400 text-xs font-medium">
              {CURRENCY_FLAG[selectedFiatCurrency] ? (
                <img src={CURRENCY_FLAG[selectedFiatCurrency]} alt={selectedFiatCurrency} width={18} height={18} className="rounded-full object-cover" style={{ width: 18, height: 18 }} />
              ) : (
                <span className="text-base leading-none">{CURRENCY_META[selectedFiatCurrency]?.flag || '💱'}</span>
              )}
              {selectedFiatCurrency} — P2P
            </div>
          </div>

          <label className="block text-xs font-medium text-gray-400 mb-2.5">Select Method</label>
          {filteredFiatMethods.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">No P2P methods available for {selectedFiatCurrency}</p>
            </div>
          ) : (
            <div className={cn("grid gap-3", filteredFiatMethods.length <= 3 ? "grid-cols-3" : "grid-cols-2")}>
              {filteredFiatMethods.map(m => {
                const Icon = FIAT_TYPE_ICONS[m.type] || CreditCard;
                const typeLabel = FIAT_TYPE_LABELS[m.type] || m.type;
                const bankName = (m.config?.bank_name || m.config?.bankName || '') as string;
                const logo = getBankLogo(m);
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMethod(m)}
                    className="p-4 rounded-xl border-2 border-glass-border bg-surface-100 hover:border-brand-500/30 hover:bg-brand-500/[0.04] transition-all text-center"
                  >
                    <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center mx-auto mb-2 overflow-hidden">
                      {logo ? (
                        <img src={logo} alt={bankName || m.name} width={28} height={28} className="rounded" />
                      ) : (
                        <Icon className="w-5 h-5 text-brand-400" />
                      )}
                    </div>
                    <div className="text-sm font-semibold text-white">{m.name}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{typeLabel}</div>
                    {bankName && <div className="text-[10px] text-gray-600 mt-0.5">{bankName}</div>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // Step 3: Credit Card (coming soon)
    if (selectedFiatCurrency && selectedFiatCategory === 'credit_card') {
      return (
        <div className="space-y-4">
          <button
            onClick={() => setSelectedFiatCategory(null)}
            className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back to categories
          </button>

          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-500/10 text-brand-400 text-xs font-medium">
              {CURRENCY_FLAG[selectedFiatCurrency] ? (
                <img src={CURRENCY_FLAG[selectedFiatCurrency]} alt={selectedFiatCurrency} width={18} height={18} className="rounded-full object-cover" style={{ width: 18, height: 18 }} />
              ) : (
                <span className="text-base leading-none">{CURRENCY_META[selectedFiatCurrency]?.flag || '💱'}</span>
              )}
              {selectedFiatCurrency} — Credit Card
            </div>
          </div>

          <div className="text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-surface-100 flex items-center justify-center mx-auto mb-4">
              <CreditCard className="w-7 h-7 text-gray-500" />
            </div>
            <p className="text-sm font-medium text-gray-300 mb-1">Coming Soon</p>
            <p className="text-xs text-gray-600">Credit card deposits will be available shortly.</p>
          </div>
        </div>
      );
    }

    // Step 2: Category selection (P2P / Credit Card)
    if (selectedFiatCurrency) {
      return (
        <div className="space-y-4">
          <button
            onClick={() => setSelectedFiatCurrency(null)}
            className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Change currency
          </button>

          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-500/10 text-brand-400 text-xs font-medium">
              {CURRENCY_FLAG[selectedFiatCurrency] ? (
                <img src={CURRENCY_FLAG[selectedFiatCurrency]} alt={selectedFiatCurrency} width={18} height={18} className="rounded-full object-cover" style={{ width: 18, height: 18 }} />
              ) : (
                <span className="text-base leading-none">{CURRENCY_META[selectedFiatCurrency]?.flag || '💱'}</span>
              )}
              {selectedFiatCurrency} — {CURRENCY_META[selectedFiatCurrency]?.name || selectedFiatCurrency}
            </div>
          </div>

          <label className="block text-xs font-medium text-gray-400 mb-2.5">Select Payment Type</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setSelectedFiatCategory('p2p')}
              className="p-5 rounded-xl border-2 border-glass-border bg-surface-100 hover:border-brand-500/30 hover:bg-brand-500/[0.04] transition-all text-center"
            >
              <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center mx-auto mb-3">
                <ArrowRight className="w-6 h-6 text-brand-400 rotate-45" />
              </div>
              <div className="text-sm font-semibold text-white">P2P</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Bank Transfer</div>
            </button>

            <button
              onClick={() => setSelectedFiatCategory('credit_card')}
              className="p-5 rounded-xl border-2 border-glass-border bg-surface-100 hover:border-brand-500/30 hover:bg-brand-500/[0.04] transition-all text-center"
            >
              <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center mx-auto mb-3">
                <CreditCard className="w-6 h-6 text-brand-400" />
              </div>
              <div className="text-sm font-semibold text-white">Credit Card</div>
              <div className="text-[11px] text-gray-500 mt-0.5">Visa / Mastercard</div>
            </button>
          </div>
        </div>
      );
    }

    // Step 1: Currency selection
    return (
      <div className="space-y-5">
        <label className="block text-xs font-medium text-gray-400 mb-2.5">Select Currency</label>
        <div className={cn("grid gap-3", fiatCurrencies.length <= 3 ? "grid-cols-3" : "grid-cols-2")}>
          {fiatCurrencies.map(cur => {
            const meta = CURRENCY_META[cur];
            const methodCount = fiatMethods.filter(m => {
              const c = ((m.config?.currency as string) || m.currency || '').toUpperCase();
              return c === cur;
            }).length;
            const flagSrc = CURRENCY_FLAG[cur];
            return (
              <button
                key={cur}
                onClick={() => setSelectedFiatCurrency(cur)}
                className="p-4 rounded-xl border-2 border-glass-border bg-surface-100 hover:border-brand-500/30 hover:bg-brand-500/[0.04] transition-all text-center"
              >
                <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center mx-auto mb-2 overflow-hidden">
                  {flagSrc ? (
                    <img src={flagSrc} alt={cur} width={40} height={40} className="object-cover w-full h-full" />
                  ) : (
                    <span className="text-xl">{meta?.flag || '💱'}</span>
                  )}
                </div>
                <div className="text-sm font-semibold text-white">{cur}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">{meta?.name || cur}</div>
                <div className="text-[10px] text-gray-600 mt-1">
                  {methodCount} {methodCount === 1 ? 'method' : 'methods'}
                </div>
              </button>
            );
          })}
        </div>
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
            <div className="flex items-center gap-2">
              <img src="/pay4pro-logo.svg" alt="Pay4Pro" className="h-8" />
              <span className="text-lg font-display font-bold text-white">Deposit</span>
            </div>
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
            {/* Two-tab selector: Crypto | Fiat */}
            <div className="px-6 pt-4 shrink-0">
              <div className="flex gap-1 p-1 bg-surface-100 rounded-xl">
                {user && (
                  <button
                    onClick={() => { setActiveTab('crypto'); setSelectedMethod(null); setDepositStep('select'); }}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-colors',
                      activeTab === 'crypto' ? 'bg-surface-200 text-white shadow-sm' : 'text-gray-400 hover:text-gray-300'
                    )}
                  >
                    <Wallet className="w-4 h-4 shrink-0" /> Crypto
                  </button>
                )}
                <button
                  onClick={() => { setActiveTab('fiat'); setSelectedMethod(null); setSelectedFiatCurrency(null); setSelectedFiatCategory(null); }}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-colors',
                    activeTab === 'fiat' ? 'bg-surface-200 text-white shadow-sm' : 'text-gray-400 hover:text-gray-300'
                  )}
                >
                  <Banknote className="w-4 h-4 shrink-0" /> Fiat
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {activeTab === 'crypto' ? (
                depositStep === 'select'
                  ? renderCryptoStep1()
                  : renderCryptoStep2()
              ) : (
                renderFiatContent()
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
