'use client';

import { useMemo } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useAdminStore } from '@/stores/admin-store';

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
    if (!authUser) return DEFAULT_FLAGS;

    return {
      userTradingEnabled: authUser.tradingEnabled && systemFlags.tradingEnabled,
      userWithdrawalsEnabled: authUser.withdrawalsEnabled && systemFlags.withdrawalsEnabled,
      userEnabled: authUser.isActive,
      forceLoggedOut: !authUser.isActive,
      passwordResetPending: false,
    };
  }, [authUser, systemFlags]);
}
