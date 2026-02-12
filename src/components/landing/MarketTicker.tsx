'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useTickers } from '@/hooks';
import { formatPrice, formatPercent, cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui';

// ============================================
// Market Ticker
// Scrolling price ticker for landing page
// ============================================

export const MarketTicker: React.FC = () => {
  const tickers = useTickers();
  const isLoading = tickers.length === 0;
  
  return (
    <section className="py-8 border-y border-glass-border bg-surface-300/30 overflow-hidden">
      <div className="relative">
        {/* Gradient masks */}
        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-surface-400 to-transparent z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-surface-400 to-transparent z-10" />
        
        {/* Scrolling content */}
        <motion.div
          animate={{ x: [0, -1920] }}
          transition={{
            x: {
              repeat: Infinity,
              repeatType: 'loop',
              duration: 30,
              ease: 'linear',
            },
          }}
          className="flex gap-8"
        >
          {isLoading ? (
            // Loading skeleton
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4">
                <Skeleton width={40} height={40} variant="circular" />
                <div>
                  <Skeleton width={80} height={16} className="mb-1" />
                  <Skeleton width={60} height={14} />
                </div>
              </div>
            ))
          ) : (
            // Duplicate tickers for seamless loop
            [...tickers, ...tickers].map((ticker, index) => (
              <Link
                key={`${ticker.symbol}-${index}`}
                href={`/trade/${ticker.baseAsset}-${ticker.quoteAsset}`}
                className="flex items-center gap-4 px-4 hover:bg-white/5 rounded-lg transition-colors"
              >
                {/* Asset icon */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {ticker.baseAsset.slice(0, 2)}
                </div>
                
                {/* Info */}
                <div className="flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">
                      {ticker.baseAsset}
                    </span>
                    <span className="text-gray-500">/{ticker.quoteAsset}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white tabular-nums">
                      {formatPrice(ticker.price)}
                    </span>
                    <span
                      className={cn(
                        'flex items-center text-xs tabular-nums',
                        ticker.change24h >= 0 ? 'text-profit' : 'text-loss'
                      )}
                    >
                      {ticker.change24h >= 0 ? (
                        <ArrowUpRight className="w-3 h-3" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3" />
                      )}
                      {formatPercent(ticker.change24h)}
                    </span>
                  </div>
                </div>
              </Link>
            ))
          )}
        </motion.div>
      </div>
    </section>
  );
};

