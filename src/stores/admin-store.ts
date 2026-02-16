import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================
// Admin Store (Hardened)
// Auth token is in httpOnly cookie — NEVER in JS/localStorage.
// Only admin profile + role are stored for UI rendering.
// All data comes from backend API — no mock data.
// ============================================

// ── Role & Permission System ──────────────────────────
export type AdminRole = 'super_admin' | 'operator' | 'finance' | 'readonly';

export interface AdminPermissions {
  canManageUsers: boolean;
  canManageBalances: boolean;
  canManageOrders: boolean;
  canManageMarkets: boolean;
  canManageFlags: boolean;
  canManageCampaigns: boolean;
  canManageCMS: boolean;
  canManageWallets: boolean;
  canViewLogs: boolean;
  canViewAnalytics: boolean;
  canManageAdmins: boolean;
}

export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermissions> = {
  super_admin: {
    canManageUsers: true,
    canManageBalances: true,
    canManageOrders: true,
    canManageMarkets: true,
    canManageFlags: true,
    canManageCampaigns: true,
    canManageCMS: true,
    canManageWallets: true,
    canViewLogs: true,
    canViewAnalytics: true,
    canManageAdmins: true,
  },
  operator: {
    canManageUsers: true,
    canManageBalances: false,
    canManageOrders: true,
    canManageMarkets: true,
    canManageFlags: false,
    canManageCampaigns: true,
    canManageCMS: true,
    canManageWallets: false,
    canViewLogs: true,
    canViewAnalytics: true,
    canManageAdmins: false,
  },
  finance: {
    canManageUsers: false,
    canManageBalances: true,
    canManageOrders: false,
    canManageMarkets: false,
    canManageFlags: false,
    canManageCampaigns: false,
    canManageCMS: false,
    canManageWallets: true,
    canViewLogs: true,
    canViewAnalytics: true,
    canManageAdmins: false,
  },
  readonly: {
    canManageUsers: false,
    canManageBalances: false,
    canManageOrders: false,
    canManageMarkets: false,
    canManageFlags: false,
    canManageCampaigns: false,
    canManageCMS: false,
    canManageWallets: false,
    canViewLogs: true,
    canViewAnalytics: true,
    canManageAdmins: false,
  },
};

// ── Admin User ────────────────────────────────────────
export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  twoFactorEnabled: boolean;
  lastLogin: number;
}

// ── Type exports preserved for backward compatibility ──
export type CampaignType =
  | 'signup_bonus'
  | 'deposit_bonus'
  | 'trading_cashback'
  | 'referral_bonus'
  | 'fee_discount'
  | 'volume_reward';

export interface CMSContent {
  id: string;
  type: 'announcement' | 'maintenance' | 'banner' | 'popup';
  title: string;
  body: string;
  active: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  startDate: number;
  endDate: number | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface SystemFlags {
  tradingEnabled: boolean;
  newOrdersEnabled: boolean;
  depositsEnabled: boolean;
  withdrawalsEnabled: boolean;
  maintenanceMode: boolean;
  registrationEnabled: boolean;
}

// ── Store State ───────────────────────────────────────
const SESSION_DURATION = 60 * 60 * 1000; // 1 hour (matches admin JWT expiry)

interface AdminState {
  // Auth — NO token stored, it lives in httpOnly cookie
  isAdminAuthenticated: boolean;
  adminUser: AdminUser | null;
  sessionExpiry: number | null;
  twoFactorPending: boolean;

  // System flags (fetched from backend, cached for UI)
  systemFlags: SystemFlags;

  // CMS content (fetched from backend, cached for UI rendering)
  cmsContent: CMSContent[];

  // Actions — Auth
  adminLogin: (user: AdminUser) => void;
  adminLogout: () => void;
  set2FAPending: (pending: boolean) => void;

  // Actions — System flags
  setSystemFlag: (flag: keyof SystemFlags, value: boolean) => void;

  // Actions — CMS (cache for rendering)
  setCMSContent: (content: CMSContent[]) => void;

  // Helpers
  getPermissions: () => AdminPermissions;
  hasPermission: (perm: keyof AdminPermissions) => boolean;
  isSessionValid: () => boolean;
}

export const useAdminStore = create<AdminState>()(
  persist(
    (set, get) => ({
      // ── Auth state — token is NEVER stored here ──
      isAdminAuthenticated: false,
      adminUser: null,
      sessionExpiry: null,
      twoFactorPending: false,

      // ── System flags ──
      systemFlags: {
        tradingEnabled: true,
        newOrdersEnabled: true,
        depositsEnabled: true,
        withdrawalsEnabled: true,
        maintenanceMode: false,
        registrationEnabled: true,
      },

      // ── CMS content cache ──
      cmsContent: [],

      // ── Auth actions ──
      adminLogin: (user) =>
        set({
          isAdminAuthenticated: true,
          adminUser: { ...user, lastLogin: Date.now() },
          sessionExpiry: Date.now() + SESSION_DURATION,
          twoFactorPending: false,
        }),

      adminLogout: () =>
        set({
          isAdminAuthenticated: false,
          adminUser: null,
          sessionExpiry: null,
          twoFactorPending: false,
        }),

      set2FAPending: (pending) => set({ twoFactorPending: pending }),

      // ── System flags ──
      setSystemFlag: (flag, value) =>
        set((s) => ({
          systemFlags: { ...s.systemFlags, [flag]: value },
        })),

      // ── CMS ──
      setCMSContent: (content) => set({ cmsContent: content }),

      // ── Helpers ──
      getPermissions: () => {
        const { adminUser } = get();
        if (!adminUser) return ROLE_PERMISSIONS.readonly;
        return ROLE_PERMISSIONS[adminUser.role];
      },

      hasPermission: (perm) => {
        const perms = get().getPermissions();
        return perms[perm];
      },

      isSessionValid: () => {
        const { isAdminAuthenticated, sessionExpiry } = get();
        if (!isAdminAuthenticated || !sessionExpiry) return false;
        return Date.now() < sessionExpiry;
      },
    }),
    {
      name: 'nexus-admin',
      // Only persist admin profile and session state — NEVER tokens
      partialize: (state) => ({
        isAdminAuthenticated: state.isAdminAuthenticated,
        adminUser: state.adminUser,
        sessionExpiry: state.sessionExpiry,
        systemFlags: state.systemFlags,
      }),
    }
  )
);
