'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';

// ============================================
// DataGuard
// Wraps trading panels with a loading/timeout/fallback strategy.
// - Shows children when data is present
// - Shows skeleton while loading
// - Shows timeout fallback if data never arrives
// ============================================

interface DataGuardProps {
  /** Is data loaded? */
  hasData: boolean;
  /** Timeout in ms before showing the fallback (default 8s) */
  timeoutMs?: number;
  /** Label for the panel (shown in fallback) */
  label?: string;
  /** Skeleton to show while loading */
  skeleton?: React.ReactNode;
  /** Number of skeleton rows (used if no custom skeleton) */
  skeletonRows?: number;
  /** Retry callback */
  onRetry?: () => void;
  children: React.ReactNode;
  className?: string;
}

export const DataGuard: React.FC<DataGuardProps> = ({
  hasData,
  timeoutMs = 8000,
  label = 'Data',
  skeleton,
  skeletonRows = 6,
  onRetry,
  children,
  className,
}) => {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (hasData) {
      setTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      setTimedOut(true);
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [hasData, timeoutMs]);

  // Data is present — render children
  if (hasData) return <>{children}</>;

  // Timed out — show fallback
  if (timedOut) {
    return (
      <div className={cn('flex flex-col items-center justify-center p-6 text-center h-full', className)}>
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center mb-3">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
        </div>
        <p className="text-sm font-medium text-white mb-1">{label} unavailable</p>
        <p className="text-xs text-gray-500 mb-3 max-w-[200px]">
          Could not load data. Check your connection and try again.
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 bg-surface-100 border border-glass-border rounded-lg hover:bg-surface-50 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        )}
      </div>
    );
  }

  // Still loading — show skeleton
  if (skeleton) return <>{skeleton}</>;

  return (
    <div className={cn('p-3 space-y-2', className)}>
      {Array.from({ length: skeletonRows }).map((_, i) => (
        <div key={i} className="flex gap-2">
          <Skeleton height={16} className="flex-1" />
          <Skeleton height={16} className="flex-1" />
          <Skeleton height={16} className="flex-1" />
        </div>
      ))}
    </div>
  );
};
