#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Database migration safety test for wolfpack-auto
# Creates a temporary PostgreSQL database, runs migrations + seed, verifies
# table structure and data counts, tests idempotency, then cleans up.
# ---------------------------------------------------------------------------
set -uo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

CONTAINER="wolfpack-postgres"
TEMP_DB="wolfpack_migration_test_$$"
PG_USER="${PGUSER:-postgres}"
PG_PASSWORD="${PGPASSWORD:-postgres}"
FAILURES=0

pass() { echo -e "  ${GREEN}PASS${NC}  $1"; }
fail() { echo -e "  ${RED}FAIL${NC}  $1"; FAILURES=$((FAILURES + 1)); }

# ── Verify the postgres container is running ───────────────────────────────
echo -e "${BOLD}Migration safety test${NC}"
echo "Container : ${CONTAINER}"
echo "Temp DB   : ${TEMP_DB}"
echo ""

if ! docker inspect "${CONTAINER}" >/dev/null 2>&1; then
  echo -e "${RED}ERROR${NC}: Docker container '${CONTAINER}' is not running."
  echo "Start it with: docker compose up -d postgres"
  exit 1
fi

# ── Helper: run SQL via docker exec ────────────────────────────────────────
run_sql() {
  docker exec -e PGPASSWORD="${PG_PASSWORD}" "${CONTAINER}" \
    psql -U "${PG_USER}" -d "${1}" -tAc "${2}" 2>/dev/null
}

run_sql_default() {
  docker exec -e PGPASSWORD="${PG_PASSWORD}" "${CONTAINER}" \
    psql -U "${PG_USER}" -tAc "${1}" 2>/dev/null
}

# ── Create temp database ───────────────────────────────────────────────────
echo -e "${BOLD}1. Creating temporary database ...${NC}"
run_sql_default "CREATE DATABASE ${TEMP_DB};" >/dev/null 2>&1
if [[ $? -ne 0 ]]; then
  fail "Could not create temp database ${TEMP_DB}"
  exit 1
fi
pass "Created ${TEMP_DB}"

# Build the connection string for the temp DB
TEMP_DB_URL="postgresql://${PG_USER}:${PG_PASSWORD}@localhost:5432/${TEMP_DB}"

# ── Cleanup trap ───────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo -e "${BOLD}Cleanup: dropping ${TEMP_DB} ...${NC}"
  # Terminate active connections before dropping
  run_sql_default "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${TEMP_DB}' AND pid <> pg_backend_pid();" >/dev/null 2>&1
  run_sql_default "DROP DATABASE IF EXISTS ${TEMP_DB};" >/dev/null 2>&1
  if [[ $? -eq 0 ]]; then
    pass "Dropped ${TEMP_DB}"
  else
    fail "Could not drop ${TEMP_DB} — clean up manually"
  fi
}
trap cleanup EXIT

# ── Run migrations ─────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}2. Running migrations ...${NC}"
DATABASE_URL="${TEMP_DB_URL}" npx tsx src/db/migrate.ts >/dev/null 2>&1
if [[ $? -eq 0 ]]; then
  pass "Migrations completed"
else
  fail "Migrations failed"
fi

# ── Run seed ───────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}3. Running seed ...${NC}"
DATABASE_URL="${TEMP_DB_URL}" npx tsx src/db/seed.ts >/dev/null 2>&1
if [[ $? -eq 0 ]]; then
  pass "Seed completed"
else
  fail "Seed failed"
fi

# ── Verify key tables exist ───────────────────────────────────────────────
echo ""
echo -e "${BOLD}4. Verifying tables ...${NC}"
REQUIRED_TABLES=("vehicles" "leads" "dealers" "dealer_users" "_migrations")

for tbl in "${REQUIRED_TABLES[@]}"; do
  exists=$(run_sql "${TEMP_DB}" "SELECT to_regclass('public.${tbl}');")
  if [[ -n "$exists" && "$exists" != "" ]]; then
    pass "Table '${tbl}' exists"
  else
    fail "Table '${tbl}' missing"
  fi
done

# ── Verify seed data counts ───────────────────────────────────────────────
echo ""
echo -e "${BOLD}5. Verifying seed data ...${NC}"

vehicle_count=$(run_sql "${TEMP_DB}" "SELECT COUNT(*) FROM vehicles;" 2>/dev/null || echo "0")
if [[ "$vehicle_count" -ge 20 ]]; then
  pass "vehicles count = ${vehicle_count} (expected >= 20)"
else
  fail "vehicles count = ${vehicle_count} (expected >= 20)"
fi

lead_count=$(run_sql "${TEMP_DB}" "SELECT COUNT(*) FROM leads;" 2>/dev/null || echo "0")
if [[ "$lead_count" -ge 5 ]]; then
  pass "leads count = ${lead_count} (expected >= 5)"
else
  fail "leads count = ${lead_count} (expected >= 5)"
fi

# ── Idempotency: run migrations again ─────────────────────────────────────
echo ""
echo -e "${BOLD}6. Testing migration idempotency ...${NC}"
IDEM_OUTPUT=$(DATABASE_URL="${TEMP_DB_URL}" npx tsx src/db/migrate.ts 2>&1)
if [[ $? -eq 0 ]]; then
  pass "Re-running migrations succeeded (idempotent)"
else
  fail "Re-running migrations failed — not idempotent"
fi

# Verify data was not duplicated
vehicle_count_after=$(run_sql "${TEMP_DB}" "SELECT COUNT(*) FROM vehicles;" 2>/dev/null || echo "0")
if [[ "$vehicle_count_after" -eq "$vehicle_count" ]]; then
  pass "Vehicle count unchanged after re-migration (${vehicle_count_after})"
else
  fail "Vehicle count changed after re-migration: ${vehicle_count} -> ${vehicle_count_after}"
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ $FAILURES -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}ALL CHECKS PASSED${NC}"
  exit 0
else
  echo -e "${RED}${BOLD}${FAILURES} CHECK(S) FAILED${NC}"
  exit 1
fi
