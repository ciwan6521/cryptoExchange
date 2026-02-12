import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================
// Admin Store
// Separate from user auth. Manages admin sessions,
// role-based access, audit trail, and system flags.
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
  ipAllowlist: string[];
}

// ── Audit Log ─────────────────────────────────────────
export interface AuditEntry {
  id: string;
  adminId: string;
  adminEmail: string;
  action: string;
  category: 'user' | 'balance' | 'order' | 'market' | 'system' | 'campaign' | 'cms' | 'wallet' | 'auth';
  target: string;
  details: string;
  timestamp: number;
  ip?: string;
}

// ── System Flags (Kill Switches) ──────────────────────
export interface SystemFlags {
  tradingEnabled: boolean;
  newOrdersEnabled: boolean;
  depositsEnabled: boolean;
  withdrawalsEnabled: boolean;
  maintenanceMode: boolean;
  registrationEnabled: boolean;
}

// ── Mock Users (for admin user management) ────────────
export interface MockUser {
  id: string;
  email: string;
  username: string;
  verified: boolean;
  registeredAt: number;
  lastLogin: number;
  loginIps: string[];
  devices: string[];
  enabled: boolean;
  tradingEnabled: boolean;
  withdrawalsEnabled: boolean;
  riskFlags: string[];
  notes: string;
  balances: { asset: string; available: string; locked: string }[];
  passwordResetPending: boolean;
  forceLoggedOut: boolean;
}

// ── Mock Orders ───────────────────────────────────────
export interface MockOrder {
  id: string;
  userId: string;
  pair: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market' | 'stop_limit';
  price: string;
  amount: string;
  filled: string;
  status: 'open' | 'partial' | 'filled' | 'cancelled';
  createdAt: number;
  fee: string;
}

// ── Mock Trade ────────────────────────────────────────
export interface MockTrade {
  id: string;
  orderId: string;
  userId: string;
  pair: string;
  side: 'buy' | 'sell';
  price: string;
  amount: string;
  fee: string;
  timestamp: number;
}

// ── Trading Pair Config ───────────────────────────────
export interface TradingPairConfig {
  pair: string;
  baseAsset: string;
  quoteAsset: string;
  enabled: boolean;
  minOrderSize: string;
  maxOrderSize: string;
  tickSize: string;
  stepSize: string;
  makerFee: string;
  takerFee: string;
}

// ── Campaign ──────────────────────────────────────────
export type CampaignType =
  | 'signup_bonus'       // e.g. $5 for new registrations
  | 'deposit_bonus'      // e.g. 10% on first deposit
  | 'trading_cashback'   // e.g. 20% fee cashback
  | 'referral_bonus'     // e.g. $10 per referral
  | 'fee_discount'       // e.g. 50% fee discount
  | 'volume_reward';     // e.g. trade $10k get $50

export interface Campaign {
  id: string;
  name: string;
  description: string;
  type: CampaignType;
  status: 'draft' | 'active' | 'paused' | 'ended';
  startDate: number;
  endDate: number;
  targetSegment: 'all' | 'new_users' | 'verified' | 'vip' | 'inactive';
  budget: string;
  spent: string;
  participantCount: number;
  claimedCount: number;
  reward: {
    amount: string;          // e.g. "5.00"
    asset: string;           // e.g. "USDT"
    percentBased: boolean;   // true = percentage, false = fixed amount
    maxPerUser: string;      // max reward per user
    minRequirement: string;  // min deposit/volume to qualify
  };
  rules: {
    pairs: string[];
    dailyCap: string;
    totalCap: string;
    autoApply: boolean;      // auto-apply or manual claim
    oneTimeOnly: boolean;    // one-time or recurring
  };
  createdAt: number;
}

// ── CMS Content ───────────────────────────────────────
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

// ── Deposit ───────────────────────────────────────────
export interface Deposit {
  id: string;
  userId: string;
  asset: string;
  amount: string;
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: number;
}

// ── Withdrawal ────────────────────────────────────────
export interface Withdrawal {
  id: string;
  userId: string;
  asset: string;
  amount: string;
  address: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'processing' | 'completed';
  timestamp: number;
  reviewedBy?: string;
  reviewedAt?: number;
}

// ── Balance Adjustment ────────────────────────────────
export interface BalanceAdjustment {
  id: string;
  userId: string;
  asset: string;
  type: 'credit' | 'debit';
  amount: string;
  reason: string;
  balanceBefore: string;
  balanceAfter: string;
  adminId: string;
  timestamp: number;
}

