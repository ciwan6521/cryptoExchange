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
  const mockUsers = useAdminStore((s) => s.mockUsers);

  return useMemo(() => {
    if (!authUser?.email) return DEFAULT_FLAGS;

    const matched = mockUsers.find(
      (u) => u.email.toLowerCase() === authUser.email.toLowerCase()
    );

    if (!matched) return DEFAULT_FLAGS;

    return {
      userTradingEnabled: matched.tradingEnabled,
      userWithdrawalsEnabled: matched.withdrawalsEnabled,
      userEnabled: matched.enabled,
      forceLoggedOut: matched.forceLoggedOut,
      passwordResetPending: matched.passwordResetPending,
    };
  }, [authUser, mockUsers]);
}
