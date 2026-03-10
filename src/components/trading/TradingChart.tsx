'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, type IChartApi, type ISeriesApi, type CandlestickData } from 'lightweight-charts';
import { cn } from '@/lib/utils';
import { SkeletonChart } from '@/components/ui';

// Generate candlestick data anchored to real price.
// The LAST candle's close always equals basePrice so chart matches the ticker.
function generateCandles(basePrice: number, interval: number, count = 100) {
  // Build backwards from current price so the final close == basePrice
  const raw: { open: number; close: number; high: number; low: number; volume: number }[] = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    const volatility = price * 0.008; // moderate volatility
    const change = (Math.random() - 0.5) * volatility;
    const open = price - change;
    const high = Math.max(open, price) + Math.random() * volatility * 0.3;
    const low = Math.min(open, price) - Math.random() * volatility * 0.3;
    const volume = Math.random() * 1000 + 100;
    raw.push({ open, close: price, high, low, volume });
    price = open; // next iteration: earlier candle ends where this one opened
  }
  raw.reverse();
  const now = Date.now();
  return raw.map((c, i) => ({
    time: now - (count - 1 - i) * interval,
    ...c,
  }));
}

// ============================================
// Trading Chart Component
// TradingView-style candlestick chart
// Using lightweight-charts library
// ============================================

interface TradingChartProps {
  symbol: string;
  basePrice?: number;
  className?: string;
}

type ChartInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

const intervals: { label: string; value: ChartInterval; ms: number }[] = [
  { label: '1m', value: '1m', ms: 60 * 1000 },
  { label: '5m', value: '5m', ms: 5 * 60 * 1000 },
  { label: '15m', value: '15m', ms: 15 * 60 * 1000 },
  { label: '1H', value: '1h', ms: 60 * 60 * 1000 },
  { label: '4H', value: '4h', ms: 4 * 60 * 60 * 1000 },
  { label: '1D', value: '1d', ms: 24 * 60 * 60 * 1000 },
  { label: '1W', value: '1w', ms: 7 * 24 * 60 * 60 * 1000 },
];

export const TradingChart: React.FC<TradingChartProps> = ({
  symbol,
  basePrice = 97842.50,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<ChartInterval>('15m');
  const [isLoading, setIsLoading] = useState(true);
  
  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Create chart
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
        vertLine: {
          width: 1,
          color: 'rgba(255, 255, 255, 0.2)',
          style: 2,
        },
        horzLine: {
          width: 1,
          color: 'rgba(255, 255, 255, 0.2)',
          style: 2,
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        vertTouchDrag: false,
      },
    });
    
    // Add candlestick series
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
    
    // Resize observer
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
  
  // Load data when interval changes
  useEffect(() => {
    if (!seriesRef.current) return;
    
    setIsLoading(true);
    
    const interval = intervals.find(i => i.value === selectedInterval);
    if (!interval) return;
    
    // Generate mock candle data
    const candles = generateCandles(basePrice, interval.ms, 200);
    
    // Format for lightweight-charts
    const chartData: CandlestickData[] = candles.map(candle => ({
      time: (candle.time / 1000) as any, // Convert to seconds
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));
    
    // Set data
    seriesRef.current.setData(chartData);
    
    // Fit content
    chartRef.current?.timeScale().fitContent();
    
    setIsLoading(false);
  }, [selectedInterval, basePrice, symbol]);
  
  // Simulate real-time updates
  useEffect(() => {
    if (!seriesRef.current) return;
    
    const interval = intervals.find(i => i.value === selectedInterval);
    if (!interval) return;
    
    const updateInterval = setInterval(() => {
      // Get last candle and update it
      const lastCandle = seriesRef.current?.data().slice(-1)[0] as CandlestickData | undefined;
      if (!lastCandle) return;
      
      const change = (Math.random() - 0.5) * basePrice * 0.0001;
      const newClose = lastCandle.close + change;
      
      seriesRef.current?.update({
        time: lastCandle.time,
        open: lastCandle.open,
        high: Math.max(lastCandle.high, newClose),
        low: Math.min(lastCandle.low, newClose),
        close: newClose,
      });
    }, 1000);
    
    return () => clearInterval(updateInterval);
  }, [selectedInterval, basePrice]);
  
  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Chart header */}
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
        
        <div className="flex items-center gap-2">
          <button className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            Indicators
          </button>
          <button className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            Settings
          </button>
        </div>
      </div>
      
      {/* Chart container */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 z-10">
            <SkeletonChart className="h-full" />
          </div>
        )}
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    </div>
  );
};

