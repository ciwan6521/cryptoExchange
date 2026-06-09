#!/usr/bin/env bash
# Apply SQL migrations in order. Usage:
#   ./scripts/run-migrations.sh
#   DATABASE_URL=postgresql://user:pass@host:5432/db ./scripts/run-migrations.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS=(
  "add_staking_tables.sql"
  "add_leverage_tables.sql"
  "add_platform_features.sql"
  "add_user_lockout.sql"
  "add_p2p_messages.sql"
)

DB_URL="${DATABASE_URL:-postgresql://crypto4pro:crypto4pro_password@localhost:5432/crypto4pro_exchange}"

for file in "${MIGRATIONS[@]}"; do
  path="$ROOT/backend/migrations/$file"
  if [[ -f "$path" ]]; then
    echo "Applying $file ..."
    psql "$DB_URL" -f "$path" || echo "  (skipped or already applied: $file)"
  else
    echo "Missing migration: $file"
  fi
done

echo "Done."
