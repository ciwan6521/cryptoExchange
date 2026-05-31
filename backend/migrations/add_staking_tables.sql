-- Staking / coin lock tables
-- Run: docker exec -i c4p-postgres psql -U crypto4pro -d crypto4pro_exchange < backend/migrations/add_staking_tables.sql

CREATE TABLE IF NOT EXISTS staking_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    min_stake NUMERIC(36, 18),
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staking_products_asset ON staking_products(asset);

CREATE TABLE IF NOT EXISTS staking_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES staking_products(id) ON DELETE CASCADE,
    label VARCHAR(50) NOT NULL,
    duration_days INTEGER NOT NULL,
    reward_percent NUMERIC(10, 4) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staking_periods_product ON staking_periods(product_id);

CREATE TABLE IF NOT EXISTS staking_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    product_id UUID NOT NULL REFERENCES staking_products(id),
    period_id UUID NOT NULL REFERENCES staking_periods(id),
    asset VARCHAR(20) NOT NULL,
    amount NUMERIC(36, 18) NOT NULL,
    reward_percent NUMERIC(10, 4) NOT NULL,
    expected_reward NUMERIC(36, 18) NOT NULL,
    period_label VARCHAR(50) NOT NULL,
    duration_days INTEGER NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    unlock_at TIMESTAMPTZ NOT NULL,
    claimed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staking_positions_user ON staking_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_staking_positions_status ON staking_positions(status);
