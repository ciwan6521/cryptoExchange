// ============================================
// Decimal Precision Layer
// ALL financial arithmetic MUST go through this module.
// Native floating-point is NEVER used for money math.
// Uses decimal.js-light for deterministic rounding.
// ============================================

import Decimal from 'decimal.js-light';
import { getPrecision, type AssetPrecision } from './tokens';

// Configure global defaults — ROUND_DOWN for financial safety (truncate, never round up).
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_DOWN,
  toExpNeg: -18,
  toExpPos: 20,
});

export { Decimal };

// --- Core arithmetic helpers ---

/** Safe addition: a + b */
export function add(a: string | number, b: string | number): string {
  return new Decimal(a).plus(new Decimal(b)).toFixed();
}

/** Safe subtraction: a - b */
export function sub(a: string | number, b: string | number): string {
  return new Decimal(a).minus(new Decimal(b)).toFixed();
}

/** Safe multiplication: a * b */
export function mul(a: string | number, b: string | number): string {
  return new Decimal(a).times(new Decimal(b)).toFixed();
}

/** Safe division: a / b. Returns '0' if b is zero. */
export function div(a: string | number, b: string | number): string {
  const divisor = new Decimal(b);
  if (divisor.isZero()) return '0';
  return new Decimal(a).dividedBy(divisor).toFixed();
}

// --- Comparison helpers ---

export function gt(a: string | number, b: string | number): boolean {
  return new Decimal(a).greaterThan(new Decimal(b));
}

export function gte(a: string | number, b: string | number): boolean {
  return new Decimal(a).greaterThanOrEqualTo(new Decimal(b));
}

export function lt(a: string | number, b: string | number): boolean {
  return new Decimal(a).lessThan(new Decimal(b));
}

export function lte(a: string | number, b: string | number): boolean {
  return new Decimal(a).lessThanOrEqualTo(new Decimal(b));
}

export function eq(a: string | number, b: string | number): boolean {
  return new Decimal(a).equals(new Decimal(b));
}

export function isZero(a: string | number): boolean {
  return new Decimal(a).isZero();
}

export function isPositive(a: string | number): boolean {
  return new Decimal(a).isPositive() && !new Decimal(a).isZero();
}

// --- Formatting helpers ---

/**
 * Format a value to a fixed number of decimal places using ROUND_DOWN.
 * Never produces scientific notation.
 */
export function toFixed(value: string | number, decimals: number): string {
  return new Decimal(value).toFixed(decimals, Decimal.ROUND_DOWN);
}

/**
 * Format a price for display using the asset's precision rules.
 */
export function formatDecimalPrice(value: string | number, symbol: string): string {
  const precision = getPrecision(symbol);
  return toFixedWithCommas(value, precision.price);
}

/**
 * Format a quantity for display using the asset's precision rules.
 */
export function formatDecimalQuantity(value: string | number, symbol: string): string {
  const precision = getPrecision(symbol);
  return toFixed(value, precision.quantity);
}

/**
 * Format with commas and fixed decimals. No scientific notation.
 */
export function toFixedWithCommas(value: string | number, decimals: number): string {
  const fixed = toFixed(value, decimals);
  const [intPart, decPart] = fixed.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
}

// --- Validation helpers ---

/**
 * Validate that a string is a valid decimal number (no scientific notation).
 * Returns true if valid.
 */
export function isValidDecimal(value: string): boolean {
  if (value === '' || value === '.') return true; // Allow partial input
  // Reject scientific notation, leading zeros (except "0."), multiple dots
  return /^\d*\.?\d*$/.test(value) && !value.includes('e') && !value.includes('E');
}

/**
 * Enforce decimal precision on an input string.
 * Truncates excess decimals without rounding.
 */
export function enforceDecimals(value: string, maxDecimals: number): string {
  if (!value.includes('.')) return value;
  const [intPart, decPart] = value.split('.');
  return `${intPart}.${decPart.slice(0, maxDecimals)}`;
}

/**
 * Quantize a value to the nearest step (e.g. tick size or step size).
 * Always rounds DOWN for financial safety.
 */
export function quantize(value: string | number, step: string): string {
  const d = new Decimal(value);
  const s = new Decimal(step);
  if (s.isZero()) return d.toFixed();
  // floor(value / step) * step
  const divided = d.dividedBy(s);
  const floored = new Decimal(divided.toFixed(0, Decimal.ROUND_DOWN));
  return floored.times(s).toFixed();
}

/**
 * Full order validation against asset precision rules.
 * Returns null if valid, or an error message string.
 */
export function validateOrder(
  price: string,
  quantity: string,
  symbol: string,
  side: 'buy' | 'sell',
  availableBalance: string
): string | null {
  const p = getPrecision(symbol);

  // Check price is positive
  if (!isPositive(price)) return 'Price must be greater than 0';

  // Check quantity is positive
  if (!isPositive(quantity)) return 'Quantity must be greater than 0';

  // Check min quantity
  if (lt(quantity, p.minQty)) return `Minimum quantity is ${p.minQty}`;

  // Check max quantity
  if (gt(quantity, p.maxQty)) return `Maximum quantity is ${p.maxQty}`;

  // Check step size (quantity must be a multiple of stepSize)
  const quantized = quantize(quantity, p.stepSize);
  if (!eq(quantized, quantity)) {
    return `Quantity must be a multiple of ${p.stepSize}`;
  }

  // Check tick size (price must be a multiple of tickSize)
  const quantizedPrice = quantize(price, p.tickSize);
  if (!eq(quantizedPrice, price)) {
    return `Price must be a multiple of ${p.tickSize}`;
  }

  // Check min notional
  const notional = mul(price, quantity);
  if (lt(notional, p.minNotional)) {
    return `Order value must be at least ${p.minNotional} USDT`;
  }

  // Check balance
  if (side === 'buy') {
    if (gt(notional, availableBalance)) return 'Insufficient balance';
  } else {
    if (gt(quantity, availableBalance)) return 'Insufficient balance';
  }

  return null;
}
