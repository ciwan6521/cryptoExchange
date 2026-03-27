'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Header, Sidebar } from '@/components/layout';

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

  return (
    <div className="min-h-screen bg-surface-500">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main id="main-content" className="pt-16 pb-8 px-4 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="py-6 border-b border-glass-border">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-2xl font-display font-bold text-white mb-1">Fee Schedule</h1>
              <p className="text-gray-400 text-sm">
                Crypto4Pro — Last updated: March 2026. Fees are subject to change with notice on this page.
              </p>
            </motion.div>
          </div>

          <div className="py-8 space-y-12">
            <section>
              <h2 className="text-lg font-semibold text-white mb-2">Spot trading</h2>
              <p className="text-gray-400 text-sm mb-4 max-w-2xl">
                Spot maker and taker fees apply to executed trades. Your effective rate depends on your 30-day trading volume and VIP tier.
              </p>
              <div className="overflow-x-auto rounded-xl border border-glass-border bg-surface-100/50">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-glass-border bg-surface-100">
                      <th scope="col" className="px-4 py-3 font-semibold text-white">Type</th>
                      <th scope="col" className="px-4 py-3 font-semibold text-white">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-300">
                    <tr className="border-b border-glass-border/80">
                      <td className="px-4 py-3 text-gray-400">Maker</td>
                      <td className="px-4 py-3 text-white font-medium tabular-nums">0.10%</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-gray-400">Taker</td>
                      <td className="px-4 py-3 text-white font-medium tabular-nums">0.10%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Base spot rates before VIP discounts. Maker orders add liquidity; taker orders remove liquidity.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-2">VIP tiers</h2>
              <p className="text-gray-400 text-sm mb-4 max-w-2xl">
                30-day spot trading volume is calculated in USD equivalent across all pairs. Higher tiers unlock lower maker and taker fees.
              </p>
              <div className="overflow-x-auto rounded-xl border border-glass-border bg-surface-100/50">
                <table className="w-full text-sm text-left border-collapse min-w-[640px]">
                  <thead>
                    <tr className="border-b border-glass-border bg-surface-100">
                      <th scope="col" className="px-4 py-3 font-semibold text-white">Tier</th>
                      <th scope="col" className="px-4 py-3 font-semibold text-white">30-day volume (USD)</th>
                      <th scope="col" className="px-4 py-3 font-semibold text-white">Maker</th>
                      <th scope="col" className="px-4 py-3 font-semibold text-white">Taker</th>
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
              <h2 className="text-lg font-semibold text-white mb-2">Withdrawal fees</h2>
              <p className="text-gray-400 text-sm mb-4 max-w-2xl">
                Network fees are charged per withdrawal and may be adjusted with network congestion. Always confirm the amount shown at withdrawal time.
              </p>
              <div className="overflow-x-auto rounded-xl border border-glass-border bg-surface-100/50">
                <table className="w-full text-sm text-left border-collapse min-w-[520px]">
                  <thead>
                    <tr className="border-b border-glass-border bg-surface-100">
                      <th scope="col" className="px-4 py-3 font-semibold text-white">Asset</th>
                      <th scope="col" className="px-4 py-3 font-semibold text-white">Network</th>
                      <th scope="col" className="px-4 py-3 font-semibold text-white">Fee</th>
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
