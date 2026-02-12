'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getWebSocket } from '@/lib/websocket';
import type { TradingPair, Orderbook, Trade, PerformanceMetrics } from '@/types';
import { useTradingStore, selectTicker, selectOrderbook, selectTrades, selectAllTickers } from '@/stores/trading-store';

// ============================================
// Custom Hooks for Nexus Exchange
// ============================================

export { useUserFlags } from './useUserFlags';
export type { UserFlags } from './useUserFlags';

/**
 * WebSocket connection and subscription hook
 * Connection is managed by Providers; this hook manages channel subscriptions.
 */
export function useWebSocket() {
  const connectionStatus = useTradingStore((s) => s.connectionStatus);
  const isConnected = connectionStatus === 'connected';
  const ws = useMemo(() => getWebSocket(), []);
  
  const subscribe = useCallback(
    <T>(channel: string, callback: (data: T) => void) => {
      return ws.subscribe(channel, (message) => {
        callback(message.data as T);
      });
    },
    [ws]
  );
  
  return { isConnected, subscribe };
}

/**
 * Real-time ticker data hook.
 * Subscribes to WS channel; reads from Zustand store.
 */
export function useTicker(symbol: string): TradingPair | null {
  const { subscribe } = useWebSocket();
  const ticker = useTradingStore(selectTicker(symbol));
  
  useEffect(() => {
    if (!symbol) return;
    // Subscribe to channel — data flows into store via WS emit()
    const unsubscribe = subscribe<TradingPair>(`ticker:${symbol}`, () => {});
    return unsubscribe;
  }, [subscribe, symbol]);
  
  return ticker;
}

/**
 * All tickers hook for dashboard/market overview.
 * Subscribes to WS channel; reads from Zustand store.
 */
export function useTickers(): TradingPair[] {
  const { subscribe } = useWebSocket();
  const tickers = useTradingStore(selectAllTickers);
  
  useEffect(() => {
    const unsubscribe = subscribe<TradingPair[]>('tickers:all', () => {});
    return unsubscribe;
  }, [subscribe]);
  
  return tickers;
}

/**
 * Real-time orderbook hook.
 * Subscribes to WS channel; reads from Zustand store.
 */
export function useOrderbook(symbol: string): Orderbook | null {
  const { subscribe } = useWebSocket();
  const orderbook = useTradingStore(selectOrderbook(symbol));
  
  useEffect(() => {
    if (!symbol) return;
    const unsubscribe = subscribe<Orderbook>(`orderbook:${symbol}`, () => {});
    return unsubscribe;
  }, [subscribe, symbol]);
  
  return orderbook;
}

/**
 * Recent trades hook.
 * Subscribes to WS channel; reads from Zustand store.
 * Deduplication and capping handled in store.
 */
export function useTrades(symbol: string): Trade[] {
  const { subscribe } = useWebSocket();
  const trades = useTradingStore(selectTrades(symbol));
  
  useEffect(() => {
    if (!symbol) return;
    const unsubscribe = subscribe<Trade[]>(`trades:${symbol}`, () => {});
    return unsubscribe;
  }, [subscribe, symbol]);
  
  return trades;
}

/**
 * Reduced motion preference hook
 */
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };
    
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);
  
  return prefersReducedMotion;
}

/**
 * Performance monitoring hook
 * Tracks FPS and automatically disables heavy effects on low-end devices
 */
export function usePerformance(): PerformanceMetrics {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 60,
    isLowPerformance: false,
    shouldReduceAnimations: false,
  });
  
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());
  const lowFpsCountRef = useRef(0);
  
  useEffect(() => {
    let animationId: number;
    
    const measureFPS = () => {
      frameCountRef.current++;
      
      const now = performance.now();
      const elapsed = now - lastTimeRef.current;
      
      // Calculate FPS every second
      if (elapsed >= 1000) {
        const fps = Math.round((frameCountRef.current * 1000) / elapsed);
        
        // Track low FPS occurrences
        if (fps < 30) {
          lowFpsCountRef.current++;
        } else {
          lowFpsCountRef.current = Math.max(0, lowFpsCountRef.current - 1);
        }
        
        const isLowPerformance = lowFpsCountRef.current >= 3;
        
        setMetrics({
          fps,
          isLowPerformance,
          shouldReduceAnimations: isLowPerformance || fps < 45,
        });
        
        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }
      
      animationId = requestAnimationFrame(measureFPS);
    };
    
    animationId = requestAnimationFrame(measureFPS);
    
    return () => cancelAnimationFrame(animationId);
  }, []);
  
  return metrics;
}

/**
 * Media query hook
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);
    
    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };
    
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);
  
  return matches;
}

/**
 * Debounced value hook
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  
  return debouncedValue;
}

/**
 * Previous value hook
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  
  useEffect(() => {
    ref.current = value;
  }, [value]);
  
  return ref.current;
}

/**
 * Price change animation hook
 * Returns animation class based on price direction
 */
export function usePriceAnimation(price: number): 'up' | 'down' | null {
  const [direction, setDirection] = useState<'up' | 'down' | null>(null);
  const previousPrice = usePrevious(price);
  const timeoutRef = useRef<NodeJS.Timeout>();
  
  useEffect(() => {
    if (previousPrice === undefined) return;
    
    if (price > previousPrice) {
      setDirection('up');
    } else if (price < previousPrice) {
      setDirection('down');
    }
    
    // Clear direction after animation
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      setDirection(null);
    }, 300);
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [price, previousPrice]);
  
  return direction;
}

/**
 * Intersection observer hook for lazy loading
 */
export function useIntersection(
  options?: IntersectionObserverInit
): [React.RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);
  
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    
    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);
    
    observer.observe(element);
    
    return () => observer.disconnect();
  }, [options]);
  
  return [ref, isIntersecting];
}

/**
 * Local storage hook with SSR safety
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        setStoredValue(JSON.parse(item));
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
    }
  }, [key]);
  
  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch (error) {
        console.warn(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key, storedValue]
  );
  
  return [storedValue, setValue];
}

