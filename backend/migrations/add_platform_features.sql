-- Referral fields on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_user_id UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by_user_id);

-- User API keys
CREATE TABLE IF NOT EXISTS user_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    label VARCHAR(100) NOT NULL,
    key_prefix VARCHAR(16) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    permissions VARCHAR(100) NOT NULL DEFAULT 'read,trade',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_prefix ON user_api_keys(key_prefix);

-- Notification preferences
CREATE TABLE IF NOT EXISTS user_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id),
    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    trades_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    price_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    news_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    security_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    language VARCHAR(5) NOT NULL DEFAULT 'en',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Price alerts
CREATE TABLE IF NOT EXISTS price_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    asset VARCHAR(20) NOT NULL,
    condition VARCHAR(10) NOT NULL,
    target_price NUMERIC(36, 18) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_price_alerts_user_id ON price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_active ON price_alerts(is_active);

-- Launchpad
CREATE TABLE IF NOT EXISTS launchpad_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_symbol VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price_usdt NUMERIC(36, 18) NOT NULL,
    total_allocation NUMERIC(36, 18) NOT NULL,
    sold_amount NUMERIC(36, 18) NOT NULL DEFAULT 0,
    min_purchase_usdt NUMERIC(36, 18) NOT NULL DEFAULT 10,
    max_purchase_usdt NUMERIC(36, 18) NOT NULL DEFAULT 10000,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS launchpad_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    sale_id UUID NOT NULL REFERENCES launchpad_sales(id),
    amount_usdt NUMERIC(36, 18) NOT NULL,
    tokens NUMERIC(36, 18) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'completed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_launchpad_purchases_user ON launchpad_purchases(user_id);

-- P2P
CREATE TABLE IF NOT EXISTS p2p_ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    side VARCHAR(4) NOT NULL,
    asset VARCHAR(20) NOT NULL,
    fiat_currency VARCHAR(10) NOT NULL DEFAULT 'TRY',
    price NUMERIC(36, 18) NOT NULL,
    min_amount NUMERIC(36, 18) NOT NULL,
    max_amount NUMERIC(36, 18) NOT NULL,
    payment_method VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_p2p_ads_status ON p2p_ads(status);

CREATE TABLE IF NOT EXISTS p2p_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_id UUID NOT NULL REFERENCES p2p_ads(id),
    buyer_id UUID NOT NULL REFERENCES users(id),
    seller_id UUID NOT NULL REFERENCES users(id),
    asset VARCHAR(20) NOT NULL,
    amount NUMERIC(36, 18) NOT NULL,
    price NUMERIC(36, 18) NOT NULL,
    total_fiat NUMERIC(36, 18) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_p2p_orders_buyer ON p2p_orders(buyer_id);

-- Options
CREATE TABLE IF NOT EXISTS option_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    asset VARCHAR(20) NOT NULL,
    option_type VARCHAR(4) NOT NULL,
    strike_price NUMERIC(36, 18) NOT NULL,
    premium_usdt NUMERIC(36, 18) NOT NULL,
    quantity NUMERIC(36, 18) NOT NULL,
    expiry_at TIMESTAMPTZ NOT NULL,
    entry_mark NUMERIC(36, 18) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    realized_pnl NUMERIC(36, 18),
    opened_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_option_positions_user ON option_positions(user_id);

-- Seed T4PRO launchpad sale if not exists
INSERT INTO launchpad_sales (token_symbol, name, description, price_usdt, total_allocation, min_purchase_usdt, max_purchase_usdt, is_active)
SELECT 'T4PRO', 'T4Pro Token Public Sale', 'Official T4PRO token sale on Crypto4Pro launchpad',
       0.05, 50000000, 10, 25000, TRUE
WHERE NOT EXISTS (SELECT 1 FROM launchpad_sales WHERE token_symbol = 'T4PRO');
