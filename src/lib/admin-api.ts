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
      detail = body.detail || body.message || JSON.stringify(body);
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

// ============================================
// Admin Deposit Methods
// ============================================

export interface DepositMethodItem {
  id: string;
  method_type: 'crypto_wallet' | 'bank_transfer';
  label: string;
  asset: string | null;
  network: string | null;
  address: string | null;
  memo_tag: string | null;
  bank_name: string | null;
  account_holder: string | null;
  iban: string | null;
  swift_code: string | null;
  currency: string | null;
  reference_note: string | null;
  notes: string | null;
  min_amount: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string | null;
}

export interface DepositMethodCreateData {
  method_type: 'crypto_wallet' | 'bank_transfer';
  label: string;
  asset?: string;
  network?: string;
  address?: string;
  memo_tag?: string;
  bank_name?: string;
  account_holder?: string;
  iban?: string;
  swift_code?: string;
  currency?: string;
  reference_note?: string;
  notes?: string;
  min_amount?: string;
  is_active?: boolean;
  sort_order?: number;
}

export const adminDepositMethodsApi = {
  list: () =>
    adminRequest<{ methods: DepositMethodItem[] }>('/api/admin/deposit-methods'),

  create: (data: DepositMethodCreateData) =>
    adminRequest<DepositMethodItem>('/api/admin/deposit-methods', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<DepositMethodCreateData>) =>
    adminRequest<{ ok: boolean; method: DepositMethodItem }>(
      `/api/admin/deposit-methods/${id}`,
      { method: 'PATCH', body: JSON.stringify(data) },
    ),

  delete: (id: string) =>
    adminRequest<{ ok: boolean }>(`/api/admin/deposit-methods/${id}`, {
      method: 'DELETE',
    }),
};

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
