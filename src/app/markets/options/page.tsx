'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { BarChart3, ArrowLeft } from 'lucide-react';
import { Header, Sidebar } from '@/components/layout';
import { Button } from '@/components/ui';

export default function OptionsPage() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-surface-500">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main id="main-content" className="pt-16 flex items-center justify-center min-h-screen">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center px-4"
        >
          <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center mx-auto mb-6">
            <BarChart3 className="w-8 h-8 text-brand-400" />
          </div>
          <h1 className="text-2xl font-display font-bold text-white mb-2">
            Options Trading
          </h1>
          <p className="text-gray-400 mb-2 max-w-md">
            Trade crypto options with advanced strategies. This feature is coming soon.
          </p>
          <span className="inline-block px-3 py-1 text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full mb-6">
            Coming Soon
          </span>
          <div className="flex items-center justify-center gap-3">
            <Link href="/markets/spot">
              <Button variant="secondary" icon={<ArrowLeft className="w-4 h-4" />}>
                Spot Markets
              </Button>
            </Link>
            <Link href="/trade/BTC-USDT">
              <Button variant="primary">
                Trade Now
              </Button>
            </Link>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
