'use client';

import { useMemo } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useAdminStore } from '@/stores/admin-store';

// ============================================
// User-Level Flags Hook
// Matches the logged-in user against admin store
// mockUsers to enforce per-user restrictions
// (trading disabled, withdrawals disabled, etc.)
// ============================================

export interface UserFlags {
  userTradingEnabled: boolean;
  userWithdrawalsEnabled: boolean;
  userEnabled: boolean;
  forceLoggedOut: boolean;
  passwordResetPending: boolean;
}

const DEFAULT_FLAGS: UserFlags = {
  userTradingEnabled: true,
  userWithdrawalsEnabled: true,
  userEnabled: true,
  forceLoggedOut: false,
  passwordResetPending: false,
};

export function useUserFlags(): UserFlags {
  const authUser = useAuthStore((s) => s.user);
  const systemFlags = useAdminStore((s) => s.systemFlags);

  return useMemo(() => {
    if (!authUser?.email) return DEFAULT_FLAGS;

    // Derive per-user flags from system-level flags.
    // When a real backend is connected, fetch per-user overrides from the API.
    return {
      userTradingEnabled: systemFlags.tradingEnabled,
      userWithdrawalsEnabled: systemFlags.withdrawalsEnabled,
      userEnabled: true,
      forceLoggedOut: false,
      passwordResetPending: false,
    };
  }, [authUser, systemFlags]);
}
