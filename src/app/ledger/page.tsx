'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  ArrowDownRight,
  History,
  Filter,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Download,
} from 'lucide-react';
import { Header, Sidebar } from '@/components/layout';
import { Card, CardHeader, Button, Badge, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { toFixedWithCommas } from '@/lib/decimal';
import { useAuthStore } from '@/stores/auth-store';
import { ledgerApi, type LedgerEntry, ApiError } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

// ============================================
// Ledger History Page
// Shows all ledger entries from backend — immutable audit trail
// ============================================

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  deposit: { label: 'Deposit', color: 'text-green-400' },
  withdrawal: { label: 'Withdrawal', color: 'text-red-400' },
  trade_buy: { label: 'Trade Buy', color: 'text-blue-400' },
  trade_sell: { label: 'Trade Sell', color: 'text-orange-400' },
  fee: { label: 'Fee', color: 'text-gray-400' },
  campaign_reward: { label: 'Reward', color: 'text-emerald-400' },
  admin_credit: { label: 'Credit', color: 'text-cyan-400' },
  admin_debit: { label: 'Debit', color: 'text-rose-400' },
  order_lock: { label: 'Order Lock', color: 'text-amber-400' },
  order_unlock: { label: 'Order Unlock', color: 'text-amber-300' },
  order_fill: { label: 'Order Fill', color: 'text-purple-400' },
};

const PAGE_SIZE = 20;

function LedgerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  const fetchEntries = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await ledgerApi.getHistory({
        category: categoryFilter || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setEntries(res.entries);
      setTotal(res.total);
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : 'Failed to load ledger history';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, page, categoryFilter]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/auth/login');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    const cat = searchParams.get('category');
    if (cat) setCategoryFilter(cat);
  }, [searchParams]);

  const exportCsv = useCallback(() => {
    if (entries.length === 0) return;
    const headers = ['Date', 'Type', 'Category', 'Asset', 'Amount', 'Balance After', 'Description'];
    const rows = entries.map((entry) => {
      const isCredit = entry.entry_type === 'credit';
      const catConfig = CATEGORY_LABELS[entry.category] || { label: entry.category };
      return [
        new Date(entry.created_at).toISOString(),
        isCredit ? 'Credit' : 'Debit',
        catConfig.label,
        entry.asset,
        `${isCredit ? '+' : '-'}${entry.amount}`,
        entry.balance_after,
        entry.description || '',
      ];
    });
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [entries]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  if (!isAuthenticated) {
    return null;
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-surface-500">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main id="main-content" className="pt-16 pb-8 px-4 lg:px-8">
        <div className="max-w-5xl mx-auto">
          {/* Page header */}
          <div className="py-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-2xl font-display font-bold text-white mb-1 flex items-center gap-2">
                <History className="w-6 h-6 text-brand-400" />
                Ledger History
              </h1>
              <p className="text-gray-400">
                Complete, immutable record of all balance changes on your account.
              </p>
            </motion.div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value); setPage(0); }}
                className="bg-surface-100 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">All Categories</option>
                <option value="deposit">Deposits</option>
                <option value="withdrawal">Withdrawals</option>
                <option value="campaign_reward">Rewards</option>
                <option value="admin_credit">Admin Credits</option>
                <option value="admin_debit">Admin Debits</option>
                <option value="fee">Fees</option>
                <option value="trade_buy">Trade Buy</option>
                <option value="trade_sell">Trade Sell</option>
              </select>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchEntries} icon={<RefreshCw className="w-3.5 h-3.5" />}>
              Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={exportCsv} disabled={entries.length === 0} icon={<Download className="w-3.5 h-3.5" />}>
              {t('common.exportCsv')}
            </Button>
            <span className="text-xs text-gray-500 ml-auto">
              {total} total entries
            </span>
          </div>

          {/* Entries table */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card padding="none">
              {error && (
                <div className="p-4 bg-red-500/10 border-b border-red-500/20 text-sm text-red-400">
                  {error}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-glass-border">
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Category</th>
                      <th className="px-4 py-3 font-medium">Asset</th>
                      <th className="px-4 py-3 font-medium text-right">Amount</th>
                      <th className="px-4 py-3 font-medium text-right">Balance After</th>
                      <th className="px-4 py-3 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-glass-border">
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 7 }).map((_, j) => (
                            <td key={j} className="px-4 py-3">
                              <Skeleton width={j === 6 ? 120 : 70} height={14} />
                            </td>
                          ))}
                        </tr>
                      ))
                    ) : entries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-gray-500 text-sm">
                          {isAuthenticated ? 'No ledger entries yet.' : 'Sign in to view your ledger history.'}
                        </td>
                      </tr>
                    ) : (
                      entries.map((entry) => {
                        const isCredit = entry.entry_type === 'credit';
                        const catConfig = CATEGORY_LABELS[entry.category] || { label: entry.category, color: 'text-gray-400' };
                        return (
                          <tr key={entry.id} className="hover:bg-white/[0.02]">
                            <td className="px-4 py-3 text-sm text-gray-400 whitespace-nowrap">
                              {new Date(entry.created_at).toLocaleString()}
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn('flex items-center gap-1 text-sm font-medium', isCredit ? 'text-green-400' : 'text-red-400')}>
                                {isCredit ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                                {isCredit ? 'Credit' : 'Debit'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="default" className={catConfig.color}>
                                {catConfig.label}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-white">
                              {entry.asset}
                            </td>
                            <td className={cn('px-4 py-3 text-right font-mono text-sm', isCredit ? 'text-green-400' : 'text-red-400')}>
                              {isCredit ? '+' : '-'}{toFixedWithCommas(parseFloat(entry.amount), 6)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm text-white">
                              {toFixedWithCommas(parseFloat(entry.balance_after), 6)}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate" title={entry.description || ''}>
                              {entry.description || '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-glass-border">
                  <span className="text-xs text-gray-500">
                    Page {page + 1} of {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage(p => p - 1)}
                      icon={<ChevronLeft className="w-4 h-4" />}
                    >
                      Prev
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage(p => p + 1)}
                      icon={<ChevronRight className="w-4 h-4" />}
                      iconPosition="right"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </motion.div>
        </div>
      </main>
    </div>
  );
}

export default function LedgerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-surface-500 flex items-center justify-center text-gray-500 text-sm">
        Loading ledger…
      </div>
    }>
      <LedgerContent />
    </Suspense>
  );
}
