// ============================================
// API Client — communicates with FastAPI backend
// All requests go through Next.js rewrite proxy (same-origin)
// Auth tokens are in httpOnly cookies — never touched by JS
// ============================================

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = path.startsWith('/') ? path : `/${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include', // Send httpOnly cookies
  });

  // Handle 401 — try refresh once
  if (res.status === 401 && !path.includes('/auth/refresh') && !path.includes('/auth/login')) {
    const refreshed = await refreshToken();
    if (refreshed) {
      // Retry original request
      const retryRes = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        credentials: 'include',
      });
      if (retryRes.ok) {
        return retryRes.json();
      }
    }
    throw new ApiError(401, 'Session expired');
  }

  if (!res.ok) {
    let detail = 'Unknown error';
    try {
      const body = await res.json();
      detail = body.detail || body.message || JSON.stringify(body);
    } catch {
      detail = res.statusText;
    }
    throw new ApiError(res.status, detail);
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return {} as T;
  }

  return res.json();
}

async function refreshToken(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ============================================
// Auth API
// ============================================

export interface UserResponse {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
  is_verified: boolean;
  email_verified: boolean;
  kyc_status: string;
  member_tier: string;
  trading_enabled: boolean;
  withdrawals_enabled: boolean;
  totp_enabled: boolean;
  created_at: string;
}

export interface SessionItem {
  id: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  is_current: boolean;
}

export const authApi = {
  register: (data: { email: string; username: string; password: string }) =>
    request<UserResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string; totp_code?: string }) =>
    request<UserResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  me: () => request<UserResponse>('/api/auth/me'),

  logout: () =>
    request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  refresh: () =>
    request<UserResponse>('/api/auth/refresh', { method: 'POST' }),

  forgotPassword: (email: string) =>
    request<{ ok: boolean; message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    request<{ ok: boolean; message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),

  changePassword: (current_password: string, new_password: string) =>
    request<{ ok: boolean; message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),

  updateProfile: (data: { username?: string }) =>
    request<UserResponse>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getSessions: () =>
    request<{ sessions: SessionItem[] }>('/api/auth/sessions'),

  revokeSession: (sessionId: string) =>
    request<{ ok: boolean }>(`/api/auth/sessions/${sessionId}`, { method: 'DELETE' }),

  sendVerification: () =>
    request<{ ok: boolean; message: string }>('/api/auth/send-verification', { method: 'POST' }),

  verifyEmail: (token: string) =>
    request<{ ok: boolean; message: string }>(`/api/auth/verify-email?token=${token}`, { method: 'POST' }),

  setup2FA: () =>
    request<{ secret: string; provisioning_uri: string }>('/api/auth/2fa/setup', { method: 'POST' }),

  enable2FA: (code: string) =>
    request<{ ok: boolean; message: string }>(`/api/auth/2fa/enable?code=${code}`, { method: 'POST' }),

  disable2FA: (code: string, password: string) =>
    request<{ ok: boolean; message: string }>(`/api/auth/2fa/disable?code=${code}&password=${encodeURIComponent(password)}`, { method: 'POST' }),
};

// ============================================
// Balance API
// ============================================

export interface BalanceItem {
  asset: string;
  available: string;
  locked: string;
}

export const balanceApi = {
  getAll: () =>
    request<{ balances: BalanceItem[] }>('/api/balances'),
};

// ============================================
// Ledger API
// ============================================

export interface LedgerEntry {
  id: number;
  tx_id: string;
  asset: string;
  entry_type: 'credit' | 'debit';
  amount: string;
  balance_after: string;
  category: string;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

export const ledgerApi = {
  getHistory: (params?: { asset?: string; category?: string; limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.asset) searchParams.set('asset', params.asset);
    if (params?.category) searchParams.set('category', params.category);
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();
    return request<{ entries: LedgerEntry[]; total: number }>(
      `/api/ledger/history${qs ? `?${qs}` : ''}`,
    );
  },
};

// ============================================
// Campaign API
// ============================================

export interface CampaignItem {
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

export interface CampaignClaimItem {
  id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  trigger_event: string;
  reward_amount: string;
  reward_asset: string;
  claimed_at: string | null;
}

export const campaignApi = {
  getActive: () =>
    request<{ campaigns: CampaignItem[] }>('/api/campaigns/active'),

  getMyClaims: () =>
    request<{ claims: CampaignClaimItem[] }>('/api/campaigns/my-claims'),
};

// ============================================
// Market / Public API
// ============================================

export interface TradingPairConfig {
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

export interface SystemFlags {
  trading_enabled: boolean;
  new_orders_enabled: boolean;
  deposits_enabled: boolean;
  withdrawals_enabled: boolean;
  maintenance_mode: boolean;
  registration_enabled: boolean;
}

export const marketApi = {
  getPairs: () =>
    request<{ pairs: TradingPairConfig[] }>('/api/market/pairs'),

  getFlags: () =>
    request<{ flags: SystemFlags }>('/api/market/flags'),
};

// ============================================
// Trading Read API
// ============================================

export interface OrderbookLevel {
  price: string;
  quantity: string;
  total: string;
  order_count: number;
}

export interface OrderbookResponse {
  symbol: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  bid_count: number;
  ask_count: number;
}

export interface TradeItem {
  id: string;
  price: string;
  quantity: string;
  quote_quantity: string;
  side: 'buy' | 'sell';
  executed_at: string;
}

export interface OrderItem {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  order_type: string;
  status: string;
  price: string | null;
  stop_price: string | null;
  quantity: string;
  filled_quantity: string;
  remaining: string;
  fee_asset: string | null;
  fee_total: string;
  created_at: string;
  updated_at: string;
  filled_at: string | null;
  cancelled_at: string | null;
}

export interface UserTradeItem {
  id: string;
  symbol: string;
  side: string;
  price: string;
  quantity: string;
  quote_quantity: string;
  maker_fee: string;
  taker_fee: string;
  executed_at: string;
  role: 'maker' | 'taker';
}

export const tradingApi = {
  /** Public: aggregated order book for a symbol */
  getOrderbook: (symbol: string, limit = 25) =>
    request<OrderbookResponse>(`/api/trading/orderbook/${encodeURIComponent(symbol)}?limit=${limit}`),

  /** Public: recent executed trades for a symbol */
  getRecentTrades: (symbol: string, limit = 50) =>
    request<{ symbol: string; trades: TradeItem[] }>(
      `/api/trading/trades/${encodeURIComponent(symbol)}?limit=${limit}`,
    ),

  /** Auth: current user's open orders */
  getOpenOrders: (symbol?: string) => {
    const params = new URLSearchParams();
    if (symbol) params.set('symbol', symbol);
    const qs = params.toString();
    return request<{ orders: OrderItem[]; total: number }>(
      `/api/trading/orders/open${qs ? `?${qs}` : ''}`,
    );
  },

  /** Auth: current user's order history (all statuses) */
  getOrderHistory: (params?: { symbol?: string; limit?: number; offset?: number }) => {
    const sp = new URLSearchParams();
    if (params?.symbol) sp.set('symbol', params.symbol);
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.offset) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return request<{ orders: OrderItem[]; total: number }>(
      `/api/trading/orders/history${qs ? `?${qs}` : ''}`,
    );
  },

  /** Auth: current user's executed trades */
  getMyTrades: (params?: { symbol?: string; limit?: number; offset?: number }) => {
    const sp = new URLSearchParams();
    if (params?.symbol) sp.set('symbol', params.symbol);
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.offset) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return request<{ trades: UserTradeItem[]; total: number }>(
      `/api/trading/trades/my${qs ? `?${qs}` : ''}`,
    );
  },
};

// ============================================
// Orders API (place + cancel)
// ============================================

export interface PlaceOrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  order_type: 'limit' | 'market';
  quantity: string;
  price?: string;
}

export interface PlaceOrderResponse {
  ok: boolean;
  order: OrderItem;
  fills: TradeItem[];
  fills_count: number;
}

export const ordersApi = {
  place: (data: PlaceOrderRequest) =>
    request<PlaceOrderResponse>('/api/orders/place', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  cancel: (orderId: string) =>
    request<{ ok: boolean; order: OrderItem }>(`/api/orders/${orderId}/cancel`, {
      method: 'POST',
    }),
};

// ============================================
// Withdrawal API
// ============================================

export interface WithdrawalItem {
  id: string;
  asset: string;
  network: string;
  amount: string;
  fee: string;
  to_address: string;
  status: string;
  requires_multi_approval: boolean;
  approvals_required: number;
  approvals_received: number;
  tx_hash: string | null;
  rejection_reason: string | null;
  created_at: string | null;
  completed_at: string | null;
}

export interface WithdrawalAddressItem {
  id: string;
  asset: string;
  network: string;
  address: string;
  label: string | null;
  is_whitelisted: boolean;
  is_available: boolean;
  cooldown_until: string;
  first_added_at: string;
}

export const withdrawalApi = {
  request: (data: { asset: string; network: string; amount: string; to_address: string }) =>
    request<{ ok: boolean; withdrawal: WithdrawalItem; message: string; flagged: boolean }>(
      '/api/withdrawals/request',
      { method: 'POST', body: JSON.stringify(data) },
    ),

  cancel: (withdrawalId: string) =>
    request<{ ok: boolean; withdrawal: WithdrawalItem }>(
      `/api/withdrawals/${withdrawalId}/cancel`,
      { method: 'POST' },
    ),

  getHistory: (params?: { status?: string; limit?: number; offset?: number }) => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set('status', params.status);
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.offset) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return request<{ withdrawals: WithdrawalItem[]; total: number }>(
      `/api/withdrawals/my${qs ? `?${qs}` : ''}`,
    );
  },

  getAddresses: () =>
    request<{ addresses: WithdrawalAddressItem[] }>('/api/withdrawals/addresses'),

  addAddress: (data: { asset: string; network: string; address: string; label?: string }) =>
    request<{ ok: boolean; message: string; cooldown_until: string }>(
      '/api/withdrawals/addresses',
      { method: 'POST', body: JSON.stringify(data) },
    ),
};

// ============================================
// Deposit API
// ============================================

export interface DepositItem {
  id: string;
  asset: string;
  network: string;
  amount: string;
  tx_hash: string | null;
  from_address: string | null;
  confirmations: number;
  required_confirmations: number;
  status: string;
  created_at: string | null;
  completed_at: string | null;
}

export interface DepositNetwork {
  asset: string;
  network: string;
  name: string;
  min_deposit: string;
  confirmations_required: number;
  estimated_time: string;
}

export const depositApi = {
  getAddress: (asset = 'USDT', network = 'BSC') =>
    request<{ address: string; asset: string; network: string }>(
      `/api/deposits/address`,
    ),

  getHistory: (params?: { status?: string; limit?: number; offset?: number }) => {
    const sp = new URLSearchParams();
    if (params?.status) sp.set('status', params.status);
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.offset) sp.set('offset', String(params.offset));
    const qs = sp.toString();
    return request<{ deposits: DepositItem[]; total: number }>(
      `/api/deposits/my${qs ? `?${qs}` : ''}`,
    );
  },

  getNetworks: () =>
    request<{ networks: DepositNetwork[] }>('/api/deposits/networks'),
};

// ============================================
// CMS API
// ============================================

export const cmsApi = {
  getActive: () =>
    request<{ content: Array<{
      id: string;
      type: string;
      title: string;
      body: string | null;
      priority: string;
      start_date: string;
      end_date: string | null;
    }> }>('/api/cms/active'),
};

// ============================================
// Wallet API
// ============================================

export interface WalletAsset {
  symbol: string;
  name: string;
  available: string;
  locked: string;
  total: string;
  price_usd: string | null;
  value_usd: string | null;
}

export interface WalletResponse {
  assets: WalletAsset[];
  total_value_usd: string | null;
}

export interface MarketPrices {
  prices: Record<string, string | null>;
}

export interface TickerData {
  price: string;
  change: string;
  high: string;
  low: string;
  volume: string;
  quoteVolume: string;
}

export interface TickersResponse {
  tickers: Record<string, TickerData>;
}

export const marketDataApi = {
  getKlines: (symbol: string, interval: string, limit = 300) =>
    request<{ symbol: string; interval: string; candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> }>(
      `/api/market/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`,
    ),
};

export const walletApi = {
  getWallet: () =>
    request<WalletResponse>('/api/wallet/me'),

  getPrices: () =>
    request<MarketPrices>('/api/market/prices'),

  getTickers: () =>
    request<TickersResponse>('/api/market/tickers'),
};
