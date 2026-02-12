'use client';

import React from 'react';
import { cn } from '@/lib/utils';

// ============================================
// Skeleton Component
// Loading placeholder with shimmer effect
// Professional alternative to spinners
// ============================================

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  animate?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  variant = 'rectangular',
  width,
  height,
  animate = true,
}) => {
  const variantStyles = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  };
  
  return (
    <div
      className={cn(
        'bg-surface-50',
        animate && 'skeleton',
        variantStyles[variant],
        className
      )}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  );
};

// Pre-built skeleton layouts
export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({
  lines = 3,
  className,
}) => {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          height={16}
          className={i === lines - 1 ? 'w-3/4' : 'w-full'}
        />
      ))}
    </div>
  );
};

export const SkeletonCard: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn('p-4 rounded-xl bg-surface-100 border border-glass-border', className)}>
      <div className="flex items-center gap-3 mb-4">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="flex-1">
          <Skeleton variant="text" height={16} className="w-24 mb-2" />
          <Skeleton variant="text" height={12} className="w-16" />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  );
};

export const SkeletonTable: React.FC<{
  rows?: number;
  columns?: number;
  className?: string;
}> = ({ rows = 5, columns = 4, className }) => {
  return (
    <div className={cn('space-y-2', className)}>
      {/* Header */}
      <div className="flex gap-4 pb-2 border-b border-glass-border">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton
            key={i}
            variant="text"
            height={14}
            className="flex-1"
          />
        ))}
      </div>
      
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 py-2">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              variant="text"
              height={16}
              className="flex-1"
            />
          ))}
        </div>
      ))}
    </div>
  );
};

// Orderbook skeleton
export const SkeletonOrderbook: React.FC<{ rows?: number }> = ({ rows = 10 }) => {
  return (
    <div className="space-y-1">
      {/* Asks */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={`ask-${i}`} className="flex gap-2">
          <Skeleton variant="text" height={20} className="flex-1" />
          <Skeleton variant="text" height={20} className="flex-1" />
          <Skeleton variant="text" height={20} className="flex-1" />
        </div>
      ))}
      
      {/* Spread */}
      <div className="py-2 my-2 border-y border-glass-border">
        <Skeleton variant="text" height={24} className="w-32 mx-auto" />
      </div>
      
      {/* Bids */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={`bid-${i}`} className="flex gap-2">
          <Skeleton variant="text" height={20} className="flex-1" />
          <Skeleton variant="text" height={20} className="flex-1" />
          <Skeleton variant="text" height={20} className="flex-1" />
        </div>
      ))}
    </div>
  );
};

// Chart skeleton
export const SkeletonChart: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn('relative', className)}>
      {/* Chart area */}
      <div className="aspect-[16/9] bg-surface-100 rounded-xl border border-glass-border overflow-hidden">
        {/* Y-axis labels */}
        <div className="absolute right-4 top-4 bottom-4 w-16 flex flex-col justify-between">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="text" height={12} className="w-full" />
          ))}
        </div>
        
        {/* Fake candlesticks */}
        <div className="absolute left-4 right-24 top-8 bottom-8 flex items-end gap-1">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 bg-surface-50/50 rounded-sm"
              style={{ height: `${20 + Math.random() * 60}%` }}
            />
          ))}
        </div>
        
        {/* X-axis */}
        <div className="absolute left-4 right-4 bottom-4 flex justify-between">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="text" width={40} height={10} />
          ))}
        </div>
      </div>
    </div>
  );
};

