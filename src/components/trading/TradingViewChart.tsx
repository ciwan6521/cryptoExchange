'use client';

import React, { useCallback, useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/utils';

type TradingViewWidget = {
  remove?: () => void;
};

declare global {
  interface Window {
    TradingView?: {
      widget: new (options: Record<string, unknown>) => TradingViewWidget;
    };
  }
}

const TV_SCRIPT_ID = 'tradingview-tv-js';
const TV_SCRIPT_SRC = 'https://s3.tradingview.com/tv.js';

let tvScriptPromise: Promise<void> | null = null;

function loadTradingViewScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }
  if (window.TradingView) {
    return Promise.resolve();
  }
  if (tvScriptPromise) {
    return tvScriptPromise;
  }

  tvScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(TV_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('TradingView script failed')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = TV_SCRIPT_ID;
    script.src = TV_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('TradingView script failed'));
    document.head.appendChild(script);
  });

  return tvScriptPromise;
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
  const widgetRef = useRef<TradingViewWidget | null>(null);

  const destroyWidget = useCallback(() => {
    if (widgetRef.current?.remove) {
      try {
        widgetRef.current.remove();
      } catch {
        // TradingView may already be torn down
      }
    }
    widgetRef.current = null;
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
  }, []);

  const mountWidget = useCallback(() => {
    if (!containerRef.current || !window.TradingView) return;

    destroyWidget();

    widgetRef.current = new window.TradingView.widget({
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
  }, [containerId, destroyWidget, interval, symbol]);

  useEffect(() => {
    let cancelled = false;

    loadTradingViewScript()
      .then(() => {
        if (!cancelled) mountWidget();
      })
      .catch(() => {
        // Chart stays empty; error boundary / parent can show fallback
      });

    return () => {
      cancelled = true;
      destroyWidget();
    };
  }, [destroyWidget, mountWidget]);

  return (
    <div className={cn('relative w-full h-full min-h-[400px]', className)}>
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
