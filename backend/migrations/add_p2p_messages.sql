-- P2P order messages + dispute status support
ALTER TABLE p2p_orders ADD COLUMN IF NOT EXISTS dispute_reason TEXT;

CREATE TABLE IF NOT EXISTS p2p_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES p2p_orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_p2p_messages_order_id ON p2p_messages(order_id);
