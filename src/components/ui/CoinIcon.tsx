'use client';

import React, { useState, memo } from 'react';
import { cn } from '@/lib/utils';

const ICON_CDNS = [
  (s: string) => `https://assets.coincap.io/assets/icons/${s.toLowerCase()}@2x.png`,
  (s: string) => `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons/128/color/${s.toLowerCase()}.png`,
];

const COIN_GRADIENTS: Record<string, string> = {
  BTC: 'from-orange-400 to-amber-600',
  ETH: 'from-blue-400 to-indigo-600',
  BNB: 'from-yellow-400 to-yellow-600',
  SOL: 'from-purple-400 to-violet-600',
  XRP: 'from-gray-300 to-gray-500',
  ADA: 'from-blue-300 to-blue-500',
  DOGE: 'from-amber-300 to-amber-500',
  DOT: 'from-pink-400 to-pink-600',
  AVAX: 'from-red-400 to-red-600',
  LINK: 'from-blue-500 to-blue-700',
  MATIC: 'from-purple-500 to-purple-700',
  UNI: 'from-pink-400 to-rose-600',
  ATOM: 'from-indigo-400 to-indigo-600',
  LTC: 'from-gray-400 to-gray-600',
  TRX: 'from-red-500 to-red-700',
  NEAR: 'from-emerald-400 to-emerald-600',
  APT: 'from-teal-400 to-teal-600',
  FIL: 'from-cyan-400 to-cyan-600',
  USDT: 'from-emerald-400 to-emerald-600',
  USDC: 'from-blue-400 to-blue-600',
};

interface CoinIconProps {
  symbol: string;
  size?: number;
  className?: string;
}

export const CoinIcon = memo(function CoinIcon({ symbol, size = 32, className }: CoinIconProps) {
  const [cdnIndex, setCdnIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  const handleError = () => {
    if (cdnIndex < ICON_CDNS.length - 1) {
      setCdnIndex((prev) => prev + 1);
    } else {
      setFailed(true);
    }
  };

  const gradient = COIN_GRADIENTS[symbol] || 'from-brand-400 to-brand-600';

  if (failed) {
    return (
      <div
        className={cn(
          'rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold flex-shrink-0',
          gradient,
          className,
        )}
        style={{ width: size, height: size, fontSize: size * 0.35 }}
      >
        {symbol.slice(0, 2)}
      </div>
    );
  }

  return (
    <img
      src={ICON_CDNS[cdnIndex](symbol)}
      alt={symbol}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={handleError}
      className={cn('rounded-full flex-shrink-0 object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
});
