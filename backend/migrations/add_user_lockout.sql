-- Migration: Add login lockout columns to users table
-- Run inside the DB container:
--   docker exec -i c4p-postgres psql -U crypto4pro -d crypto4pro_exchange < /var/www/crypto4pro/backend/migrations/add_user_lockout.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
