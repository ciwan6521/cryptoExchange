#!/usr/bin/env bash
# ============================================================
# Nexus Exchange — PostgreSQL Backup Script
#
# PURPOSE:
#   Creates a timestamped, compressed backup of the exchange database.
#   Designed to run as a daily cron job or manually before deployments.
#
# RISK PREVENTED:
#   Without backups, any data corruption, failed migration, or
#   ransomware attack results in permanent loss of ALL user balances,
#   ledger history, and audit trails.
#
# USAGE:
#   ./scripts/backup.sh
#   PGPASSWORD=xxx ./scripts/backup.sh
#
# CRON (daily at 3 AM UTC):
#   0 3 * * * /opt/nexus/backend/scripts/backup.sh >> /var/log/nexus-backup.log 2>&1
#
# RESTORE:
#   See restore instructions at bottom of this file.
# ============================================================

set -euo pipefail

# ── Configuration ──────────────────────────────────────────
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"
DB_NAME="${PGDATABASE:-nexus_exchange}"
DB_USER="${PGUSER:-nexus}"
# PGPASSWORD should be set via environment variable or .pgpass file

BACKUP_DIR="${BACKUP_DIR:-/var/backups/nexus}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S_UTC")
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

# ── Pre-flight checks ─────────────────────────────────────
echo "[$(date -u)] Starting backup of ${DB_NAME}..."

mkdir -p "${BACKUP_DIR}"

if ! command -v pg_dump &> /dev/null; then
    echo "ERROR: pg_dump not found. Install postgresql-client."
    exit 1
fi

# ── Create backup ──────────────────────────────────────────
# --no-owner: portable across different DB users
# --clean: include DROP statements for idempotent restore
# --if-exists: don't error on DROP of non-existent objects
# --format=plain: human-readable SQL (gzipped for size)
pg_dump \
    --host="${DB_HOST}" \
    --port="${DB_PORT}" \
    --username="${DB_USER}" \
    --dbname="${DB_NAME}" \
    --no-owner \
    --clean \
    --if-exists \
    --format=plain \
    --verbose \
    2>&1 | gzip > "${BACKUP_FILE}"

BACKUP_SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
echo "[$(date -u)] Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"

# ── Verify backup is not empty ─────────────────────────────
MIN_SIZE=1024  # 1KB minimum — empty DB still produces headers
ACTUAL_SIZE=$(stat --printf="%s" "${BACKUP_FILE}" 2>/dev/null || stat -f "%z" "${BACKUP_FILE}" 2>/dev/null || echo "0")

if [ "${ACTUAL_SIZE}" -lt "${MIN_SIZE}" ]; then
    echo "ERROR: Backup file is suspiciously small (${ACTUAL_SIZE} bytes). Possible failure."
    exit 1
fi

# ── Cleanup old backups ────────────────────────────────────
echo "[$(date -u)] Removing backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
REMAINING=$(ls -1 "${BACKUP_DIR}"/*.sql.gz 2>/dev/null | wc -l)
echo "[$(date -u)] Backup complete. ${REMAINING} backups retained."

# ============================================================
# RESTORE INSTRUCTIONS
# ============================================================
#
# 1. VERIFY BACKUP INTEGRITY:
#    gunzip -t /var/backups/nexus/nexus_exchange_20260215_030000_UTC.sql.gz
#
# 2. RESTORE TO EXISTING DATABASE (destructive — drops all tables first):
#    gunzip -c /var/backups/nexus/nexus_exchange_20260215_030000_UTC.sql.gz \
#      | psql -h localhost -U nexus -d nexus_exchange
#
# 3. RESTORE TO A NEW DATABASE (safe — for verification):
#    createdb -h localhost -U nexus nexus_exchange_restored
#    gunzip -c /var/backups/nexus/nexus_exchange_20260215_030000_UTC.sql.gz \
#      | psql -h localhost -U nexus -d nexus_exchange_restored
#
# 4. VERIFY RESTORED DATA:
#    psql -h localhost -U nexus -d nexus_exchange_restored -c "
#      SELECT asset, COUNT(*), SUM(available + locked) as total
#      FROM accounts GROUP BY asset;
#    "
#
# 5. VERIFY LEDGER INTEGRITY AFTER RESTORE:
#    psql -h localhost -U nexus -d nexus_exchange_restored -c "
#      SELECT le.asset,
#             SUM(CASE WHEN entry_type='credit' THEN amount ELSE 0 END) -
#             SUM(CASE WHEN entry_type='debit' THEN amount ELSE 0 END) as ledger_net,
#             (SELECT SUM(available + locked) FROM accounts WHERE asset = le.asset) as account_total
#      FROM ledger_entries le GROUP BY le.asset;
#    "
#    If ledger_net != account_total for any asset, the backup may be
#    from after a corruption event. Use an earlier backup.
#
# 6. POINT-IN-TIME RECOVERY (requires WAL archiving — not in this script):
#    For sub-daily recovery, configure PostgreSQL WAL archiving:
#    - archive_mode = on
#    - archive_command = 'cp %p /var/backups/nexus/wal/%f'
#    Then use pg_basebackup + WAL replay.
# ============================================================
