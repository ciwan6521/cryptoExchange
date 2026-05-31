// ============================================
// Feature Flags
// Environment-based toggles for safe rollouts.
// All sensitive flows must be gated behind a flag.
// Flags can be toggled via env vars without redeploying
// by using NEXT_PUBLIC_ prefix for client-side flags.
// ============================================

export interface FeatureFlags {
  /** Allow live trading (order submission). When false, order form is read-only. */
  ENABLE_LIVE_TRADING: boolean;
  /** Allow withdrawals. When false, withdraw button is disabled with notice. */
  ENABLE_WITHDRAW: boolean;
  /** Allow deposits. */
  ENABLE_DEPOSIT: boolean;
  /** Show futures trading UI. */
  ENABLE_FUTURES: boolean;
  /** Enable WebSocket real-time data. When false, falls back to polling/static. */
  ENABLE_REALTIME: boolean;
  /** Show stop-limit order type in order form. */
  ENABLE_STOP_LIMIT: boolean;
  /** Enable API key management in settings. */
  ENABLE_API_KEYS: boolean;
  /** Show the 3D hero on landing page. Disable on low-end targets. */
  ENABLE_3D_HERO: boolean;
  /** Enable social login (Google, GitHub). */
  ENABLE_SOCIAL_LOGIN: boolean;
}

// Read a boolean env var. Defaults to `fallback` if not set.
function envBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (val === undefined || val === '') return fallback;
  return val === 'true' || val === '1';
}

// Singleton flags object — evaluated once at module load.
// In Next.js, NEXT_PUBLIC_ vars are inlined at build time for client bundles.
export const flags: Readonly<FeatureFlags> = Object.freeze({
  ENABLE_LIVE_TRADING: envBool('NEXT_PUBLIC_ENABLE_LIVE_TRADING', true),
  ENABLE_WITHDRAW: envBool('NEXT_PUBLIC_ENABLE_WITHDRAW', true),
  ENABLE_DEPOSIT: envBool('NEXT_PUBLIC_ENABLE_DEPOSIT', true),
  ENABLE_FUTURES: envBool('NEXT_PUBLIC_ENABLE_FUTURES', true),
  ENABLE_REALTIME: envBool('NEXT_PUBLIC_ENABLE_REALTIME', true),
  ENABLE_STOP_LIMIT: envBool('NEXT_PUBLIC_ENABLE_STOP_LIMIT', true),
  ENABLE_API_KEYS: envBool('NEXT_PUBLIC_ENABLE_API_KEYS', true),
  ENABLE_3D_HERO: envBool('NEXT_PUBLIC_ENABLE_3D_HERO', true),
  ENABLE_SOCIAL_LOGIN: envBool('NEXT_PUBLIC_ENABLE_SOCIAL_LOGIN', false),
});

/**
 * Type-safe flag check. Use this in components:
 *   if (isEnabled('ENABLE_LIVE_TRADING')) { ... }
 */
export function isEnabled(flag: keyof FeatureFlags): boolean {
  return flags[flag];
}
