-- Migration: Add deposit fee columns to deposits table
-- Run inside the API container:
--   docker exec -i c4p-postgres psql -U crypto4pro -d crypto4pro < migrations/add_deposit_fee_columns.sql

ALTER TABLE deposits ADD COLUMN IF NOT EXISTS deposit_fee_percent NUMERIC(36,18);
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS deposit_fee NUMERIC(36,18) DEFAULT 0;
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(36,18);
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS expected_net_amount NUMERIC(36,18);
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS base_rate_at_claim NUMERIC(36,18);
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS fiat_payment_method_id VARCHAR(255);
