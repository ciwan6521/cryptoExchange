'use client';

import React from 'react';
import Link from 'next/link';
import { Header, Sidebar, Footer } from '@/components/layout';
import { HelpCircle, Mail, FileText, Shield } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export default function HelpPage() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const { t } = useI18n();

  const links = [
    { title: t('help.tradingGuide'), desc: t('help.tradingGuideDesc'), href: '/fees', icon: FileText },
    { title: t('help.futures'), desc: t('help.futuresDesc'), href: '/futures', icon: HelpCircle },
    { title: t('help.ico'), desc: t('help.icoDesc'), href: '/ico/t4pro', icon: HelpCircle },
    { title: t('help.staking'), desc: t('help.stakingDesc'), href: '/earn', icon: Shield },
    { title: t('help.kyc'), desc: t('help.kycDesc'), href: '/kyc', icon: Shield },
    { title: t('help.support'), desc: t('help.supportDesc'), href: 'mailto:support@crypto4pro.io', icon: Mail },
  ];

  return (
    <div className="min-h-screen bg-surface-500 flex flex-col">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex-1 pt-24 pb-12 px-4 max-w-3xl mx-auto w-full">
        <h1 className="text-2xl font-display font-bold text-white mb-2">{t('help.title')}</h1>
        <p className="text-gray-400 mb-8">{t('help.subtitle')}</p>
        <div className="space-y-3">
          {links.map(item => (
            <Link
              key={item.href}
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
          {t('help.seeAlso')}{' '}
          <Link href="/legal/terms" className="text-brand-400 hover:underline">{t('help.terms')}</Link>
          {' '}and{' '}
          <Link href="/legal/privacy" className="text-brand-400 hover:underline">{t('help.privacy')}</Link>.
        </div>
      </main>
      <Footer variant="minimal" />
    </div>
  );
}
