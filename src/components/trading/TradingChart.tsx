'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, type IChartApi, type ISeriesApi, type CandlestickData } from 'lightweight-charts';
import { cn } from '@/lib/utils';
import { SkeletonChart } from '@/components/ui';

interface TradingChartProps {
  symbol: string;
  basePrice?: number;
  className?: string;
}

type ChartInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

const intervals: { label: string; value: ChartInterval }[] = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
];

async function fetchKlines(symbol: string, interval: string, limit = 300): Promise<CandlestickData[]> {
  const binanceSymbol = symbol.replace('/', '').replace('-', '');
  const res = await fetch(`/api/market/klines?symbol=${encodeURIComponent(binanceSymbol)}&interval=${interval}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch klines');
  const data = await res.json();
  return (data.candles || []).map((c: any) => ({
    time: c.time as any,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
}

export const TradingChart: React.FC<TradingChartProps> = ({
  symbol,
  basePrice = 0,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<ChartInterval>('15m');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9ca3af',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: 1,
        vertLine: { width: 1, color: 'rgba(255, 255, 255, 0.2)', style: 2 },
        horzLine: { width: 1, color: 'rgba(255, 255, 255, 0.2)', style: 2 },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      wickUpColor: '#22c55e',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || !entries[0].contentRect) return;
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    fetchKlines(symbol, selectedInterval)
      .then((data) => {
        if (cancelled || !seriesRef.current) return;
        seriesRef.current.setData(data);
        chartRef.current?.timeScale().fitContent();
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Failed to load chart data');
        setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedInterval, symbol]);

  // Live update: poll latest candle every 5s
  useEffect(() => {
    if (!seriesRef.current) return;
    const timer = setInterval(async () => {
      try {
        const candles = await fetchKlines(symbol, selectedInterval, 2);
        if (candles.length > 0 && seriesRef.current) {
          seriesRef.current.update(candles[candles.length - 1]);
        }
      } catch { /* ignore poll errors */ }
    }, 5000);
    return () => clearInterval(timer);
  }, [selectedInterval, symbol]);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-glass-border">
        <div className="flex items-center gap-1">
          {intervals.map((interval) => (
            <button
              key={interval.value}
              onClick={() => setSelectedInterval(interval.value)}
              className={cn(
                'px-2 py-1 text-xs font-medium rounded transition-colors',
                selectedInterval === interval.value
                  ? 'bg-brand-500/10 text-brand-400'
                  : 'text-gray-500 hover:text-gray-300'
              )}
            >
              {interval.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 z-10">
            <SkeletonChart className="h-full" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    </div>
  );
};
