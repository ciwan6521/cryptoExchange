-- Pay4Pro Integration — add columns for Pay4Pro references
-- Run this BEFORE deploying the new code
-- Idempotent: uses IF NOT EXISTS / safe checks

-- 1. wallets.external_wallet_id — stores Pay4Pro user_id reference
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'wallets' AND column_name = 'external_wallet_id'
    ) THEN
        ALTER TABLE wallets ADD COLUMN external_wallet_id VARCHAR(255);
        CREATE INDEX idx_wallets_external_wallet_id ON wallets(external_wallet_id);
    END IF;
END $$;

-- 2. deposits.pay4pro_deposit_id — stores Pay4Pro transaction_id for idempotency
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deposits' AND column_name = 'pay4pro_deposit_id'
    ) THEN
        ALTER TABLE deposits ADD COLUMN pay4pro_deposit_id VARCHAR(255) UNIQUE;
    END IF;
END $$;

-- 3. withdrawals.pay4pro_withdrawal_id — stores Pay4Pro withdraw_id/transaction_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'withdrawals' AND column_name = 'pay4pro_withdrawal_id'
    ) THEN
        ALTER TABLE withdrawals ADD COLUMN pay4pro_withdrawal_id VARCHAR(255) UNIQUE;
    END IF;
END $$;
