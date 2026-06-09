'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Gift,
  UserPlus,
  ArrowUpRight,
  Repeat,
  Percent,
  Zap,
  Users,
  CheckCircle2,
  Clock,
  Tag,
  RefreshCw,
} from 'lucide-react';
import { Header, Sidebar } from '@/components/layout';
import { Button, Card, Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { campaignApi, referralHistoryApi, type CampaignItem, type CampaignClaimItem, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

// ============================================
// Rewards Page — fetches active campaigns from real backend
// ============================================

type CampaignType = 'signup_bonus' | 'deposit_bonus' | 'trading_cashback' | 'referral_bonus' | 'fee_discount' | 'volume_reward';

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  signup_bonus: { label: 'Signup Bonus', icon: UserPlus, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  deposit_bonus: { label: 'Deposit Bonus', icon: ArrowUpRight, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  trading_cashback: { label: 'Trading Cashback', icon: Repeat, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  referral_bonus: { label: 'Referral Bonus', icon: Gift, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  fee_discount: { label: 'Fee Discount', icon: Percent, color: 'text-green-400', bg: 'bg-green-500/10' },
  volume_reward: { label: 'Volume Reward', icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/10' },
};

const SEGMENT_LABELS: Record<string, string> = {
  all: 'All Users',
  new_users: 'New Users',
  verified: 'Verified Users',
  vip: 'VIP Members',
  inactive: 'Returning Users',
};

function CampaignCard({ campaign, claims, index }: { campaign: CampaignItem; claims: CampaignClaimItem[]; index: number }) {
  const config = TYPE_CONFIG[campaign.campaign_type] || { label: campaign.campaign_type, icon: Gift, color: 'text-gray-400', bg: 'bg-gray-500/10' };
  const Icon = config.icon;
  const endDate = new Date(campaign.end_date);
  const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const totalBudget = parseFloat(campaign.total_budget || '0');
  const spentBudget = parseFloat(campaign.spent_budget || '0');
  const budgetUsed = totalBudget > 0 ? Math.min(100, (spentBudget / totalBudget) * 100) : 0;
  const budgetRemaining = 100 - budgetUsed;

  // Check if current user has claimed this campaign
  const userClaim = claims.find(c => c.campaign_id === campaign.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.05 }}
    >
      <Card className="relative overflow-hidden hover:border-white/[0.12] transition-colors">
        <div className={cn('absolute top-0 left-0 w-full h-0.5', config.bg.replace('/10', '/40'))} />

        {userClaim && (
          <div className="absolute top-3 right-3">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium text-green-400 bg-green-500/10 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Claimed
            </span>
          </div>
        )}

        <div className="flex items-start gap-3">
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', config.bg)}>
            <Icon className={cn('w-5 h-5', config.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="text-sm font-semibold text-white">{campaign.name}</h3>
              <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium', config.bg, config.color)}>
                {config.label}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-3 line-clamp-2">{campaign.description || 'Participate to earn rewards!'}</p>

            {/* Reward highlight */}
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 mb-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-600 uppercase tracking-wider">Reward</span>
                <span className="text-sm font-bold text-white">
                  {campaign.percent_based
                    ? `${campaign.reward_amount}% Cashback`
                    : `${campaign.reward_amount} ${campaign.reward_asset}`}
                </span>
              </div>
              {parseFloat(campaign.max_per_user) > 0 && (
                <p className="text-[10px] text-gray-600 mt-1">
                  Max per user: {campaign.max_per_user} {campaign.reward_asset}
                </p>
              )}
              {parseFloat(campaign.min_requirement) > 0 && (
                <p className="text-[10px] text-gray-600">
                  Min requirement: {campaign.min_requirement} {campaign.reward_asset}
                </p>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] text-gray-600 mb-0.5">
                  <Clock className="w-2.5 h-2.5" /> Ends in
                </div>
                <p className="text-xs font-medium text-white">{daysLeft} days</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] text-gray-600 mb-0.5">
                  <Users className="w-2.5 h-2.5" /> Participants
                </div>
                <p className="text-xs font-medium text-white">{campaign.participant_count.toLocaleString()}</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] text-gray-600 mb-0.5">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Claimed
                </div>
                <p className="text-xs font-medium text-white">{campaign.claimed_count.toLocaleString()}</p>
              </div>
            </div>

            {/* Budget progress */}
            {totalBudget > 0 && (
              <div className="mb-3">
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-gray-600">Budget remaining</span>
                  <span className="text-gray-400">{budgetRemaining.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', budgetRemaining > 20 ? 'bg-green-500/60' : 'bg-amber-500/60')}
                    style={{ width: `${budgetRemaining}%` }} />
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-600">
                  For: {SEGMENT_LABELS[campaign.target_segment] || campaign.target_segment}
                </span>
                {campaign.auto_apply && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium text-blue-400 bg-blue-500/10">Auto-applied</span>
                )}
                {campaign.one_time_only && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium text-gray-500 bg-white/[0.03]">One-time</span>
                )}
              </div>
              {campaign.applicable_pairs && campaign.applicable_pairs.length > 0 && (
                <div className="flex gap-1">
                  {campaign.applicable_pairs.slice(0, 3).map((p) => (
                    <span key={p} className="px-1.5 py-0.5 rounded text-[9px] font-medium text-gray-500 bg-white/[0.03]">{p}</span>
                  ))}
                  {campaign.applicable_pairs.length > 3 && (
                    <span className="text-[9px] text-gray-600">+{campaign.applicable_pairs.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export default function RewardsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [claims, setClaims] = useState<CampaignClaimItem[]>([]);
  const [referrals, setReferrals] = useState<Array<{
    user_id: string;
    username: string;
    email: string;
    kyc_status: string;
    joined_at: string | null;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const campaignRes = await campaignApi.getActive();
      setCampaigns(campaignRes.campaigns);

      // Fetch user claims if authenticated
      if (isAuthenticated) {
        try {
          const [claimRes, referralRes] = await Promise.all([
            campaignApi.getMyClaims(),
            referralHistoryApi.getHistory(),
          ]);
          setClaims(claimRes.claims);
          setReferrals(referralRes.referrals || []);
        } catch {
          // Claims/referrals are optional — don't fail the page
        }
      } else {
        setReferrals([]);
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.detail : 'Failed to load campaigns';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="min-h-screen bg-surface-500">
      <Header onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main id="main-content" className="pt-16 pb-8 px-4 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="py-6">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                  <Gift className="w-5 h-5 text-brand-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-display font-bold text-white">Rewards & Promotions</h1>
                  <p className="text-gray-400 text-sm">Earn rewards through trading, referrals, and special promotions.</p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 flex items-center justify-between">
              <span>{error}</span>
              <Button variant="ghost" size="sm" onClick={fetchData} icon={<RefreshCw className="w-3.5 h-3.5" />}>
                Retry
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="grid md:grid-cols-2 gap-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <Card key={i}>
                  <div className="flex items-start gap-3">
                    <Skeleton variant="rectangular" width={40} height={40} className="rounded-xl" />
                    <div className="flex-1">
                      <Skeleton width={150} height={16} className="mb-2" />
                      <Skeleton width="100%" height={12} className="mb-1" />
                      <Skeleton width="80%" height={12} className="mb-4" />
                      <Skeleton width="100%" height={60} className="rounded-lg mb-3" />
                      <div className="grid grid-cols-3 gap-2">
                        <Skeleton width="100%" height={30} />
                        <Skeleton width="100%" height={30} />
                        <Skeleton width="100%" height={30} />
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                <Tag className="w-8 h-8 text-gray-700" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">No Active Promotions</h2>
              <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">
                There are no active campaigns right now. Check back soon for exciting rewards and promotions!
              </p>
              <div className="flex items-center justify-center gap-3">
                <Link href="/dashboard">
                  <Button variant="secondary">Dashboard</Button>
                </Link>
                <Link href="/trade/BTC-USDT">
                  <Button variant="primary">Trade Now</Button>
                </Link>
              </div>
            </motion.div>
          ) : (
            <>
              {/* Active count */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
                className="mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-gray-500">{campaigns.length} active promotion{campaigns.length > 1 ? 's' : ''}</span>
              </motion.div>

              {/* Campaign grid */}
              <div className="grid md:grid-cols-2 gap-4">
                {campaigns.map((campaign, i) => (
                  <CampaignCard key={campaign.id} campaign={campaign} claims={claims} index={i} />
                ))}
              </div>

              {isAuthenticated && referrals.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mt-8"
                >
                  <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-brand-400" />
                    Your Referrals ({referrals.length})
                  </h2>
                  <Card padding="none">
                    <div className="divide-y divide-glass-border">
                      {referrals.map((ref) => (
                        <div key={ref.user_id} className="px-4 py-3 flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-white">{ref.username}</p>
                            <p className="text-xs text-gray-500">{ref.email}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-400 capitalize">{ref.kyc_status}</p>
                            <p className="text-[10px] text-gray-600">
                              {ref.joined_at ? new Date(ref.joined_at).toLocaleDateString() : '—'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </motion.div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
