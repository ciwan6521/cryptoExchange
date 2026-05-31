'use client';

import React from 'react';
import Link from 'next/link';
import { Header, Sidebar, Footer } from '@/components/layout';
import { HelpCircle, Mail, FileText, Shield } from 'lucide-react';

export default function HelpPage() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const links = [
    { title: 'Trading Guide', desc: 'Spot trading, order types, and fees', href: '/fees', icon: FileText },
    { title: 'Futures / Leverage', desc: 'USDT-margined positions up to 100x', href: '/futures', icon: HelpCircle },
    { title: 'Staking (Earn)', desc: 'Lock coins for configured reward periods', href: '/earn', icon: Shield },
    { title: 'KYC Verification', desc: 'Required for trading, staking, and withdrawals', href: '/kyc', icon: Shield },
    { title: 'Contact Support', desc: 'support@crypto4pro.io', href: 'mailto:support@crypto4pro.io', icon: Mail },
  ];

  return (
    <div className="min-h-screen bg-surface-500 flex flex-col">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex-1 pt-24 pb-12 px-4 max-w-3xl mx-auto w-full">
        <h1 className="text-2xl font-display font-bold text-white mb-2">Help Center</h1>
        <p className="text-gray-400 mb-8">Quick links for common topics.</p>
        <div className="space-y-3">
          {links.map(item => (
            <Link
              key={item.title}
              href={item.href}
              className="flex items-start gap-4 p-4 rounded-xl border border-glass-border bg-surface-200 hover:border-glass-hover transition-colors"
            >
              <item.icon className="w-5 h-5 text-brand-400 mt-0.5" />
              <div>
                <div className="font-medium text-white">{item.title}</div>
                <div className="text-sm text-gray-500">{item.desc}</div>
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-8 text-sm text-gray-500">
          See also{' '}
          <Link href="/legal/terms" className="text-brand-400 hover:underline">Terms of Service</Link>
          {' '}and{' '}
          <Link href="/legal/privacy" className="text-brand-400 hover:underline">Privacy Policy</Link>.
        </div>
      </main>
      <Footer variant="minimal" />
    </div>
  );
}
