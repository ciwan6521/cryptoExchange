import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi, type UserResponse, ApiError } from '@/lib/api';

// ============================================
// Auth Store
// Integrates with real backend API.
// Tokens live in httpOnly cookies — NEVER in JS/localStorage.
// Only user profile is persisted locally for instant hydration.
// Source of truth: backend via GET /api/auth/me
// ============================================

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  memberTier: string;
  isActive: boolean;
  isVerified: boolean;
  email_verified: boolean;
  kycStatus: string;
  tradingEnabled: boolean;
  withdrawalsEnabled: boolean;
  totp_enabled: boolean;
  created_at: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;

  // Actions — all go through backend
  register: (data: { email: string; username: string; password: string; first_name: string; last_name: string; phone: string }) => Promise<void>;
  login: (data: { email: string; password: string; totp_code?: string }) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;

  // Internal
  _setUser: (user: AuthUser) => void;
  _clearUser: () => void;
  _setError: (error: string | null) => void;
}

function mapUser(u: UserResponse): AuthUser {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    firstName: u.first_name,
    lastName: u.last_name,
    phone: u.phone,
    memberTier: u.member_tier || 'standard',
    isActive: u.is_active,
    isVerified: u.is_verified,
    email_verified: u.email_verified,
    kycStatus: u.kyc_status,
    tradingEnabled: u.trading_enabled,
    withdrawalsEnabled: u.withdrawals_enabled,
    totp_enabled: u.totp_enabled,
    created_at: u.created_at,
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      error: null,

      _setUser: (user) => set({ isAuthenticated: true, user, error: null }),
      _clearUser: () => set({ isAuthenticated: false, user: null }),
      _setError: (error) => set({ error, isLoading: false }),

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const res = await authApi.register(data);
          get()._setUser(mapUser(res));
        } catch (e) {
          const msg = e instanceof ApiError ? e.detail : 'Registration failed';
          get()._setError(msg);
          throw e;
        } finally {
          set({ isLoading: false });
        }
      },

      login: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const res = await authApi.login(data);
          get()._setUser(mapUser(res));
        } catch (e) {
          const msg = e instanceof ApiError ? e.detail : 'Login failed';
          get()._setError(msg);
          throw e;
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async () => {
        try {
          await authApi.logout();
        } catch {
          // Clear local state even if backend call fails
        }
        get()._clearUser();
      },

      restoreSession: async () => {
        // Called on app mount — check if httpOnly cookie is still valid
        set({ isLoading: true });
        try {
          const res = await authApi.me();
          get()._setUser(mapUser(res));
        } catch {
          // Cookie expired or invalid — clear local state silently
          get()._clearUser();
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'crypto4pro-auth',
      // Only persist user profile for instant hydration — NOT tokens
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
      }),
    }
  )
);
