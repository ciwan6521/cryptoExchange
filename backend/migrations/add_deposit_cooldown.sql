-- Migration: Add deposit_cooldown_until column to users table
-- Run inside the DB container:
--   docker exec -i c4p-postgres psql -U crypto4pro -d crypto4pro_exchange < /var/www/crypto4pro/backend/migrations/add_deposit_cooldown.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS deposit_cooldown_until TIMESTAMPTZ;
