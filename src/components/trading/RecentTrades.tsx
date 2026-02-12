'use client';

import React, { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, formatPrice, formatNumber, formatTime } from '@/lib/utils';
import { useTrades } from '@/hooks';
import type { Trade } from '@/types';
import { Skeleton } from '@/components/ui';
import { DataDelayedBadge } from './ConnectionStatus';
import { DataGuard } from './DataGuard';

// ============================================
// Recent Trades Component
// Real-time trade feed with animations
// ============================================

interface RecentTradesProps {
  symbol: string;
}

// Memoized trade row for performance
const TradeRow = memo(function TradeRow({
  trade,
  isNew,
}: {
  trade: Trade;
  isNew: boolean;
}) {
  return (
    <motion.div
      initial={isNew ? { opacity: 0, x: -10 } : false}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        'grid grid-cols-3 gap-2 px-3 py-1 text-xs font-mono',
        'hover:bg-white/5 transition-colors'
      )}
    >
      <span className={cn(
        trade.side === 'buy' ? 'text-profit' : 'text-loss'
      )}>
        {formatPrice(trade.price)}
      </span>
      <span className="text-right text-gray-300">
        {formatNumber(trade.quantity, { decimals: 4 })}
      </span>
      <span className="text-right text-gray-500">
        {formatTime(trade.timestamp)}
      </span>
    </motion.div>
  );
});

export const RecentTrades: React.FC<RecentTradesProps> = ({ symbol }) => {
  const trades = useTrades(symbol);
  const isLoading = trades.length === 0;
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-glass-border flex items-center gap-2">
        <h3 className="text-sm font-medium text-white">Recent Trades</h3>
        <DataDelayedBadge />
      </div>
      
      {/* Column headers */}
      <div className="grid grid-cols-3 gap-2 px-3 py-1.5 text-xs text-gray-500 border-b border-glass-border">
        <span>Price</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Time</span>
      </div>
      
      {/* Trades list */}
      <div className="flex-1 overflow-auto scrollbar-hide">
        <DataGuard
          hasData={!isLoading}
          label="Recent Trades"
          skeletonRows={15}
          className="h-full"
        >
          <AnimatePresence initial={false}>
            {trades.slice(0, 30).map((trade, index) => (
              <TradeRow
                key={trade.id}
                trade={trade}
                isNew={index === 0}
              />
            ))}
          </AnimatePresence>
        </DataGuard>
      </div>
    </div>
  );
};

