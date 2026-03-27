#!/bin/bash
# migrate.sh
# Apply all pending SQL migrations in lexicographic order.
#
# Usage:
#   DATABASE_URL=<url> ./scripts/migrate.sh
#
# Migrations are read from src/db/migrations/*.sql and applied in sort order
# (001_initial_schema.sql, 002_dealer_domains.sql, ...).
#
# This script is intentionally simple: it runs every file every time.
# For idempotent re-runs, ensure each migration uses IF NOT EXISTS guards
# or is wrapped in a transaction that checks a migrations table.
#
# Requires: psql

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DB_URL="${DATABASE_URL:?ERROR: DATABASE_URL must be set}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS_DIR="${SCRIPT_DIR}/../src/db/migrations"

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------

if ! command -v psql &> /dev/null; then
  echo "ERROR: psql not found. Install PostgreSQL client tools."
  echo "  macOS:  brew install libpq && brew link --force libpq"
  echo "  Ubuntu: sudo apt-get install -y postgresql-client"
  exit 1
fi

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "ERROR: Migrations directory not found: ${MIGRATIONS_DIR}"
  exit 1
fi

MIGRATION_FILES=$(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort || true)

if [ -z "$MIGRATION_FILES" ]; then
  echo "No migration files found in ${MIGRATIONS_DIR}"
  exit 0
fi

# ---------------------------------------------------------------------------
# Apply migrations
# ---------------------------------------------------------------------------

MASKED_URL=$(echo "$DB_URL" | sed 's/:[^:@]*@/@/')

echo "Wolfpack Auto — Database Migrations"
echo "====================================="
echo "  Target DB        : ${MASKED_URL}"
echo "  Migrations dir   : ${MIGRATIONS_DIR}"
echo ""

APPLIED=0
FAILED=0

for MIGRATION_FILE in $MIGRATION_FILES; do
  BASENAME=$(basename "$MIGRATION_FILE")
  echo "  Applying: ${BASENAME} ..."

  if psql "$DB_URL" \
       --set ON_ERROR_STOP=1 \
       --single-transaction \
       -f "$MIGRATION_FILE" \
       > /dev/null 2>&1; then
    echo "    OK"
    APPLIED=$((APPLIED + 1))
  else
    echo ""
    echo "FAILED: ${BASENAME}"
    echo ""
    echo "Re-running with verbose output for diagnostics:"
    echo "---"
    psql "$DB_URL" \
      --set ON_ERROR_STOP=1 \
      -f "$MIGRATION_FILE" || true
    echo "---"
    FAILED=$((FAILED + 1))
    echo ""
    echo "Migration failed. Stopping."
    echo "  Fix the error above, then re-run ./scripts/migrate.sh"
    exit 1
  fi
done

echo ""
echo "Done. ${APPLIED} migration(s) applied, ${FAILED} failed."
echo ""
