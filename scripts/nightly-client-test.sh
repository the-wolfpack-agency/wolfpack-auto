#!/usr/bin/env bash
# =============================================================================
# Nightly Client Provisioning Test
#
# End-to-end verification that the platform works for a new client:
#   1. Seeds a test dealer ("Apex Motors") with realistic data
#   2. Starts the dev server (or uses running one)
#   3. Runs the full client verification test suite
#   4. Cleans up test data (unless --keep is passed)
#   5. Reports pass/fail
#
# Usage:
#   bash scripts/nightly-client-test.sh           # full run, cleanup after
#   bash scripts/nightly-client-test.sh --keep     # preserve test data
#   bash scripts/nightly-client-test.sh --no-seed  # skip seed (data exists)
#
# Requires:
#   - DATABASE_URL in .env.local or environment
#   - Node.js and npx available
#   - Playwright browsers installed
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# ---------------------------------------------------------------------------
# Flags
# ---------------------------------------------------------------------------

KEEP_DATA=false
SKIP_SEED=false
SERVER_PID=""
STARTED_SERVER=false

for arg in "$@"; do
  case "$arg" in
    --keep) KEEP_DATA=true ;;
    --no-seed) SKIP_SEED=true ;;
  esac
done

# ---------------------------------------------------------------------------
# Cleanup handler
# ---------------------------------------------------------------------------

cleanup() {
  local exit_code=$?

  # Kill dev server if we started it
  if [ "$STARTED_SERVER" = true ] && [ -n "$SERVER_PID" ]; then
    echo ""
    echo "[nightly] Stopping dev server (PID $SERVER_PID)..."
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi

  # Clean up test data unless --keep was passed
  if [ "$KEEP_DATA" = false ]; then
    echo ""
    echo "[nightly] Cleaning up test dealer data..."
    npx tsx scripts/cleanup-test-dealer.ts --dealer-slug apex-motors 2>/dev/null || true
  else
    echo ""
    echo "[nightly] Keeping test data (--keep flag set)."
    echo "  Run manually: npx tsx scripts/cleanup-test-dealer.ts --dealer-slug apex-motors"
  fi

  echo ""
  if [ "$exit_code" -eq 0 ]; then
    echo "============================================================"
    echo "  NIGHTLY CLIENT TEST: PASSED"
    echo "============================================================"
  else
    echo "============================================================"
    echo "  NIGHTLY CLIENT TEST: FAILED (exit code $exit_code)"
    echo "============================================================"
  fi

  exit "$exit_code"
}

trap cleanup EXIT

# ---------------------------------------------------------------------------
# Step 1: Seed test dealer
# ---------------------------------------------------------------------------

if [ "$SKIP_SEED" = false ]; then
  echo ""
  echo "============================================================"
  echo "  Step 1: Seeding test dealer (Apex Motors)"
  echo "============================================================"
  echo ""

  npx tsx scripts/seed-test-dealer.ts
else
  echo ""
  echo "[nightly] Skipping seed (--no-seed flag set)."
fi

# ---------------------------------------------------------------------------
# Step 2: Start dev server (if not already running)
# ---------------------------------------------------------------------------

echo ""
echo "============================================================"
echo "  Step 2: Checking dev server"
echo "============================================================"
echo ""

DEV_URL="${E2E_URL:-http://localhost:3000}"

if curl -s -o /dev/null -w "%{http_code}" "$DEV_URL" 2>/dev/null | grep -q "^[23]"; then
  echo "[nightly] Dev server already running at $DEV_URL."
else
  echo "[nightly] Starting dev server..."
  DEMO_MODE=true npm run dev &
  SERVER_PID=$!
  STARTED_SERVER=true

  # Wait for server to be ready (up to 60 seconds)
  echo "[nightly] Waiting for server to be ready..."
  for i in $(seq 1 60); do
    if curl -s -o /dev/null "$DEV_URL" 2>/dev/null; then
      echo "[nightly] Server ready after ${i}s."
      break
    fi
    if [ "$i" -eq 60 ]; then
      echo "[nightly] ERROR: Server did not start within 60 seconds."
      exit 1
    fi
    sleep 1
  done
fi

# ---------------------------------------------------------------------------
# Step 3: Run Playwright tests
# ---------------------------------------------------------------------------

echo ""
echo "============================================================"
echo "  Step 3: Running client provisioning tests"
echo "============================================================"
echo ""

DEMO_MODE=true E2E_URL="$DEV_URL" npx playwright test \
  tests/e2e/client-provisioning/full-client-flow.spec.ts \
  --config tests/e2e/playwright.e2e.config.ts \
  --reporter=list

echo ""
echo "[nightly] All tests completed."
