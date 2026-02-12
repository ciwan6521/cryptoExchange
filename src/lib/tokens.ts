// ============================================
// Design Tokens
// Single source of truth for all design values.
// All UI components must derive from these tokens.
// ============================================

// --- Color Tokens ---
// Mirrors tailwind.config.ts for JS-side usage (e.g. chart colors, canvas).
export const colors = {
  brand: {
    50: '#f0fdf9',
    100: '#ccfbef',
    200: '#99f6e0',
    300: '#5eead4',
    400: '#2dd4bf',
    500: '#14b8a6',
    600: '#0d9488',
    700: '#0f766e',
    800: '#115e59',
    900: '#134e4a',
  },
  surface: {
    50: '#1e2028',
    100: '#181a1f',
    200: '#14161a',
    300: '#111215',
    400: '#0d0e10',
    500: '#0a0b0c',
  },
  semantic: {
    profit: '#22c55e',
    loss: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
  },
  glass: {
    white: 'rgba(255, 255, 255, 0.03)',
    border: 'rgba(255, 255, 255, 0.06)',
    hover: 'rgba(255, 255, 255, 0.08)',
  },
} as const;

// --- Spacing Scale (rem) ---
export const spacing = {
  0: '0',
  0.5: '0.125rem',
  1: '0.25rem',
  1.5: '0.375rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
} as const;

// --- Typography Scale ---
export const typography = {
  fontSize: {
    xs: ['0.75rem', { lineHeight: '1rem' }],
    sm: ['0.875rem', { lineHeight: '1.25rem' }],
    base: ['1rem', { lineHeight: '1.5rem' }],
    lg: ['1.125rem', { lineHeight: '1.75rem' }],
    xl: ['1.25rem', { lineHeight: '1.75rem' }],
    '2xl': ['1.5rem', { lineHeight: '2rem' }],
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  fontFamily: {
    sans: 'var(--font-geist-sans), Inter, system-ui, sans-serif',
    mono: 'var(--font-geist-mono), JetBrains Mono, ui-monospace, monospace',
  },
} as const;

// --- Motion Tokens ---
// Centralized animation durations and easing curves.
// All framer-motion / CSS transitions should reference these.
export const motion = {
  duration: {
    instant: 0.1,
    fast: 0.15,
    normal: 0.2,
    slow: 0.3,
    slower: 0.5,
  },
  easing: {
    default: [0.16, 1, 0.3, 1] as readonly number[],
    inOut: [0.87, 0, 0.13, 1] as readonly number[],
    spring: { type: 'spring' as const, stiffness: 500, damping: 30 },
  },
} as const;

// --- Z-Index Scale ---
export const zIndex = {
  dropdown: 100,
  sticky: 200,
  modal: 300,
  popover: 400,
  tooltip: 500,
  toast: 600,
} as const;

// --- Border Radius ---
export const radii = {
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  full: '9999px',
} as const;

// --- Asset Precision Rules ---
// Deterministic decimal places per asset. Used by decimal.ts and all formatters.
export type AssetPrecision = {
  price: number;    // decimal places for price display
  quantity: number;  // decimal places for quantity/amount
  tickSize: string;  // minimum price increment as string
  stepSize: string;  // minimum quantity increment as string
  minQty: string;    // minimum order quantity
  maxQty: string;    // maximum order quantity
  minNotional: string; // minimum order value in quote asset
};

export const ASSET_PRECISION: Record<string, AssetPrecision> = {
  'BTC/USDT': {
    price: 2,
    quantity: 6,
    tickSize: '0.01',
    stepSize: '0.000001',
    minQty: '0.000001',
    maxQty: '9999',
    minNotional: '10',
  },
  'ETH/USDT': {
    price: 2,
    quantity: 5,
    tickSize: '0.01',
    stepSize: '0.00001',
    minQty: '0.00001',
    maxQty: '99999',
    minNotional: '10',
  },
  'SOL/USDT': {
    price: 2,
    quantity: 3,
    tickSize: '0.01',
    stepSize: '0.001',
    minQty: '0.001',
    maxQty: '999999',
    minNotional: '10',
  },
  'XRP/USDT': {
    price: 4,
    quantity: 1,
    tickSize: '0.0001',
    stepSize: '0.1',
    minQty: '0.1',
    maxQty: '99999999',
    minNotional: '10',
  },
  'DOGE/USDT': {
    price: 6,
    quantity: 0,
    tickSize: '0.000001',
    stepSize: '1',
    minQty: '1',
    maxQty: '999999999',
    minNotional: '10',
  },
  'AVAX/USDT': {
    price: 2,
    quantity: 2,
    tickSize: '0.01',
    stepSize: '0.01',
    minQty: '0.01',
    maxQty: '999999',
    minNotional: '10',
  },
  'LINK/USDT': {
    price: 2,
    quantity: 2,
    tickSize: '0.01',
    stepSize: '0.01',
    minQty: '0.01',
    maxQty: '999999',
    minNotional: '10',
  },
  'DOT/USDT': {
    price: 3,
    quantity: 2,
    tickSize: '0.001',
    stepSize: '0.01',
    minQty: '0.01',
    maxQty: '999999',
    minNotional: '10',
  },
} as const;

// Fallback precision for unknown pairs
export const DEFAULT_PRECISION: AssetPrecision = {
  price: 8,
  quantity: 8,
  tickSize: '0.00000001',
  stepSize: '0.00000001',
  minQty: '0.00000001',
  maxQty: '99999999',
  minNotional: '10',
};

export function getPrecision(symbol: string): AssetPrecision {
  return ASSET_PRECISION[symbol] ?? DEFAULT_PRECISION;
}
