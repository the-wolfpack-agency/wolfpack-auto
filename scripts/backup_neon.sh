#!/bin/bash
# backup_neon.sh
# Backup a Neon (or any PostgreSQL) database to a local .sql.gz file.
#
# Usage:
#   DATABASE_URL=<url> ./scripts/backup_neon.sh [output_dir]
#
# Arguments:
#   output_dir   Directory to write the backup file (default: ./backups)
#
# Requires: pg_dump, gzip
#
# The backup file name includes a timestamp so multiple backups can coexist:
#   wolfpack_backup_20260327_120000.sql.gz
#
# To restore a backup:
#   DATABASE_URL=<target-url> ./scripts/restore_neon.sh ./backups/wolfpack_backup_<timestamp>.sql.gz

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DB_URL="${DATABASE_URL:?ERROR: DATABASE_URL must be set}"
OUTPUT_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="wolfpack_backup_${TIMESTAMP}.sql.gz"
OUTPUT_PATH="${OUTPUT_DIR}/${FILENAME}"

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------

if ! command -v pg_dump &> /dev/null; then
  echo "ERROR: pg_dump not found. Install PostgreSQL client tools."
  echo "  macOS:  brew install libpq && brew link --force libpq"
  echo "  Ubuntu: sudo apt-get install -y postgresql-client"
  exit 1
fi

if ! command -v gzip &> /dev/null; then
  echo "ERROR: gzip not found. Install gzip."
  exit 1
fi

# ---------------------------------------------------------------------------
# Run backup
# ---------------------------------------------------------------------------

mkdir -p "$OUTPUT_DIR"

echo "Wolfpack Auto — Database Backup"
echo "================================"
echo "  Timestamp : ${TIMESTAMP}"
echo "  Output    : ${OUTPUT_PATH}"
echo ""
echo "Backing up..."

pg_dump "$DB_URL" \
  --no-owner \
  --no-acl \
  --format=plain \
  --verbose \
  2>&1 | grep -E "^(pg_dump|dumping|reading|saving)" || true

# Run the actual dump and compress
pg_dump "$DB_URL" \
  --no-owner \
  --no-acl \
  --format=plain \
  | gzip > "$OUTPUT_PATH"

SIZE=$(du -sh "$OUTPUT_PATH" | cut -f1)

echo ""
echo "Backup complete"
echo "  File : ${OUTPUT_PATH}"
echo "  Size : ${SIZE}"
echo ""
echo "To restore this backup:"
echo "  DATABASE_URL=<target-url> ./scripts/restore_neon.sh ${OUTPUT_PATH}"
echo ""

# ---------------------------------------------------------------------------
# Retention: warn if more than 10 backups exist
# ---------------------------------------------------------------------------

BACKUP_COUNT=$(ls -1 "${OUTPUT_DIR}"/wolfpack_backup_*.sql.gz 2>/dev/null | wc -l | tr -d ' ')
if [ "$BACKUP_COUNT" -gt 10 ]; then
  echo "NOTE: ${BACKUP_COUNT} backup files found in ${OUTPUT_DIR}."
  echo "  Consider pruning old backups to save disk space:"
  echo "  ls -t ${OUTPUT_DIR}/wolfpack_backup_*.sql.gz | tail -n +8 | xargs rm -f"
  echo ""
fi