// ── Store State ───────────────────────────────────────
interface AdminState {
  // Auth
  isAdminAuthenticated: boolean;
  adminUser: AdminUser | null;
  adminToken: string | null;
  sessionExpiry: number | null;
  twoFactorPending: boolean;

  // System flags
  systemFlags: SystemFlags;

  // Data
  mockUsers: MockUser[];
  mockOrders: MockOrder[];
  mockTrades: MockTrade[];
  tradingPairs: TradingPairConfig[];
  campaigns: Campaign[];
  cmsContent: CMSContent[];
  auditLog: AuditEntry[];
  balanceAdjustments: BalanceAdjustment[];
  deposits: Deposit[];
  withdrawals: Withdrawal[];

  // Actions — Auth
  adminLogin: (user: AdminUser, token?: string) => void;
  adminLogout: () => void;
  set2FAPending: (pending: boolean) => void;

  // Actions — System flags
  setSystemFlag: (flag: keyof SystemFlags, value: boolean) => void;

  // Actions — Audit
  addAuditEntry: (entry: Omit<AuditEntry, 'id' | 'timestamp'>) => void;

  // Actions — Users
  updateMockUser: (userId: string, updates: Partial<MockUser>) => void;

  // Actions — Orders
  updateMockOrder: (orderId: string, updates: Partial<MockOrder>) => void;

  // Actions — Trading pairs
  updateTradingPair: (pair: string, updates: Partial<TradingPairConfig>) => void;

  // Actions — Campaigns
  addCampaign: (campaign: Campaign) => void;
  updateCampaign: (id: string, updates: Partial<Campaign>) => void;
  deleteCampaign: (id: string) => void;

  // Actions — CMS
  addCMSContent: (content: CMSContent) => void;
  updateCMSContent: (id: string, updates: Partial<CMSContent>) => void;
  deleteCMSContent: (id: string) => void;

  // Actions — Balance adjustments
  addBalanceAdjustment: (adj: BalanceAdjustment) => void;

  // Actions — Wallet
  updateDeposit: (id: string, updates: Partial<Deposit>) => void;
  updateWithdrawal: (id: string, updates: Partial<Withdrawal>) => void;

  // Helpers
  getPermissions: () => AdminPermissions;
  hasPermission: (perm: keyof AdminPermissions) => boolean;
  isSessionValid: () => boolean;
}

// ── Seed Data ─────────────────────────────────────────
const SEED_USERS: MockUser[] = [
  {
    id: 'u1', email: 'alice@example.com', username: 'alice', verified: true,
    registeredAt: Date.now() - 86400000 * 90, lastLogin: Date.now() - 3600000,
    loginIps: ['192.168.1.10', '10.0.0.5'], devices: ['Chrome / Windows', 'Safari / iOS'],
    enabled: true, tradingEnabled: true, withdrawalsEnabled: true, riskFlags: [], notes: '',
    passwordResetPending: false, forceLoggedOut: false,
    balances: [
      { asset: 'BTC', available: '1.23456789', locked: '0.10000000' },
      { asset: 'USDT', available: '52340.50', locked: '1200.00' },
      { asset: 'ETH', available: '15.5000', locked: '0.0000' },
    ],
  },
  {
    id: 'u2', email: 'bob@example.com', username: 'bob_trader', verified: true,
    registeredAt: Date.now() - 86400000 * 45, lastLogin: Date.now() - 7200000,
    loginIps: ['172.16.0.1'], devices: ['Firefox / macOS'],
    enabled: true, tradingEnabled: true, withdrawalsEnabled: true, riskFlags: ['high_volume'], notes: 'VIP trader',
    passwordResetPending: false, forceLoggedOut: false,
    balances: [
      { asset: 'BTC', available: '5.00000000', locked: '1.50000000' },
      { asset: 'USDT', available: '128500.00', locked: '45000.00' },
    ],
  },
  {
    id: 'u3', email: 'charlie@example.com', username: 'charlie99', verified: false,
    registeredAt: Date.now() - 86400000 * 5, lastLogin: Date.now() - 86400000,
    loginIps: ['203.0.113.42'], devices: ['Chrome / Android'],
    enabled: true, tradingEnabled: false, withdrawalsEnabled: false, riskFlags: ['unverified', 'suspicious_ip'], notes: 'Pending KYC',
    passwordResetPending: false, forceLoggedOut: false,
    balances: [
      { asset: 'USDT', available: '100.00', locked: '0.00' },
    ],
  },
  {
    id: 'u4', email: 'diana@example.com', username: 'diana_whale', verified: true,
    registeredAt: Date.now() - 86400000 * 200, lastLogin: Date.now() - 600000,
    loginIps: ['10.10.10.1', '10.10.10.2'], devices: ['Chrome / Windows', 'Chrome / macOS', 'Safari / iOS'],
    enabled: true, tradingEnabled: true, withdrawalsEnabled: true, riskFlags: [], notes: 'Institutional account',
    passwordResetPending: false, forceLoggedOut: false,
    balances: [
      { asset: 'BTC', available: '42.50000000', locked: '5.00000000' },
      { asset: 'ETH', available: '350.0000', locked: '50.0000' },
      { asset: 'USDT', available: '1250000.00', locked: '200000.00' },
    ],
  },
  {
    id: 'u5', email: 'eve@example.com', username: 'eve_blocked', verified: true,
    registeredAt: Date.now() - 86400000 * 120, lastLogin: Date.now() - 86400000 * 30,
    loginIps: ['198.51.100.1'], devices: ['Chrome / Linux'],
    enabled: false, tradingEnabled: false, withdrawalsEnabled: false, riskFlags: ['fraud_suspected', 'account_locked'], notes: 'Account suspended pending investigation',
    passwordResetPending: false, forceLoggedOut: false,
    balances: [
      { asset: 'BTC', available: '0.85000000', locked: '0.85000000' },
      { asset: 'USDT', available: '15000.00', locked: '15000.00' },
    ],
  },
];

