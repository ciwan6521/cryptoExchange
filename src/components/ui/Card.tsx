'use client';

import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

// ============================================
// Card Component
// Glass-morphism container with hover effects
// ============================================

interface CardProps extends HTMLMotionProps<'div'> {
  variant?: 'default' | 'glass' | 'solid';
  hover?: boolean;
  glow?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const variantStyles = {
  default: 'bg-surface-100 border border-glass-border',
  glass: 'glass',
  solid: 'bg-surface-200 border border-surface-50',
};

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  hover = false,
  glow = false,
  padding = 'md',
  className,
  children,
  ...props
}) => {
  return (
    <motion.div
      className={cn(
        'rounded-xl',
        variantStyles[variant],
        paddingStyles[padding],
        hover && 'cursor-pointer transition-all duration-200 hover:border-glass-hover',
        glow && 'hover:shadow-glow-brand',
        className
      )}
      whileHover={hover ? { y: -2 } : undefined}
      transition={{ duration: 0.2 }}
      {...props}
    >
      {children}
    </motion.div>
  );
};

// Card Header
interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  subtitle,
  action,
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        'flex items-center justify-between mb-4',
        className
      )}
      {...props}
    >
      <div>
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {subtitle && (
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
};

// Stat Card for dashboard metrics
interface StatCardProps {
  label: string;
  value: string | number;
  change?: number;
  icon?: React.ReactNode;
  loading?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  change,
  icon,
  loading = false,
}) => {
  if (loading) {
    return (
      <Card>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="skeleton h-4 w-20 rounded mb-3" />
            <div className="skeleton h-8 w-32 rounded" />
          </div>
          {icon && (
            <div className="skeleton h-10 w-10 rounded-lg" />
          )}
        </div>
      </Card>
    );
  }
  
  return (
    <Card hover>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-400 mb-1">{label}</p>
          <p className="text-2xl font-semibold text-white tabular-nums">
            {value}
          </p>
          {change !== undefined && (
            <p
              className={cn(
                'text-sm mt-1 tabular-nums',
                change >= 0 ? 'text-profit' : 'text-loss'
              )}
            >
              {change >= 0 ? '+' : ''}{change.toFixed(2)}%
            </p>
          )}
        </div>
        {icon && (
          <div className="p-2.5 rounded-lg bg-brand-500/10 text-brand-400">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
};

// Market Card for trading pairs
interface MarketCardProps {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  price: string;
  change: number;
  volume: string;
  onClick?: () => void;
  loading?: boolean;
}

export const MarketCard: React.FC<MarketCardProps> = ({
  symbol,
  baseAsset,
  quoteAsset,
  price,
  change,
  volume,
  onClick,
  loading = false,
}) => {
  if (loading) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <div className="skeleton h-10 w-10 rounded-full" />
          <div className="flex-1">
            <div className="skeleton h-4 w-24 rounded mb-2" />
            <div className="skeleton h-3 w-16 rounded" />
          </div>
          <div className="text-right">
            <div className="skeleton h-5 w-20 rounded mb-2" />
            <div className="skeleton h-3 w-12 rounded ml-auto" />
          </div>
        </div>
      </Card>
    );
  }
  
  return (
    <Card hover onClick={onClick} className="cursor-pointer">
      <div className="flex items-center gap-3">
        {/* Asset icon placeholder */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm">
          {baseAsset.slice(0, 2)}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white">{baseAsset}</span>
            <span className="text-gray-500">/{quoteAsset}</span>
          </div>
          <p className="text-xs text-gray-500">Vol: {volume}</p>
        </div>
        
        <div className="text-right">
          <p className="font-medium text-white tabular-nums">{price}</p>
          <p
            className={cn(
              'text-sm tabular-nums',
              change >= 0 ? 'text-profit' : 'text-loss'
            )}
          >
            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
          </p>
        </div>
      </div>
    </Card>
  );
};

