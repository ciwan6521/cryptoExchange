'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';

interface KycBannerProps {
  action?: string;
  className?: string;
}

export const KycBanner: React.FC<KycBannerProps> = ({
  action = 'trade',
  className,
}) => {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated || !user || user.kycStatus === 'approved') {
    return null;
  }

  const isPending = user.kycStatus === 'pending';

  return (
    <div
      className={cn(
        'px-4 py-3 border-b text-sm flex items-center justify-center gap-2',
        isPending
          ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
          : 'bg-brand-500/10 border-brand-500/20 text-brand-300',
        className,
      )}
    >
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>
        {isPending
          ? `KYC verification is pending. You cannot ${action} until approved.`
          : `Complete identity verification to ${action}.`}
      </span>
      {!isPending && (
        <Link href="/kyc" className="underline font-medium hover:text-white ml-1">
          Verify now
        </Link>
      )}
    </div>
  );
};