const SEED_ORDERS: MockOrder[] = [
  { id: 'o1', userId: 'u1', pair: 'BTC-USDT', side: 'buy', type: 'limit', price: '94500.00', amount: '0.50000000', filled: '0.00000000', status: 'open', createdAt: Date.now() - 300000, fee: '0.00' },
  { id: 'o2', userId: 'u2', pair: 'BTC-USDT', side: 'sell', type: 'limit', price: '96800.00', amount: '1.00000000', filled: '0.35000000', status: 'partial', createdAt: Date.now() - 600000, fee: '33.88' },
  { id: 'o3', userId: 'u4', pair: 'ETH-USDT', side: 'buy', type: 'limit', price: '3200.00', amount: '10.0000', filled: '10.0000', status: 'filled', createdAt: Date.now() - 3600000, fee: '32.00' },
  { id: 'o4', userId: 'u1', pair: 'ETH-USDT', side: 'sell', type: 'market', price: '3245.50', amount: '5.0000', filled: '5.0000', status: 'filled', createdAt: Date.now() - 7200000, fee: '16.23' },
  { id: 'o5', userId: 'u3', pair: 'BTC-USDT', side: 'buy', type: 'limit', price: '92000.00', amount: '0.10000000', filled: '0.00000000', status: 'cancelled', createdAt: Date.now() - 86400000, fee: '0.00' },
  { id: 'o6', userId: 'u2', pair: 'BTC-USDT', side: 'buy', type: 'stop_limit', price: '97000.00', amount: '2.00000000', filled: '0.00000000', status: 'open', createdAt: Date.now() - 120000, fee: '0.00' },
  { id: 'o7', userId: 'u4', pair: 'BTC-USDT', side: 'sell', type: 'limit', price: '98000.00', amount: '5.00000000', filled: '0.00000000', status: 'open', createdAt: Date.now() - 60000, fee: '0.00' },
];

const SEED_TRADES: MockTrade[] = [
  { id: 't1', orderId: 'o3', userId: 'u4', pair: 'ETH-USDT', side: 'buy', price: '3200.00', amount: '10.0000', fee: '32.00', timestamp: Date.now() - 3600000 },
  { id: 't2', orderId: 'o4', userId: 'u1', pair: 'ETH-USDT', side: 'sell', price: '3245.50', amount: '5.0000', fee: '16.23', timestamp: Date.now() - 7200000 },
  { id: 't3', orderId: 'o2', userId: 'u2', pair: 'BTC-USDT', side: 'sell', price: '96800.00', amount: '0.35000000', fee: '33.88', timestamp: Date.now() - 600000 },
];

