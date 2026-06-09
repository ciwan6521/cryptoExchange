'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Sparkles, Coins, Shield, Rocket, Users, ArrowRight, ExternalLink,
  CheckCircle2, Globe, Zap, TrendingUp, Copy, Check, Loader2, ShoppingBag,
} from 'lucide-react';
import { Header, Sidebar, Footer } from '@/components/layout';
import { Button } from '@/components/ui';
import { cn, formatNumber } from '@/lib/utils';
import { launchpadApi, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useBalanceStore } from '@/stores/balance-store';
import { toast } from 'sonner';
import {
  t4proIco,
  t4proSocialLinks,
  t4proUtilities,
  t4proTokenomics,
  t4proRoadmap,
  t4proSteps,
} from '@/lib/t4pro-ico';

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

const socialIcons: Record<string, React.FC<{ className?: string }>> = {
  telegram: TelegramIcon,
  twitter: TwitterIcon,
  instagram: InstagramIcon,
};

const statusConfig = {
  live: { label: 'ICO Live', className: 'bg-profit/20 text-profit border-profit/30' },
  upcoming: { label: 'Coming Soon', className: 'bg-brand-500/20 text-brand-400 border-brand-500/30' },
  ended: { label: 'Sale Ended', className: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
};

export default function T4ProIcoPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { isAuthenticated } = useAuthStore();
  const { fetchBalances } = useBalanceStore();
  const status = statusConfig[t4proIco.sale.status] || statusConfig.live;

  const [sales, setSales] = useState<Array<{
    id: string; token_symbol: string; name: string; price_usdt: string;
    remaining: string; min_purchase_usdt: string; max_purchase_usdt: string;
  }>>([]);
  const [purchases, setPurchases] = useState<Array<{
    id: string; token_symbol: string; amount_usdt: string; tokens: string; created_at: string;
  }>>([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [purchaseAmount, setPurchaseAmount] = useState<Record<string, string>>({});
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  const loadLaunchpad = useCallback(async () => {
    setSalesLoading(true);
    try {
      const salesRes = await launchpadApi.getSales();
      setSales(salesRes.sales || []);
      if (isAuthenticated) {
        const purchasesRes = await launchpadApi.getPurchases();
        setPurchases(purchasesRes.purchases || []);
      } else {
        setPurchases([]);
      }
    } catch {
      setSales([]);
    } finally {
      setSalesLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { loadLaunchpad(); }, [loadLaunchpad]);

  const handlePurchase = async (saleId: string) => {
    if (!isAuthenticated) {
      toast.error('Please log in to purchase');
      return;
    }
    const amount = purchaseAmount[saleId];
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Enter a valid USDT amount');
      return;
    }
    setPurchasingId(saleId);
    try {
      const res = await launchpadApi.purchase({ sale_id: saleId, amount_usdt: amount });
      toast.success(`Purchased ${formatNumber(parseFloat(res.purchase.tokens))} ${res.purchase.token_symbol}`);
      setPurchaseAmount(prev => ({ ...prev, [saleId]: '' }));
      await Promise.all([loadLaunchpad(), fetchBalances()]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Purchase failed');
    } finally {
      setPurchasingId(null);
    }
  };

  const copySymbol = async () => {
    try {
      await navigator.clipboard.writeText(t4proIco.token.symbol);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="min-h-screen bg-surface-500 flex flex-col">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 pt-16">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-glass-border">
          <div className="absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-500/20 via-surface-500 to-purple-900/20" />
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-[120px]" />
            <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-500/15 rounded-full blur-[100px]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-500/10 via-transparent to-transparent" />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="flex flex-wrap items-center gap-3 mb-6">
                  <span className={cn('inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold rounded-full border', status.className)}>
                    <span className="relative flex h-2 w-2">
                      {t4proIco.sale.status === 'live' && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-profit opacity-75" />
                      )}
                      <span className={cn('relative inline-flex rounded-full h-2 w-2', t4proIco.sale.status === 'live' ? 'bg-profit' : 'bg-brand-500')} />
                    </span>
                    {status.label}
                  </span>
                  <span className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400">
                    {t4proIco.token.network} · {t4proIco.token.standard}
                  </span>
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-bold text-white mb-4 tracking-tight">
                  <span className="text-gradient">{t4proIco.token.symbol}</span>
                  <br />
                  Token Sale
                </h1>
                <p className="text-lg text-gray-400 mb-8 max-w-xl leading-relaxed">
                  {t4proIco.token.tagline}. Be part of the next-generation exchange ecosystem with real utility from day one.
                </p>

                <div className="flex flex-wrap gap-3 mb-8">
                  {t4proSocialLinks.map(link => {
                    const Icon = socialIcons[link.name];
                    return (
                      <a
                        key={link.name}
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white hover:bg-brand-500/10 hover:border-brand-500/30 transition-colors"
                      >
                        {Icon && <Icon className="w-4 h-4" />}
                        {link.label}
                        <ExternalLink className="w-3 h-3 text-gray-500" />
                      </a>
                    );
                  })}
                </div>

                <div className="flex flex-wrap gap-4">
                  {t4proIco.links.buyUrl ? (
                    <a href={t4proIco.links.buyUrl} target="_blank" rel="noopener noreferrer">
                      <Button size="lg" icon={<Rocket className="w-5 h-5" />}>
                        Buy {t4proIco.token.symbol}
                      </Button>
                    </a>
                  ) : (
                    <Link href="/auth/register">
                      <Button size="lg" icon={<Rocket className="w-5 h-5" />}>
                        Get Started
                      </Button>
                    </Link>
                  )}
                  <a href={t4proIco.social.telegram} target="_blank" rel="noopener noreferrer">
                    <Button variant="secondary" size="lg" icon={<TelegramIcon className="w-5 h-5" />}>
                      Join Telegram
                    </Button>
                  </a>
                </div>
              </motion.div>

              {/* Token card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.15 }}
                className="relative"
              >
                <div className="absolute -inset-1 bg-gradient-to-r from-brand-500 via-purple-500 to-brand-500 rounded-3xl blur-lg opacity-40" />
                <div className="relative rounded-3xl border border-glass-border bg-surface-200/90 backdrop-blur-xl p-8 shadow-2xl">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
                        <span className="text-lg font-bold text-white">T4</span>
                      </div>
                      <div>
                        <p className="text-xl font-bold text-white">{t4proIco.token.name}</p>
                        <button
                          type="button"
                          onClick={copySymbol}
                          className="flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300"
                        >
                          ${t4proIco.token.symbol}
                          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <Sparkles className="w-8 h-8 text-brand-400/60" />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: 'ICO Price', value: `$${t4proIco.sale.priceUsd}` },
                      { label: 'Hard Cap', value: `$${t4proIco.sale.hardCapUsd}` },
                      { label: 'Soft Cap', value: `$${t4proIco.sale.softCapUsd}` },
                      { label: 'Min. Buy', value: `$${t4proIco.sale.minBuyUsd}` },
                    ].map(item => (
                      <div key={item.label} className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{item.label}</p>
                        <p className="text-lg font-bold text-white tabular-nums">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 pt-6 border-t border-white/[0.06]">
                    <p className="text-xs text-gray-500 mb-2">Accepted currencies</p>
                    <div className="flex gap-2">
                      {t4proIco.sale.accepted.map(c => (
                        <span key={c} className="px-3 py-1 text-xs font-medium rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>

                  {process.env.NEXT_PUBLIC_T4PRO_CONTRACT_ADDRESS && (
                    <div className="mt-4 pt-4 border-t border-white/[0.06]">
                      <p className="text-xs text-gray-500 mb-1">On-chain contract (BSC)</p>
                      <p className="text-xs font-mono text-brand-400 break-all">
                        {process.env.NEXT_PUBLIC_T4PRO_CONTRACT_ADDRESS}
                      </p>
                      <a
                        href={`https://bscscan.com/address/${process.env.NEXT_PUBLIC_T4PRO_CONTRACT_ADDRESS}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-brand-400 mt-2"
                      >
                        View on BscScan <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Utility */}
        <section className="py-16 md:py-20 border-b border-glass-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <span className="inline-block px-3 py-1 text-xs font-medium text-brand-400 bg-brand-500/10 rounded-full mb-4">
                Token Utility
              </span>
              <h2 className="text-3xl md:text-4xl font-display font-bold text-white mb-3">
                Why hold {t4proIco.token.symbol}?
              </h2>
              <p className="text-gray-400 max-w-2xl mx-auto">
                More than a memecoin — T4PRO is designed for real use inside Crypto4Pro from launch.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {t4proUtilities.map((u, i) => (
                <motion.div
                  key={u.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="p-5 rounded-2xl bg-surface-200 border border-glass-border hover:border-brand-500/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center mb-4">
                    {i === 0 && <TrendingUp className="w-5 h-5 text-brand-400" />}
                    {i === 1 && <Coins className="w-5 h-5 text-brand-400" />}
                    {i === 2 && <Users className="w-5 h-5 text-brand-400" />}
                    {i === 3 && <Rocket className="w-5 h-5 text-brand-400" />}
                  </div>
                  <h3 className="font-semibold text-white mb-2">{u.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{u.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Tokenomics + Roadmap */}
        <section className="py-16 md:py-20 border-b border-glass-border bg-surface-300/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12">
            <div>
              <h2 className="text-2xl md:text-3xl font-display font-bold text-white mb-6 flex items-center gap-2">
                <Coins className="w-7 h-7 text-brand-400" />
                Tokenomics
              </h2>
              <p className="text-sm text-gray-500 mb-6">Total supply: 1,000,000,000 {t4proIco.token.symbol}</p>
              <div className="space-y-3">
                {t4proTokenomics.map(item => (
                  <div key={item.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-300">{item.label}</span>
                      <span className="text-white font-medium">{item.percent}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div className={cn('h-full rounded-full', item.color)} style={{ width: `${item.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-display font-bold text-white mb-6 flex items-center gap-2">
                <Globe className="w-7 h-7 text-brand-400" />
                Roadmap
              </h2>
              <div className="space-y-4">
                {t4proRoadmap.map((phase, i) => (
                  <div key={phase.phase} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-brand-500 ring-4 ring-brand-500/20" />
                      {i < t4proRoadmap.length - 1 && <div className="w-px flex-1 bg-white/10 mt-1 min-h-[40px]" />}
                    </div>
                    <div className="pb-4">
                      <p className="text-xs text-brand-400 font-medium mb-0.5">{phase.phase}</p>
                      <p className="font-semibold text-white mb-2">{phase.title}</p>
                      <ul className="space-y-1">
                        {phase.items.map(item => (
                          <li key={item} className="text-sm text-gray-500 flex items-center gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 text-brand-500/60 shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Launchpad purchase */}
        <section className="py-16 md:py-20 border-b border-glass-border bg-surface-300/30">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <span className="inline-flex items-center gap-2 px-3 py-1 text-xs font-medium text-brand-400 bg-brand-500/10 rounded-full mb-4">
                <ShoppingBag className="w-3.5 h-3.5" />
                Launchpad
              </span>
              <h2 className="text-3xl font-display font-bold text-white mb-3">Purchase T4PRO</h2>
              <p className="text-gray-400">Buy tokens directly from the platform launchpad using USDT</p>
            </div>

            {salesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
              </div>
            ) : sales.length === 0 ? (
              <p className="text-center text-sm text-gray-600 py-8">No active sales at the moment</p>
            ) : (
              <div className="space-y-4">
                {sales.map(sale => (
                  <motion.div
                    key={sale.id}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="rounded-2xl border border-glass-border bg-surface-200 p-6"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white">{sale.name}</h3>
                        <p className="text-sm text-gray-400 mt-1">
                          ${sale.price_usdt} per {sale.token_symbol} · {sale.remaining} remaining
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          Min ${sale.min_purchase_usdt} · Max ${sale.max_purchase_usdt}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="Amount in USDT"
                        value={purchaseAmount[sale.id] || ''}
                        onChange={e => setPurchaseAmount(prev => ({ ...prev, [sale.id]: e.target.value }))}
                        className="flex-1 bg-surface-100 border border-glass-border rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-brand-500/50"
                      />
                      <Button
                        loading={purchasingId === sale.id}
                        onClick={() => handlePurchase(sale.id)}
                        icon={<Rocket className="w-4 h-4" />}
                      >
                        Purchase
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {isAuthenticated && purchases.length > 0 && (
              <div className="mt-10">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Your Purchases</h3>
                <div className="space-y-2">
                  {purchases.map(p => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/[0.06] text-sm"
                    >
                      <span className="text-white">{formatNumber(parseFloat(p.tokens))} {p.token_symbol}</span>
                      <span className="text-gray-500">${p.amount_usdt} · {new Date(p.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* How to participate */}
        <section className="py-16 md:py-20 border-b border-glass-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-display font-bold text-white mb-3">How to Participate</h2>
              <p className="text-gray-400">Four simple steps to join the T4PRO ICO</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {t4proSteps.map((s, i) => (
                <div key={s.step} className="relative p-6 rounded-2xl bg-surface-200 border border-glass-border">
                  <span className="text-3xl font-display font-bold text-brand-500/30">{s.step}</span>
                  <h3 className="font-semibold text-white mt-2 mb-2">{s.title}</h3>
                  <p className="text-sm text-gray-500">{s.desc}</p>
                  {i < t4proSteps.length - 1 && (
                    <ArrowRight className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-700" />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href="/kyc">
                <Button variant="secondary" icon={<Shield className="w-4 h-4" />}>Complete KYC</Button>
              </Link>
              <Link href="/wallet">
                <Button variant="secondary" icon={<Zap className="w-4 h-4" />}>Fund Wallet</Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Social CTA banner */}
        <section className="py-16 md:py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-brand-500/10 via-purple-500/10 to-brand-500/10" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-4xl font-display font-bold text-white mb-4">
                Join the {t4proIco.token.symbol} Community
              </h2>
              <p className="text-gray-400 mb-10 max-w-xl mx-auto">
                Stay updated on whitelist rounds, AMA sessions, and listing announcements. Follow us on all channels.
              </p>
              <div className="grid sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
                {t4proSocialLinks.map(link => {
                  const Icon = socialIcons[link.name];
                  const colors: Record<string, string> = {
                    telegram: 'hover:border-sky-500/40 hover:bg-sky-500/10 group-hover:text-sky-400',
                    twitter: 'hover:border-white/30 hover:bg-white/5 group-hover:text-white',
                    instagram: 'hover:border-pink-500/40 hover:bg-pink-500/10 group-hover:text-pink-400',
                  };
                  return (
                    <a
                      key={link.name}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'group flex flex-col items-center gap-3 p-6 rounded-2xl border border-glass-border bg-surface-200 transition-all',
                        colors[link.name],
                      )}
                    >
                      {Icon && <Icon className="w-8 h-8 text-gray-400 group-hover:scale-110 transition-transform" />}
                      <span className="font-semibold text-white">{link.label}</span>
                      <span className="text-xs text-gray-500">{link.description}</span>
                    </a>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Disclaimer */}
        <section className="py-8 border-t border-glass-border bg-surface-300/50">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <p className="text-xs text-gray-600 leading-relaxed">
              Cryptocurrency investments carry risk. This page is for informational purposes and does not constitute financial advice.
              Token sale terms, dates and allocations may change. Always verify official links through our verified social channels.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
