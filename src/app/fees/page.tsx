'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Header, Sidebar } from '@/components/layout';
import { Skeleton } from '@/components/ui';
import { marketFeesApi, type MarketFeesResponse } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const VIP_TIERS = [
  { tier: 'Standard', volume: '< $50,000', maker: '0.10%', taker: '0.10%' },
  { tier: 'VIP 1', volume: '$50,000 – $250,000', maker: '0.08%', taker: '0.08%' },
  { tier: 'VIP 2', volume: '$250,000 – $1,000,000', maker: '0.06%', taker: '0.06%' },
  { tier: 'VIP 3', volume: '$1,000,000 – $5,000,000', maker: '0.04%', taker: '0.04%' },
  { tier: 'VIP 4', volume: '≥ $5,000,000', maker: '0.02%', taker: '0.02%' },
] as const;

const WITHDRAWAL_FEES = [
  { asset: 'BTC', network: 'Bitcoin', fee: '0.0002 BTC' },
  { asset: 'ETH', network: 'Ethereum (ERC-20)', fee: '0.0015 ETH' },
  { asset: 'USDT', network: 'TRC-20', fee: '1 USDT' },
  { asset: 'USDT', network: 'Ethereum (ERC-20)', fee: '5 USDT' },
  { asset: 'USDC', network: 'Ethereum (ERC-20)', fee: '5 USDC' },
  { asset: 'SOL', network: 'Solana', fee: '0.01 SOL' },
] as const;

export default function FeesPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [fees, setFees] = useState<MarketFeesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    marketFeesApi.getFees()
      .then(setFees)
      .catch(() => setFees(null))
      .finally(() => setLoading(false));
  }, []);

  const makerDisplay = fees?.spot.maker_percent ?? '0.10%';
  const takerDisplay = fees?.spot.taker_percent ?? '0.10%';

  return (
    <div className="min-h-screen bg-surface-500">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main id="main-content" className="pt-16 pb-8 px-4 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="py-6 border-b border-glass-border">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-2xl font-display font-bold text-white mb-1">{t('fees.title')}</h1>
              <p className="text-gray-400 text-sm">{t('fees.subtitle')}</p>
            </motion.div>
          </div>

          <div className="py-8 space-y-12">
            <section>
              <h2 className="text-lg font-semibold text-white mb-2">{t('fees.spotTitle')}</h2>
              <p className="text-gray-400 text-sm mb-4 max-w-2xl">{t('fees.spotDesc')}</p>
              <div className="overflow-x-auto rounded-xl border border-glass-border bg-surface-100/50">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-glass-border bg-surface-100">
                      <th scope="col" className="px-4 py-3 font-semibold text-white">{t('fees.type')}</th>
                      <th scope="col" className="px-4 py-3 font-semibold text-white">{t('fees.rate')}</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-300">
                    <tr className="border-b border-glass-border/80">
                      <td className="px-4 py-3 text-gray-400">{t('fees.maker')}</td>
                      <td className="px-4 py-3 text-white font-medium tabular-nums">
                        {loading ? <Skeleton width={48} height={16} /> : makerDisplay}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-gray-400">{t('fees.taker')}</td>
                      <td className="px-4 py-3 text-white font-medium tabular-nums">
                        {loading ? <Skeleton width={48} height={16} /> : takerDisplay}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500 mt-3">{t('fees.spotNote')}</p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-2">{t('fees.vipTitle')}</h2>
              <p className="text-gray-400 text-sm mb-4 max-w-2xl">{t('fees.vipDesc')}</p>
              <div className="overflow-x-auto rounded-xl border border-glass-border bg-surface-100/50">
                <table className="w-full text-sm text-left border-collapse min-w-[640px]">
                  <thead>
                    <tr className="border-b border-glass-border bg-surface-100">
                      <th scope="col" className="px-4 py-3 font-semibold text-white">{t('fees.tier')}</th>
                      <th scope="col" className="px-4 py-3 font-semibold text-white">{t('fees.volume')}</th>
                      <th scope="col" className="px-4 py-3 font-semibold text-white">{t('fees.maker')}</th>
                      <th scope="col" className="px-4 py-3 font-semibold text-white">{t('fees.taker')}</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-300">
                    {VIP_TIERS.map((row, i) => (
                      <tr
                        key={row.tier}
                        className={i < VIP_TIERS.length - 1 ? 'border-b border-glass-border/80' : ''}
                      >
                        <td className="px-4 py-3 text-white font-medium">{row.tier}</td>
                        <td className="px-4 py-3 text-gray-400">{row.volume}</td>
                        <td className="px-4 py-3 text-white font-medium tabular-nums">{row.maker}</td>
                        <td className="px-4 py-3 text-white font-medium tabular-nums">{row.taker}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-2">{t('fees.withdrawTitle')}</h2>
              <p className="text-gray-400 text-sm mb-4 max-w-2xl">{t('fees.withdrawDesc')}</p>
              <div className="overflow-x-auto rounded-xl border border-glass-border bg-surface-100/50">
                <table className="w-full text-sm text-left border-collapse min-w-[520px]">
                  <thead>
                    <tr className="border-b border-glass-border bg-surface-100">
                      <th scope="col" className="px-4 py-3 font-semibold text-white">{t('fees.asset')}</th>
                      <th scope="col" className="px-4 py-3 font-semibold text-white">{t('fees.network')}</th>
                      <th scope="col" className="px-4 py-3 font-semibold text-white">{t('fees.fee')}</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-300">
                    {WITHDRAWAL_FEES.map((row, i) => (
                      <tr
                        key={`${row.asset}-${row.network}`}
                        className={i < WITHDRAWAL_FEES.length - 1 ? 'border-b border-glass-border/80' : ''}
                      >
                        <td className="px-4 py-3 text-white font-medium">{row.asset}</td>
                        <td className="px-4 py-3 text-gray-400">{row.network}</td>
                        <td className="px-4 py-3 text-white font-medium tabular-nums">{row.fee}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
