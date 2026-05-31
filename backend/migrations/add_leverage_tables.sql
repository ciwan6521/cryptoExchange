-- Leverage / futures positions
CREATE TABLE IF NOT EXISTS leverage_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    symbol VARCHAR(20) NOT NULL,
    base_asset VARCHAR(20) NOT NULL,
    quote_asset VARCHAR(20) NOT NULL DEFAULT 'USDT',
    side VARCHAR(10) NOT NULL,
    leverage INTEGER NOT NULL,
    margin_usdt NUMERIC(36, 18) NOT NULL,
    notional_usdt NUMERIC(36, 18) NOT NULL,
    quantity NUMERIC(36, 18) NOT NULL,
    entry_price NUMERIC(36, 18) NOT NULL,
    liquidation_price NUMERIC(36, 18) NOT NULL,
    close_price NUMERIC(36, 18),
    realized_pnl NUMERIC(36, 18),
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    opened_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leverage_positions_user_id ON leverage_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_leverage_positions_symbol ON leverage_positions(symbol);
CREATE INDEX IF NOT EXISTS idx_leverage_positions_status ON leverage_positions(status);