const SEED_PAIRS: TradingPairConfig[] = [
  { pair: 'BTC-USDT', baseAsset: 'BTC', quoteAsset: 'USDT', enabled: true, minOrderSize: '0.00010000', maxOrderSize: '100.00000000', tickSize: '0.01', stepSize: '0.00000001', makerFee: '0.10', takerFee: '0.10' },
  { pair: 'ETH-USDT', baseAsset: 'ETH', quoteAsset: 'USDT', enabled: true, minOrderSize: '0.0010', maxOrderSize: '5000.0000', tickSize: '0.01', stepSize: '0.0001', makerFee: '0.10', takerFee: '0.10' },
  { pair: 'SOL-USDT', baseAsset: 'SOL', quoteAsset: 'USDT', enabled: true, minOrderSize: '0.01', maxOrderSize: '50000.00', tickSize: '0.001', stepSize: '0.01', makerFee: '0.10', takerFee: '0.10' },
  { pair: 'DOGE-USDT', baseAsset: 'DOGE', quoteAsset: 'USDT', enabled: false, minOrderSize: '1.00', maxOrderSize: '10000000.00', tickSize: '0.00001', stepSize: '1.00', makerFee: '0.15', takerFee: '0.15' },
];

const SEED_DEPOSITS: Deposit[] = [
  { id: 'dep1', userId: 'u1', asset: 'BTC', amount: '0.50000000', txHash: '0x7a3f...e1d2', status: 'confirmed', timestamp: Date.now() - 3600000 },
  { id: 'dep2', userId: 'u2', asset: 'USDT', amount: '50000.00', txHash: '0x9b2c...f4a8', status: 'confirmed', timestamp: Date.now() - 7200000 },
  { id: 'dep3', userId: 'u4', asset: 'ETH', amount: '10.0000', txHash: '0x1d5e...b3c7', status: 'pending', timestamp: Date.now() - 300000 },
];

const SEED_WITHDRAWALS: Withdrawal[] = [
  { id: 'wd1', userId: 'u1', asset: 'USDT', amount: '10000.00', address: '0x1234...5678', status: 'pending_approval', timestamp: Date.now() - 600000 },
  { id: 'wd2', userId: 'u2', asset: 'BTC', amount: '1.00000000', address: 'bc1q...xyz9', status: 'approved', timestamp: Date.now() - 1800000, reviewedBy: 'admin@nexus.com', reviewedAt: Date.now() - 1700000 },
  { id: 'wd3', userId: 'u4', asset: 'ETH', amount: '25.0000', address: '0xabcd...efgh', status: 'pending_approval', timestamp: Date.now() - 120000 },
  { id: 'wd4', userId: 'u5', asset: 'USDT', amount: '15000.00', address: '0x9876...5432', status: 'rejected', timestamp: Date.now() - 86400000, reviewedBy: 'admin@nexus.com', reviewedAt: Date.now() - 85000000 },
];

const SEED_CMS: CMSContent[] = [
  { id: 'cms1', type: 'announcement', title: 'Welcome to Nexus Exchange', body: 'Trade crypto with institutional-grade tools and zero-fee promotions.', active: true, priority: 'medium', startDate: Date.now() - 86400000 * 7, endDate: null, createdBy: 'admin@nexus.com', createdAt: Date.now() - 86400000 * 7, updatedAt: Date.now() - 86400000 * 7 },
  { id: 'cms2', type: 'banner', title: 'Zero Fee Trading Week', body: 'All BTC-USDT trades are fee-free this week!', active: true, priority: 'high', startDate: Date.now(), endDate: Date.now() + 86400000 * 7, createdBy: 'admin@nexus.com', createdAt: Date.now(), updatedAt: Date.now() },
];

const SESSION_DURATION = 4 * 60 * 60 * 1000; // 4 hours

// ── Admin Accounts (mock) ─────────────────────────────
// In production these would be in a secure database.
export const ADMIN_ACCOUNTS: { email: string; password: string; user: AdminUser }[] = [
  {
    email: 'admin@nexus.com',
    password: 'Admin123!',
    user: {
      id: 'adm1', email: 'admin@nexus.com', name: 'Super Admin',
      role: 'super_admin', twoFactorEnabled: true, lastLogin: Date.now(),
      ipAllowlist: [],
    },
  },
  {
    email: 'operator@nexus.com',
    password: 'Operator123!',
    user: {
      id: 'adm2', email: 'operator@nexus.com', name: 'Operator',
      role: 'operator', twoFactorEnabled: false, lastLogin: Date.now(),
      ipAllowlist: [],
    },
  },
  {
    email: 'finance@nexus.com',
    password: 'Finance123!',
    user: {
      id: 'adm3', email: 'finance@nexus.com', name: 'Finance Manager',
      role: 'finance', twoFactorEnabled: false, lastLogin: Date.now(),
      ipAllowlist: [],
    },
  },
  {
    email: 'viewer@nexus.com',
    password: 'Viewer123!',
    user: {
      id: 'adm4', email: 'viewer@nexus.com', name: 'Read-only Viewer',
      role: 'readonly', twoFactorEnabled: false, lastLogin: Date.now(),
      ipAllowlist: [],
    },
  },
];

