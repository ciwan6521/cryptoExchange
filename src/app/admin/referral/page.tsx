'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Gift, Loader2, AlertTriangle } from 'lucide-react';
import { adminReferralApi } from '@/lib/admin-api';

export default function AdminReferralPage() {
  const [stats, setStats] = useState<{
    total_referred_users: number;
    top_referrers: Array<{ username: string; referral_code: string; referrals: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminReferralApi.getStats();
      setStats(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load referral stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <div className="space-y-4">
      <h1 className="text-base font-semibold text-white flex items-center gap-2">
        <Gift className="w-4 h-4" />
        Referral Program
      </h1>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-gray-600 animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-12 space-y-2">
          <AlertTriangle className="w-5 h-5 text-red-400 mx-auto" />
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={fetchStats} className="text-xs underline text-gray-500">Retry</button>
        </div>
      ) : stats ? (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-lg border border-white/10 bg-white/[0.02]">
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Total Referred Users</p>
              <p className="text-2xl font-bold text-white">{stats.total_referred_users.toLocaleString()}</p>
            </div>
            <div className="p-4 rounded-lg border border-white/10 bg-white/[0.02]">
              <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">Active Referrers</p>
              <p className="text-2xl font-bold text-white">{stats.top_referrers.length.toLocaleString()}</p>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 overflow-hidden">
            <div className="px-3 py-2 border-b border-white/10 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">
              Top Referrers
            </div>
            {stats.top_referrers.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-gray-600">No referral activity yet</p>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {stats.top_referrers.map((ref) => (
                  <div key={ref.referral_code} className="px-3 py-2 flex items-center justify-between text-xs">
                    <div>
                      <p className="text-white font-medium">{ref.username}</p>
                      <p className="text-gray-600 font-mono">{ref.referral_code}</p>
                    </div>
                    <span className="text-brand-400 font-semibold">{ref.referrals} referrals</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
