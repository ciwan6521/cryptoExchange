'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header, Sidebar, Footer } from '@/components/layout';
import { Activity, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HealthResponse {
  status: string;
  service: string;
  env: string;
  db: string;
  redis: string;
  celery: string;
}

function StatusBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-profit text-sm">
      <CheckCircle2 className="w-4 h-4" /> Operational
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-amber-400 text-sm">
      <AlertCircle className="w-4 h-4" /> Degraded
    </span>
  );
}

export default function StatusPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/health')
      .then(async res => {
        const data = await res.json();
        setHealth(data);
        if (!res.ok) setError('Some services are degraded');
      })
      .catch(() => setError('Unable to reach API'))
      .finally(() => setLoading(false));
  }, []);

  const overallOk = health?.status === 'ok';

  return (
    <div className="min-h-screen bg-surface-500 flex flex-col">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex-1 pt-24 pb-12 px-4 max-w-2xl mx-auto w-full">
        <div className="flex items-center gap-3 mb-6">
          <Activity className="w-8 h-8 text-brand-400" />
          <div>
            <h1 className="text-2xl font-display font-bold text-white">System Status</h1>
            <p className="text-gray-500 text-sm">Crypto4Pro exchange services</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-gray-500 py-12 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            Checking services...
          </div>
        ) : (
          <>
            <div className={cn(
              'rounded-xl border p-5 mb-6',
              overallOk ? 'border-profit/30 bg-profit/5' : 'border-amber-500/30 bg-amber-500/5',
            )}>
              <div className="text-lg font-semibold text-white mb-1">
                {overallOk ? 'All systems operational' : 'Partial outage'}
              </div>
              {error && <p className="text-sm text-amber-400">{error}</p>}
            </div>

            {health && (
              <div className="rounded-xl border border-glass-border bg-surface-200 divide-y divide-glass-border">
                {[
                  { label: 'API', ok: health.status === 'ok' || health.status === 'degraded' },
                  { label: 'Database', ok: health.db === 'ok' },
                  { label: 'Redis', ok: health.redis === 'ok' },
                  { label: 'Background workers', ok: health.celery === 'ok' || health.celery === 'unknown' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between px-4 py-3">
                    <span className="text-white">{row.label}</span>
                    <StatusBadge ok={row.ok} />
                  </div>
                ))}
              </div>
            )}

            <p className="mt-6 text-sm text-gray-500">
              For account issues, email{' '}
              <a href="mailto:support@crypto4pro.io" className="text-brand-400 hover:underline">
                support@crypto4pro.io
              </a>
              {' '}or visit the{' '}
              <Link href="/help" className="text-brand-400 hover:underline">Help Center</Link>.
            </p>
          </>
        )}
      </main>
      <Footer variant="minimal" />
    </div>
  );
}