let auditCounter = 0;

export const useAdminStore = create<AdminState>()(
  persist(
    (set, get) => ({
      // ── Auth state ──
      isAdminAuthenticated: false,
      adminUser: null,
      adminToken: null,
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

      // ── Data ──
      mockUsers: SEED_USERS,
      mockOrders: SEED_ORDERS,
      mockTrades: SEED_TRADES,
      tradingPairs: SEED_PAIRS,
      campaigns: [],
      cmsContent: SEED_CMS,
      auditLog: [],
      balanceAdjustments: [],
      deposits: SEED_DEPOSITS,
      withdrawals: SEED_WITHDRAWALS,

      // ── Auth actions ──
      adminLogin: (user, token) =>
        set({
          isAdminAuthenticated: true,
          adminUser: { ...user, lastLogin: Date.now() },
          adminToken: token || null,
          sessionExpiry: Date.now() + SESSION_DURATION,
          twoFactorPending: false,
        }),

      adminLogout: () =>
        set({
          isAdminAuthenticated: false,
          adminUser: null,
          adminToken: null,
          sessionExpiry: null,
          twoFactorPending: false,
        }),

      set2FAPending: (pending) => set({ twoFactorPending: pending }),

      // ── System flags ──
      setSystemFlag: (flag, value) =>
        set((s) => ({
          systemFlags: { ...s.systemFlags, [flag]: value },
        })),

      // ── Audit ──
      addAuditEntry: (entry) =>
        set((s) => ({
          auditLog: [
            {
              ...entry,
              id: `audit-${Date.now()}-${++auditCounter}`,
              timestamp: Date.now(),
            },
            ...s.auditLog,
          ].slice(0, 1000), // keep last 1000 entries
        })),

      // ── Users ──
      updateMockUser: (userId, updates) =>
        set((s) => ({
          mockUsers: s.mockUsers.map((u) =>
            u.id === userId ? { ...u, ...updates } : u
          ),
        })),

      // ── Orders ──
      updateMockOrder: (orderId, updates) =>
        set((s) => ({
          mockOrders: s.mockOrders.map((o) =>
            o.id === orderId ? { ...o, ...updates } : o
          ),
        })),

      // ── Trading pairs ──
      updateTradingPair: (pair, updates) =>
        set((s) => ({
          tradingPairs: s.tradingPairs.map((p) =>
            p.pair === pair ? { ...p, ...updates } : p
          ),
        })),

      // ── Campaigns ──
      addCampaign: (campaign) =>
        set((s) => ({ campaigns: [campaign, ...s.campaigns] })),

      updateCampaign: (id, updates) =>
        set((s) => ({
          campaigns: s.campaigns.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),

      deleteCampaign: (id) =>
        set((s) => ({
          campaigns: s.campaigns.filter((c) => c.id !== id),
        })),

      // ── CMS ──
      addCMSContent: (content) =>
        set((s) => ({ cmsContent: [content, ...s.cmsContent] })),

      updateCMSContent: (id, updates) =>
        set((s) => ({
          cmsContent: s.cmsContent.map((c) =>
            c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
          ),
        })),

      deleteCMSContent: (id) =>
        set((s) => ({
          cmsContent: s.cmsContent.filter((c) => c.id !== id),
        })),

      // ── Balance adjustments ──
      addBalanceAdjustment: (adj) =>
        set((s) => ({
          balanceAdjustments: [adj, ...s.balanceAdjustments],
        })),

      // ── Wallet ──
      updateDeposit: (id, updates) =>
        set((s) => ({
          deposits: s.deposits.map((d) =>
            d.id === id ? { ...d, ...updates } : d
          ),
        })),

      updateWithdrawal: (id, updates) =>
        set((s) => ({
          withdrawals: s.withdrawals.map((w) =>
            w.id === id ? { ...w, ...updates } : w
          ),
        })),

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
      partialize: (state) => ({
        isAdminAuthenticated: state.isAdminAuthenticated,
        adminUser: state.adminUser,
        adminToken: state.adminToken,
        sessionExpiry: state.sessionExpiry,
        systemFlags: state.systemFlags,
        mockUsers: state.mockUsers,
        mockOrders: state.mockOrders,
        mockTrades: state.mockTrades,
        tradingPairs: state.tradingPairs,
        campaigns: state.campaigns,
        cmsContent: state.cmsContent,
        auditLog: state.auditLog,
        balanceAdjustments: state.balanceAdjustments,
        deposits: state.deposits,
        withdrawals: state.withdrawals,
      }),
    }
  )
);
