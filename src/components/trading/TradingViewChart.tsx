'use client';

import React, { useEffect, useId, useRef } from 'react';
import Script from 'next/script';
import { cn } from '@/lib/utils';

declare global {
  interface Window {
    TradingView?: {
      widget: (options: Record<string, unknown>) => void;
    };
  }
}

interface TradingViewChartProps {
  symbol: string;
  className?: string;
  interval?: string;
}

export const TradingViewChart: React.FC<TradingViewChartProps> = ({
  symbol,
  className,
  interval = '15',
}) => {
  const reactId = useId();
  const containerId = `tradingview_${reactId.replace(/:/g, '_')}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptReady = useRef(false);
  const widgetMounted = useRef(false);

  const mountWidget = () => {
    if (widgetMounted.current || !containerRef.current || !window.TradingView) return;
    containerRef.current.innerHTML = '';
    window.TradingView.widget({
      autosize: true,
      symbol,
      interval,
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      toolbar_bg: '#0a0a0f',
      enable_publishing: false,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      container_id: containerId,
      backgroundColor: '#0a0a0f',
      gridColor: 'rgba(255,255,255,0.06)',
    });
    widgetMounted.current = true;
  };

  useEffect(() => {
    widgetMounted.current = false;
    if (scriptReady.current) {
      mountWidget();
    }
  }, [symbol, interval]);

  return (
    <div className={cn('relative w-full h-full min-h-[400px]', className)}>
      <Script
        src="https://s3.tradingview.com/tv.js"
        strategy="lazyOnload"
        onLoad={() => {
          scriptReady.current = true;
          mountWidget();
        }}
      />
      <div id={containerId} ref={containerRef} className="absolute inset-0" />
    </div>
  );
};

/** Convert BTC-USDT or BTC/USDT to BINANCE:BTCUSDT */
export function toTradingViewSymbol(pair: string): string {
  const normalized = pair.replace('/', '-').toUpperCase();
  const [base, quote] = normalized.split('-');
  if (!base || !quote) return pair;
  return `BINANCE:${base}${quote}`;
}
