// ============================================
// Admin API Client — communicates with FastAPI admin endpoints
// Uses Bearer token auth (stored in admin store)
// Separate from user API client (different auth flow)
// ============================================

export class AdminApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'AdminApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function adminRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = path.startsWith('/') ? path : `/${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // httpOnly cookie sent automatically
  });

  if (!res.ok) {
    let detail = 'Unknown error';
    try {
      const body = await res.json();
      if (Array.isArray(body.detail)) {
        detail = body.detail
          .map((item: { msg?: string; loc?: (string | number)[] }) => {
            const field = item.loc?.slice(-1)[0];
            return field ? `${field}: ${item.msg}` : (item.msg || 'Validation error');
          })
          .join('; ');
      } else if (typeof body.detail === 'string') {
        detail = body.detail;
      } else {
        detail = body.message || JSON.stringify(body);
      }
    } catch {
      detail = res.statusText;
    }
    // Only show "session expired" for 401 on non-login endpoints
    if (res.status === 401 && !path.includes('/auth/login')) {
      throw new AdminApiError(401, 'Admin session expired');
    }
    throw new AdminApiError(res.status, detail);
  }

  if (res.status === 204) return {} as T;
  return res.json();
}

// ============================================
// Admin Auth
// ============================================

export interface AdminUserResponse {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  totp_enabled: boolean;
}

export interface AdminLoginResponse {
  admin: AdminUserResponse;
}

