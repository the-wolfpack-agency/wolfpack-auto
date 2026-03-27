#!/bin/bash
# restore_neon.sh
# Restore a backup created by backup_neon.sh into a PostgreSQL database.
#
# Usage:
#   DATABASE_URL=<target-url> ./scripts/restore_neon.sh <backup_file.sql.gz>
#
# WARNING: This applies the SQL dump to the TARGET database. If the dump
# contains DROP/CREATE TABLE statements, it will overwrite existing objects.
# Always restore into an empty or test database unless you know what you are doing.
#
# Requires: psql, gunzip

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DB_URL="${DATABASE_URL:?ERROR: DATABASE_URL must be set}"
BACKUP_FILE="${1:?Usage: restore_neon.sh <backup_file.sql.gz>}"

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

case "$BACKUP_FILE" in
  *.sql.gz) ;;
  *)
    echo "ERROR: Expected a .sql.gz file. Got: ${BACKUP_FILE}"
    echo "  Only backups created by backup_neon.sh are supported."
    exit 1
    ;;
esac

if ! command -v psql &> /dev/null; then
  echo "ERROR: psql not found. Install PostgreSQL client tools."
  echo "  macOS:  brew install libpq && brew link --force libpq"
  echo "  Ubuntu: sudo apt-get install -y postgresql-client"
  exit 1
fi

if ! command -v gunzip &> /dev/null; then
  echo "ERROR: gunzip not found. Install gzip."
  exit 1
fi

# ---------------------------------------------------------------------------
# Show target (masking password in output)
# ---------------------------------------------------------------------------

MASKED_URL=$(echo "$DB_URL" | sed 's/:[^:@]*@/@/')
BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)

echo "Wolfpack Auto — Database Restore"
echo "=================================="
echo "  Backup file : ${BACKUP_FILE} (${BACKUP_SIZE})"
echo "  Target DB   : ${MASKED_URL}"
echo ""
echo "WARNING: This will apply the backup SQL to the target database."
echo "  - If the backup contains CREATE TABLE, it will add/overwrite tables."
echo "  - Restore to an EMPTY database unless you intend to merge data."
echo ""

# ---------------------------------------------------------------------------
# Confirmation prompt
# ---------------------------------------------------------------------------

read -rp "Type 'yes' to continue: " confirm
if [ "$confirm" != "yes" ]; then
  echo "Aborted. No changes were made."
  exit 0
fi

echo ""
echo "Restoring..."

# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------

gunzip -c "$BACKUP_FILE" | psql "$DB_URL" --set ON_ERROR_STOP=1

echo ""
echo "Restore complete."
echo "  Source : ${BACKUP_FILE}"
echo "  Target : ${MASKED_URL}"
echo ""
echo "Verify the restore:"
echo "  psql \"\$DATABASE_URL\" -c \"\\dt\""
echo "  psql \"\$DATABASE_URL\" -c \"SELECT count(*) FROM dealers;\""
echo ""
