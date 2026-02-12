import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { toFixed, toFixedWithCommas, sub, div, mul } from './decimal';

/**
 * Merge Tailwind CSS classes with clsx
 * Handles conflicts and deduplication automatically
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format number with commas and decimal places
 * Optimized for trading display
 */
export function formatNumber(
  value: number,
  options: {
    decimals?: number;
    compact?: boolean;
    showSign?: boolean;
  } = {}
): string {
  const { decimals = 2, compact = false, showSign = false } = options;
  
  if (compact && Math.abs(value) >= 1e9) {
    return `${showSign && value > 0 ? '+' : ''}${(value / 1e9).toFixed(2)}B`;
  }
  if (compact && Math.abs(value) >= 1e6) {
    return `${showSign && value > 0 ? '+' : ''}${(value / 1e6).toFixed(2)}M`;
  }
  if (compact && Math.abs(value) >= 1e3) {
    return `${showSign && value > 0 ? '+' : ''}${(value / 1e3).toFixed(2)}K`;
  }
  
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  
  return showSign && value > 0 ? `+${formatted}` : formatted;
}

/**
 * Format price with appropriate decimal places based on value.
 * Uses decimal.ts for deterministic rounding (ROUND_DOWN).
 */
export function formatPrice(price: number): string {
  const decimals = price >= 100 ? 2 : price >= 1 ? 4 : price >= 0.01 ? 6 : 8;
  return toFixedWithCommas(price, decimals);
}

/**
 * Format percentage with sign.
 * Uses decimal.ts for deterministic rounding.
 */
export function formatPercent(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${toFixed(value, decimals)}%`;
}

/**
 * Format crypto quantity.
 * Uses decimal.ts, strips trailing zeros.
 */
export function formatQuantity(quantity: number, decimals = 8): string {
  const fixed = toFixed(quantity, decimals);
  // Strip trailing zeros but keep at least "0"
  return fixed.replace(/(\.[0-9]*?)0+$/, '$1').replace(/\.$/, '');
}

/**
 * Format timestamp to readable date/time
 */
export function formatTime(timestamp: number, format: 'time' | 'date' | 'full' = 'time'): string {
  const date = new Date(timestamp);
  
  if (format === 'time') {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }
  
  if (format === 'date') {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
  
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Calculate spread between best bid and ask.
 * Uses decimal.ts for deterministic arithmetic.
 */
export function calculateSpread(bestBid: number, bestAsk: number): {
  absolute: number;
  percentage: number;
} {
  const absolute = parseFloat(sub(bestAsk, bestBid));
  const percentage = bestAsk > 0
    ? parseFloat(mul(div(sub(bestAsk, bestBid), bestAsk), 100))
    : 0;
  return { absolute, percentage };
}

/**
 * Debounce function for performance
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle function for rate limiting
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation
 */
export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Check if device is mobile
 */
export function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768;
}

/**
 * Check if reduced motion is preferred
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Safe local storage access
 */
export const storage = {
  get: <T>(key: string, defaultValue: T): T => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },
  set: <T>(key: string, value: T): void => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or unavailable
    }
  },
  remove: (key: string): void => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage unavailable
    }
  },
};

