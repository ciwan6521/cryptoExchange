'use client';

import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTradingStore, selectConnectionStatus, selectIsDataStale, STALE_DATA_THRESHOLD_MS } from '@/stores/trading-store';
import { motion, AnimatePresence } from 'framer-motion';
import { motion as motionTokens } from '@/lib/tokens';

// ============================================
// Connection Status Indicators
// Professional degraded-state UX for trading.
// ============================================

/**
 * Compact connection dot indicator for headers/toolbars.
 */
export const ConnectionDot: React.FC<{ className?: string }> = ({ className }) => {
  const status = useTradingStore(selectConnectionStatus);

  const dotColor = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500 animate-pulse',
    reconnecting: 'bg-yellow-500 animate-pulse',
    delayed: 'bg-amber-500',
    disconnected: 'bg-red-500',
  }[status];

  const label = {
    connected: 'Connected',
    connecting: 'Connecting...',
    reconnecting: 'Reconnecting...',
    delayed: 'Data delayed',
    disconnected: 'Disconnected',
  }[status];

  return (
    <div className={cn('flex items-center gap-1.5', className)} title={label}>
      <span className={cn('w-2 h-2 rounded-full', dotColor)} />
      <span className="text-xs text-gray-500 hidden sm:inline">{label}</span>
    </div>
  );
};

/**
 * Banner that appears when connection is degraded.
 * Shows above trading panels.
 */
export const ConnectionBanner: React.FC = () => {
  const status = useTradingStore(selectConnectionStatus);
  const isStale = useIsDataStale();
  const reconnectAttempt = useTradingStore((s) => s.reconnectAttempt);

  const showBanner = status !== 'connected' || isStale;

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: motionTokens.duration.normal }}
          className="overflow-hidden"
        >
          <div
            className={cn(
              'flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium',
              status === 'reconnecting' && 'bg-yellow-500/10 text-yellow-400 border-b border-yellow-500/20',
              status === 'connecting' && 'bg-yellow-500/10 text-yellow-400 border-b border-yellow-500/20',
              status === 'disconnected' && 'bg-red-500/10 text-red-400 border-b border-red-500/20',
              isStale && status === 'connected' && 'bg-amber-500/10 text-amber-400 border-b border-amber-500/20'
            )}
          >
            {status === 'reconnecting' && (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Reconnecting... (attempt {reconnectAttempt})
              </>
            )}
            {status === 'connecting' && (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Connecting to market data...
              </>
            )}
            {status === 'disconnected' && (
              <>
                <WifiOff className="w-3 h-3" />
                Connection lost. Trading actions disabled.
              </>
            )}
            {isStale && status === 'connected' && (
              <>
                <AlertTriangle className="w-3 h-3" />
                Market data may be delayed
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/**
 * "Market data delayed" badge for individual panels.
 */
export const DataDelayedBadge: React.FC<{ className?: string }> = ({ className }) => {
  const isStale = useIsDataStale();
  const status = useTradingStore(selectConnectionStatus);

  if (status === 'connected' && !isStale) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium',
        status !== 'connected'
          ? 'bg-red-500/10 text-red-400 border border-red-500/20'
          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
        className
      )}
    >
      <AlertTriangle className="w-2.5 h-2.5" />
      {status !== 'connected' ? 'Offline' : 'Delayed'}
    </span>
  );
};

/**
 * Hook: returns true when data is stale.
 * Polls every second to check timestamp freshness.
 */
function useIsDataStale(): boolean {
  const lastTimestamp = useTradingStore((s) => s.lastDataTimestamp);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const check = () => {
      if (lastTimestamp === 0) {
        setStale(false);
        return;
      }
      setStale(Date.now() - lastTimestamp > STALE_DATA_THRESHOLD_MS);
    };
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, [lastTimestamp]);

  return stale;
}

/**
 * Hook: returns whether trading actions should be disabled
 * due to connection/data integrity issues.
 */
export function useTradingDisabled(): boolean {
  const status = useTradingStore(selectConnectionStatus);
  const isStale = useIsDataStale();
  return status === 'disconnected' || status === 'reconnecting' || isStale;
}