export const adminAuthApi = {
  login: (data: { email: string; password: string; totp_code?: string }) =>
    adminRequest<AdminLoginResponse>('/api/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  logout: () =>
    adminRequest<{ ok: boolean }>('/api/admin/auth/logout', {
      method: 'POST',
    }),
};

// ============================================
// Admin Users
// ============================================

export interface AdminUserItem {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
  is_verified: boolean;
  kyc_status: string;
  member_tier: string;
  trading_enabled: boolean;
  withdrawals_enabled: boolean;
  created_at: string;
  last_login_at: string | null;
}

export const adminUsersApi = {
  list: (params?: { search?: string; limit?: number; offset?: number }) => {
    const sp = new URLSearchParams();
    if (params?.search) sp.set('search', params.search);
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.offset) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return adminRequest<{ users: AdminUserItem[]; total: number }>(
      `/api/admin/users${qs ? `?${qs}` : ''}`,
    );
  },

  updateFlags: (userId: string, data: {
    is_active?: boolean;
    trading_enabled?: boolean;
    withdrawals_enabled?: boolean;
    kyc_status?: string;
    member_tier?: string;
  }) =>
    adminRequest<{ ok: boolean; changes: Record<string, unknown> }>(
      `/api/admin/users/${userId}`,
      { method: 'PATCH', body: JSON.stringify(data) },
    ),

  credit: (userId: string, data: { asset: string; amount: string; reason: string }) =>
    adminRequest<{ ok: boolean; amount: string; asset: string }>(
      `/api/admin/users/${userId}/credit`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  debit: (userId: string, data: { asset: string; amount: string; reason: string }) =>
    adminRequest<{ ok: boolean; amount: string; asset: string }>(
      `/api/admin/users/${userId}/debit`,
      { method: 'POST', body: JSON.stringify(data) },
    ),
};

// ============================================
// Admin Campaigns
// ============================================

export interface AdminCampaignItem {
  id: string;
  name: string;
  description: string;
  campaign_type: string;
  status: string;
  start_date: string;
  end_date: string;
  target_segment: string;
  reward_amount: string;
  reward_asset: string;
  percent_based: boolean;
  max_per_user: string;
  min_requirement: string;
  total_budget: string;
  spent_budget: string;
  applicable_pairs: string[] | null;
  daily_cap: string;
  total_cap: string;
  auto_apply: boolean;
  one_time_only: boolean;
  participant_count: number;
  claimed_count: number;
}

export interface CreateCampaignData {
  name: string;
  description: string;
  campaign_type: string;
  start_date: string;
  end_date: string;
  target_segment: string;
  reward_amount: string;
  reward_asset: string;
  percent_based: boolean;
  max_per_user: string;
  min_requirement: string;
  total_budget: string;
  applicable_pairs: string[];
  daily_cap: string;
  total_cap: string;
  auto_apply: boolean;
  one_time_only: boolean;
}

export const adminCampaignsApi = {
  list: () =>
    adminRequest<{ campaigns: AdminCampaignItem[] }>('/api/admin/campaigns'),

  create: (data: CreateCampaignData) =>
    adminRequest<AdminCampaignItem>('/api/admin/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<CreateCampaignData> & { status?: string }) =>
    adminRequest<AdminCampaignItem>(`/api/admin/campaigns/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    adminRequest<{ ok: boolean }>(`/api/admin/campaigns/${id}`, {
      method: 'DELETE',
    }),
};

// ============================================
// Admin CMS
// ============================================

export interface AdminCMSItem {
  id: string;
  content_type: string;
  title: string;
  body: string | null;
  priority: string;
  is_active: boolean;
  start_date: string;
  end_date: string | null;
  created_at: string;
}

export interface CreateCMSData {
  content_type: string;
  title: string;
  body?: string;
  priority: string;
  is_active: boolean;
  start_date: string;
  end_date?: string;
}

export const adminCMSApi = {
  list: () =>
    adminRequest<{ content: AdminCMSItem[] }>('/api/admin/cms'),

  create: (data: CreateCMSData) =>
    adminRequest<AdminCMSItem>('/api/admin/cms', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<CreateCMSData>) =>
    adminRequest<AdminCMSItem>(`/api/admin/cms/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    adminRequest<{ ok: boolean }>(`/api/admin/cms/${id}`, {
      method: 'DELETE',
    }),
};

// ============================================
// Admin System Flags
// ============================================

export const adminFlagsApi = {
  get: () =>
    adminRequest<{ flags: Record<string, boolean> }>('/api/admin/flags'),

  update: (key: string, value: boolean) =>
    adminRequest<{ ok: boolean; key: string; value: boolean }>(
      `/api/admin/flags/${key}`,
      { method: 'PATCH', body: JSON.stringify({ value }) },
    ),
};

// ============================================
// Admin Markets
// ============================================

export interface AdminPairItem {
  id: string;
  symbol: string;
  base_asset: string;
  quote_asset: string;
  price_precision: number;
  quantity_precision: number;
  tick_size: string;
  step_size: string;
  min_order_size: string;
  max_order_size: string;
  min_notional: string;
  maker_fee: string;
  taker_fee: string;
  is_enabled: boolean;
}

export const adminMarketsApi = {
  list: () =>
    adminRequest<{ pairs: AdminPairItem[] }>('/api/admin/markets'),

  update: (pairId: string, data: {
    is_enabled?: boolean;
    min_order_size?: string;
    max_order_size?: string;
    min_notional?: string;
    maker_fee?: string;
    taker_fee?: string;
    tick_size?: string;
    step_size?: string;
  }) =>
    adminRequest<{ ok: boolean; symbol: string; changes: Record<string, string> }>(
      `/api/admin/markets/${pairId}`,
      { method: 'PATCH', body: JSON.stringify(data) },
    ),
};

// ============================================
// Admin Audit Logs
// ============================================

export interface AuditLogItem {
  id: number;
  admin_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export const adminLogsApi = {
  list: (params?: { action?: string; target_type?: string; limit?: number; offset?: number }) => {
    const sp = new URLSearchParams();
    if (params?.action) sp.set('action', params.action);
    if (params?.target_type) sp.set('target_type', params.target_type);
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.offset) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return adminRequest<{ logs: AuditLogItem[]; total: number }>(
      `/api/admin/logs${qs ? `?${qs}` : ''}`,
    );
  },
};

// ============================================
// Admin KYC
// ============================================

export interface KYCDocItem {
  id: string;
  document_type: string;
  status: string;
  rejection_reason: string | null;
  original_filename?: string | null;
  created_at: string | null;
}

export interface KYCRequestItem {
  user_id: string;
  email: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  kyc_status: string;
  created_at: string | null;
  documents: KYCDocItem[];
}

export const adminKYCApi = {
  list: (params?: { status?: string; limit?: number; offset?: number }) => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set('status', params.status);
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.offset) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return adminRequest<{ requests: KYCRequestItem[]; total: number }>(
      `/api/admin/kyc/requests${qs ? `?${qs}` : ''}`,
    );
  },

  getDetail: (userId: string) =>
    adminRequest<KYCRequestItem>(`/api/admin/kyc/requests/${userId}`),

  getDocumentUrl: (docId: string) =>
    `/api/admin/kyc/document/${docId}/image`,

  approve: (userId: string) =>
    adminRequest<{ ok: boolean; message: string; kyc_status: string }>(
      `/api/admin/kyc/${userId}/approve`,
      { method: 'POST' },
    ),

  reject: (userId: string, reason: string) =>
    adminRequest<{ ok: boolean; message: string; kyc_status: string }>(
      `/api/admin/kyc/${userId}/reject`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    ),
};

// ============================================
// Admin Staking API
// ============================================

export interface AdminStakingPeriod {
  id: string;
  label: string;
  duration_days: number;
  reward_percent: string;
  is_active: boolean;
  sort_order: number;
}

export interface AdminStakingProduct {
  id: string;
  asset: string;
  name: string;
  description: string | null;
  min_stake: string | null;
  is_active: boolean;
  sort_order: number;
  periods: AdminStakingPeriod[];
  created_at: string;
}

export const adminStakingApi = {
  listProducts: () =>
    adminRequest<{ products: AdminStakingProduct[] }>('/api/admin/staking/products'),

  createProduct: (data: {
    asset: string;
    name: string;
    description?: string;
    min_stake?: string;
    is_active?: boolean;
    sort_order?: number;
    periods: Array<{
      label: string;
      duration_days: number;
      reward_percent: string;
      is_active?: boolean;
      sort_order?: number;
    }>;
  }) =>
    adminRequest<AdminStakingProduct>('/api/admin/staking/products', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateProduct: (id: string, data: Partial<{
    asset: string;
    name: string;
    description: string;
    min_stake: string;
    is_active: boolean;
    sort_order: number;
    periods: Array<{
      label: string;
      duration_days: number;
      reward_percent: string;
      is_active?: boolean;
      sort_order?: number;
    }>;
  }>) =>
    adminRequest<AdminStakingProduct>(`/api/admin/staking/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deactivateProduct: (id: string) =>
    adminRequest<{ ok: boolean }>(`/api/admin/staking/products/${id}`, {
      method: 'DELETE',
    }),
};

// ============================================
// Admin Withdrawals
// ============================================

export interface AdminWithdrawalItem {
  id: string;
  user_id: string;
  asset: string;
  network: string;
  amount: string;
  fee: string;
  to_address: string;
  status: string;
  requires_multi_approval: boolean;
  approvals_required: number;
  approvals_received: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  tx_hash: string | null;
  pay4pro_withdrawal_id: string | null;
  request_ip: string | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface AdminWithdrawalApprovalItem {
  id: string;
  admin_id: string;
  action: string;
  comment: string | null;
  ip_address: string | null;
  created_at: string | null;
}

export const adminWithdrawalsApi = {
  listPending: () =>
    adminRequest<{ withdrawals: AdminWithdrawalItem[]; total: number }>(
      '/api/admin/withdrawals/pending',
    ),

  list: (params?: { status?: string; limit?: number; offset?: number }) => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set('status', params.status);
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.offset) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return adminRequest<{ withdrawals: AdminWithdrawalItem[]; total: number }>(
      `/api/admin/withdrawals${qs ? `?${qs}` : ''}`,
    );
  },

  getDetail: (withdrawalId: string) =>
    adminRequest<{ withdrawal: AdminWithdrawalItem; approvals: AdminWithdrawalApprovalItem[] }>(
      `/api/admin/withdrawals/${withdrawalId}`,
    ),

  approve: (withdrawalId: string, data?: { comment?: string; totp_code?: string }) =>
    adminRequest<{ ok: boolean; withdrawal: AdminWithdrawalItem; message: string }>(
      `/api/admin/withdrawals/${withdrawalId}/approve`,
      { method: 'POST', body: JSON.stringify(data || {}) },
    ),

  reject: (withdrawalId: string, reason: string) =>
    adminRequest<{ ok: boolean; withdrawal: AdminWithdrawalItem }>(
      `/api/admin/withdrawals/${withdrawalId}/reject`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    ),

  settle: (withdrawalId: string, tx_hash?: string) =>
    adminRequest<{ ok: boolean; withdrawal: AdminWithdrawalItem }>(
      `/api/admin/withdrawals/${withdrawalId}/settle`,
      { method: 'POST', body: JSON.stringify({ tx_hash }) },
    ),

  getStats: () =>
    adminRequest<{
      pending_count: number;
      today_approved_total: string;
      multi_approval_threshold: string;
      daily_limit_per_user: string;
    }>('/api/admin/withdrawals/stats/summary'),
};

// ============================================
// Admin Deposits
// ============================================

export interface AdminDepositItem {
  id: string;
  user_id: string;
  asset: string;
  network: string;
  amount: string;
  tx_hash: string | null;
  from_address: string | null;
  confirmations: number;
  required_confirmations: number;
  status: string;
  pay4pro_deposit_id: string | null;
  created_at: string | null;
  completed_at: string | null;
}

export const adminDepositsApi = {
  list: (params?: { user_id?: string; status?: string; limit?: number; offset?: number }) => {
    const sp = new URLSearchParams();
    if (params?.user_id) sp.set('user_id', params.user_id);
    if (params?.status) sp.set('status', params.status);
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.offset) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return adminRequest<{ deposits: AdminDepositItem[]; total: number }>(
      `/api/admin/wallets/deposits${qs ? `?${qs}` : ''}`,
    );
  },

  stats: () =>
    adminRequest<{
      pending_count: number;
      today_completed_total: string;
      total_completed_count: number;
    }>('/api/admin/wallets/deposits/stats'),
};

// ============================================
// Admin Launchpad
// ============================================

export interface AdminLaunchpadSale {
  id: string;
  token_symbol: string;
  name: string;
  description: string | null;
  price_usdt: string;
  total_allocation: string;
  sold_amount: string;
  remaining: string;
  min_purchase_usdt: string;
  max_purchase_usdt: string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string | null;
}

export const adminLaunchpadApi = {
  listSales: () =>
    adminRequest<{ sales: AdminLaunchpadSale[] }>('/api/admin/launchpad/sales'),

  createSale: (data: {
    token_symbol: string;
    name: string;
    description?: string;
    price_usdt: string;
    total_allocation: string;
    min_purchase_usdt?: string;
    max_purchase_usdt?: string;
    is_active?: boolean;
    starts_at?: string;
    ends_at?: string;
  }) =>
    adminRequest<{ ok: boolean; sale: AdminLaunchpadSale }>('/api/admin/launchpad/sales', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSale: (id: string, data: Partial<{
    name: string;
    description: string;
    price_usdt: string;
    total_allocation: string;
    min_purchase_usdt: string;
    max_purchase_usdt: string;
    is_active: boolean;
    starts_at: string;
    ends_at: string;
  }>) =>
    adminRequest<{ ok: boolean; sale: AdminLaunchpadSale }>(`/api/admin/launchpad/sales/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

// ============================================
// Admin P2P
// ============================================

export interface AdminP2PAd {
  id: string;
  user_id: string;
  side: string;
  asset: string;
  fiat_currency: string;
  price: string;
  min_amount: string;
  max_amount: string;
  payment_method: string;
  status: string;
  created_at: string;
}

export interface AdminP2POrder {
  id: string;
  ad_id: string;
  buyer_id: string;
  seller_id: string;
  asset: string;
  amount: string;
  price: string;
  total_fiat: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export const adminP2pApi = {
  listAds: (params?: { status?: string; limit?: number; offset?: number }) => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set('status', params.status);
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.offset) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return adminRequest<{ ads: AdminP2PAd[]; total: number }>(
      `/api/admin/p2p/ads${qs ? `?${qs}` : ''}`,
    );
  },

  deactivateAd: (adId: string) =>
    adminRequest<{ ok: boolean }>(`/api/admin/p2p/ads/${adId}/deactivate`, { method: 'POST' }),

  listOrders: (params?: { status?: string; limit?: number; offset?: number }) => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set('status', params.status);
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.offset) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return adminRequest<{ orders: AdminP2POrder[]; total: number }>(
      `/api/admin/p2p/orders${qs ? `?${qs}` : ''}`,
    );
  },
};

// ============================================
// Admin Referral
// ============================================

export const adminReferralApi = {
  getStats: () =>
    adminRequest<{
      total_referred_users: number;
      top_referrers: Array<{ username: string; referral_code: string; referrals: number }>;
    }>('/api/admin/referral/stats'),
};

// ============================================
// Admin Options
// ============================================

export interface AdminOptionPosition {
  id: string;
  user_id: string;
  asset: string;
  option_type: string;
  strike_price: string;
  premium_usdt: string;
  quantity: string;
  expiry_at: string;
  status: string;
  opened_at: string | null;
}

export const adminOptionsApi = {
  listOpenPositions: () =>
    adminRequest<{ positions: AdminOptionPosition[]; total: number }>(
      '/api/admin/options/positions',
    ),
};
