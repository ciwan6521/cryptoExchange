'use client';

import React, { useRef, useMemo, memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, formatPrice, formatNumber } from '@/lib/utils';
import { useOrderbook, usePrevious } from '@/hooks';
import type { OrderbookLevel } from '@/types';
import { SkeletonOrderbook } from '@/components/ui';
import { DataDelayedBadge } from './ConnectionStatus';
import { DataGuard } from './DataGuard';

// ============================================
// Orderbook Component
// Real-time orderbook with virtualized list
// Optimized for 50-60 FPS performance
// ============================================

interface OrderbookProps {
  symbol: string;
  onPriceClick?: (price: number) => void;
  onQuantityClick?: (quantity: number) => void;
}

// Memoized row component for performance
const OrderbookRow = memo(function OrderbookRow({
  level,
  type,
  maxTotal,
  isNew,
  onPriceClick,
  onQuantityClick,
}: {
  level: OrderbookLevel;
  type: 'bid' | 'ask';
  maxTotal: number;
  isNew: boolean;
  onPriceClick?: (price: number) => void;
  onQuantityClick?: (quantity: number) => void;
}) {
  const depthPercentage = (level.total / maxTotal) * 100;
  
  return (
    <div
      className={cn(
        'relative grid grid-cols-3 gap-2 px-3 py-1 text-xs font-mono',
        'hover:bg-white/5 cursor-pointer transition-colors',
        isNew && (type === 'bid' ? 'orderbook-flash-bid' : 'orderbook-flash-ask')
      )}
      onClick={() => onPriceClick?.(level.price)}
    >
      {/* Depth visualization */}
      <div
        className={cn(
          'absolute inset-y-0 right-0 opacity-20 transition-all duration-300',
          type === 'bid' ? 'bg-green-500' : 'bg-red-500'
        )}
        style={{ width: `${Math.min(depthPercentage, 100)}%` }}
      />
      
      {/* Price */}
      <span
        className={cn(
          'relative z-10',
          type === 'bid' ? 'text-profit' : 'text-loss'
        )}
      >
        {formatPrice(level.price)}
      </span>
      
      {/* Quantity */}
      <span
        className="relative z-10 text-right text-gray-300 cursor-pointer hover:text-white"
        onClick={(e) => {
          e.stopPropagation();
          onQuantityClick?.(level.quantity);
        }}
      >
        {formatNumber(level.quantity, { decimals: 4 })}
      </span>
      
      {/* Total */}
      <span className="relative z-10 text-right text-gray-500">
        {formatNumber(level.total, { decimals: 4 })}
      </span>
    </div>
  );
});

export const Orderbook: React.FC<OrderbookProps> = ({
  symbol,
  onPriceClick,
  onQuantityClick,
}) => {
  const orderbook = useOrderbook(symbol);
  const previousOrderbook = usePrevious(orderbook);
  const parentRef = useRef<HTMLDivElement>(null);
  
  // Track new/updated levels for flash animation
  const newLevels = useMemo(() => {
    if (!orderbook || !previousOrderbook) return new Set<string>();
    
    const newSet = new Set<string>();
    
    orderbook.asks.forEach((level, i) => {
      const prevLevel = previousOrderbook.asks[i];
      if (!prevLevel || prevLevel.quantity !== level.quantity) {
        newSet.add(`ask-${i}`);
      }
    });
    
    orderbook.bids.forEach((level, i) => {
      const prevLevel = previousOrderbook.bids[i];
      if (!prevLevel || prevLevel.quantity !== level.quantity) {
        newSet.add(`bid-${i}`);
      }
    });
    
    return newSet;
  }, [orderbook, previousOrderbook]);
  
  // Calculate max total for depth visualization
  const maxTotal = useMemo(() => {
    if (!orderbook) return 1;
    const askMax = orderbook.asks[orderbook.asks.length - 1]?.total || 0;
    const bidMax = orderbook.bids[orderbook.bids.length - 1]?.total || 0;
    return Math.max(askMax, bidMax);
  }, [orderbook]);
  
  // Virtual list for asks
  const askVirtualizer = useVirtualizer({
    count: orderbook?.asks.length || 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 5,
  });
  
  if (!orderbook) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-3 py-2 border-b border-glass-border">
          <h3 className="text-sm font-medium text-white">Order Book</h3>
        </div>
        <DataGuard
          hasData={false}
          label="Order Book"
          skeleton={<div className="p-3"><SkeletonOrderbook rows={10} /></div>}
          className="flex-1"
        >
          {null}
        </DataGuard>
      </div>
    );
  }

  const isEmpty = orderbook.asks.length === 0 && orderbook.bids.length === 0;
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-glass-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-white">Order Book</h3>
          <DataDelayedBadge />
        </div>
        {!isEmpty && (
          <span className="text-xs text-gray-500">
            Spread: {formatPrice(orderbook.spread)} ({orderbook.spreadPercentage.toFixed(3)}%)
          </span>
        )}
      </div>

      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <p className="text-sm text-gray-500">
            No open orders in the book yet. Place a limit order to add liquidity.
          </p>
        </div>
      ) : (
        <>
      {/* Column headers */}
      <div className="grid grid-cols-3 gap-2 px-3 py-1.5 text-xs text-gray-500 border-b border-glass-border">
        <span>Price</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Total</span>
      </div>
      
      {/* Asks (sells) - reversed to show lowest at bottom */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto scrollbar-hide flex flex-col-reverse">
          {orderbook.asks.slice().reverse().slice(0, 12).map((level, index) => (
            <OrderbookRow
              key={`ask-${index}`}
              level={level}
              type="ask"
              maxTotal={maxTotal}
              isNew={newLevels.has(`ask-${orderbook.asks.length - 1 - index}`)}
              onPriceClick={onPriceClick}
              onQuantityClick={onQuantityClick}
            />
          ))}
        </div>
        
        {/* Spread indicator */}
        <div className="px-3 py-2 border-y border-glass-border bg-surface-200/50">
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-white tabular-nums">
              {formatPrice(orderbook.asks[0]?.price || 0)}
            </span>
            <span className={cn(
              'text-xs',
              orderbook.asks[0]?.price > (previousOrderbook?.asks[0]?.price || 0)
                ? 'text-profit'
                : 'text-loss'
            )}>
              {orderbook.asks[0]?.price > (previousOrderbook?.asks[0]?.price || 0) ? '▲' : '▼'}
            </span>
          </div>
        </div>
        
        {/* Bids (buys) */}
        <div className="flex-1 overflow-auto scrollbar-hide">
          {orderbook.bids.slice(0, 12).map((level, index) => (
            <OrderbookRow
              key={`bid-${index}`}
              level={level}
              type="bid"
              maxTotal={maxTotal}
              isNew={newLevels.has(`bid-${index}`)}
              onPriceClick={onPriceClick}
              onQuantityClick={onQuantityClick}
            />
          ))}
        </div>
      </div>
        </>
      )}
    </div>
  );
};

