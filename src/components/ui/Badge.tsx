'use client';

import React from 'react';
import { cn } from '@/lib/utils';

// ============================================
// Badge Component
// Status indicators and labels
// ============================================

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  success: 'bg-green-500/10 text-green-400 border-green-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  danger: 'bg-red-500/10 text-red-400 border-red-500/20',
  info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  brand: 'bg-brand-500/10 text-brand-400 border-brand-500/20',
};

const dotVariantStyles: Record<BadgeVariant, string> = {
  default: 'bg-gray-400',
  success: 'bg-green-400',
  warning: 'bg-amber-400',
  danger: 'bg-red-400',
  info: 'bg-blue-400',
  brand: 'bg-brand-400',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  size = 'sm',
  dot = false,
  children,
  className,
}) => {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-md border',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            dotVariantStyles[variant]
          )}
        />
      )}
      {children}
    </span>
  );
};

// Order status badge
interface OrderStatusBadgeProps {
  status: 'open' | 'filled' | 'partially_filled' | 'cancelled';
}

export const OrderStatusBadge: React.FC<OrderStatusBadgeProps> = ({ status }) => {
  const config: Record<string, { variant: BadgeVariant; label: string }> = {
    open: { variant: 'info', label: 'Open' },
    filled: { variant: 'success', label: 'Filled' },
    partially_filled: { variant: 'warning', label: 'Partial' },
    cancelled: { variant: 'default', label: 'Cancelled' },
  };
  
  const { variant, label } = config[status];
  
  return (
    <Badge variant={variant} dot>
      {label}
    </Badge>
  );
};

// Side badge for buy/sell
interface SideBadgeProps {
  side: 'buy' | 'sell';
}

export const SideBadge: React.FC<SideBadgeProps> = ({ side }) => {
  return (
    <Badge variant={side === 'buy' ? 'success' : 'danger'}>
      {side === 'buy' ? 'Buy' : 'Sell'}
    </Badge>
  );
};

