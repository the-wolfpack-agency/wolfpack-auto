#!/bin/bash
# rollback_migration.sh — Roll back a specific migration
# Usage: bash scripts/rollback_migration.sh 003
set -euo pipefail
N=${1:?Usage: $0 <migration_number>}
FILE=$(ls src/db/migrations/rollback/rollback_${N}*.sql 2>/dev/null | head -1)
if [ -z "$FILE" ]; then
  echo "No rollback found for migration $N"
  exit 1
fi
echo "Rolling back: $FILE"
psql "${DATABASE_URL:?DATABASE_URL not set}" -f "$FILE"
echo "Done."
