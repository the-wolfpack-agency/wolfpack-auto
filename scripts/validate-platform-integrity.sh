#!/usr/bin/env bash
# --------------------------------------------------------------------------
# Platform Integrity Validation
#
# Runs all critical test suites that verify the platform is fully functional:
#   1. Sidebar navigation (grouped sections, expand/collapse, all 44 links)
#   2. Admin page renders (64 pages — no white screens, no 401s)
#   3. Admin API health (40+ GET endpoints → 200 with JSON)
#   4. Public page renders (11 customer-facing pages)
#   5. Layout regressions (sidebar positioning, mobile drawer)
#   6. Analytics brain (stats, sidebar link, responsive)
#   7. OEM portal (routes, tiles, breadcrumbs, navigation, layout)
#   8. Production canary (deep health, data source, write roundtrip, UI render)
#
# This is the "nothing is broken" gate. Run before demos, deploys, or
# after any UI/layout change.
#
# Usage:
#   npm run validate                    # full validation
#   npm run validate -- --quick         # sidebar + renders only
#   DEMO_MODE=true bash scripts/validate-platform-integrity.sh
#
# Exit codes:
#   0 = all checks pass
#   1 = failures detected — DO NOT demo/deploy
# --------------------------------------------------------------------------
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
QUICK=false
WORKERS=1

for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=true ;;
    --workers=*) WORKERS="${arg#*=}" ;;
  esac
done

log()  { echo -e "${CYAN}[validate]${RESET} $*"; }
ok()   { echo -e "${GREEN}[validate]  ✓${RESET} $*"; }
fail() { echo -e "${RED}[validate]  ✗${RESET} $*"; }
warn() { echo -e "${YELLOW}[validate]  ⚠${RESET} $*"; }

cd "${PROJECT_DIR}"
export DEMO_MODE="${DEMO_MODE:-true}"

TOTAL_START=$SECONDS
TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0
SUITE_FAILURES=0

# ── Helper: run a test suite and parse results ───────────────────────────
run_suite() {
  local name="$1"
  shift
  local files=("$@")

  log "Running: ${name}..."
  local start=$SECONDS

  local output
  local pw_exit=0
  output=$(npx playwright test "${files[@]}" --project=chromium --workers="${WORKERS}" --reporter=line 2>&1) || pw_exit=$?

  # Parse counts from Playwright line reporter summary (e.g. "  28 passed (33.0s)")
  local passed failed skipped
  passed=$(echo "$output" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo "0")
  failed=$(echo "$output" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo "0")
  skipped=$(echo "$output" | grep -oE '[0-9]+ skipped' | grep -oE '[0-9]+' || echo "0")

  # Default to 0 if empty
  passed=${passed:-0}
  failed=${failed:-0}
  skipped=${skipped:-0}

  local duration=$((SECONDS - start))

  if [[ "$failed" == "0" && "$pw_exit" == "0" ]]; then
    ok "${name}: ${passed} passed, ${skipped} skipped (${duration}s)"
  else
    fail "${name}: ${passed} passed, ${failed} FAILED, ${skipped} skipped (${duration}s)"
    SUITE_FAILURES=$((SUITE_FAILURES + 1))

    # Show failed test names
    echo "$output" | grep "✘" | head -10
  fi

  TOTAL_PASSED=$((TOTAL_PASSED + ${passed}))
  TOTAL_FAILED=$((TOTAL_FAILED + ${failed}))
  TOTAL_SKIPPED=$((TOTAL_SKIPPED + ${skipped}))
}

# ── Preflight: TypeScript compile check ──────────────────────────────────
log "Preflight: TypeScript compile check..."
if npx tsc --noEmit 2>/dev/null; then
  ok "TypeScript — zero errors"
else
  fail "TypeScript errors — fix before proceeding"
  exit 1
fi

# ── Preflight: Dev server check ──────────────────────────────────────────
log "Preflight: Checking dev server..."
if curl -sf http://localhost:3000 > /dev/null 2>&1; then
  ok "Dev server running on :3000"
else
  warn "Dev server not running — starting..."
  DEMO_MODE=true npm run dev > /tmp/wolfpack-validate-server.log 2>&1 &
  SERVER_PID=$!
  for i in $(seq 1 30); do
    if curl -sf http://localhost:3000 > /dev/null 2>&1; then
      ok "Dev server started (PID ${SERVER_PID})"
      break
    fi
    sleep 1
  done
  if ! curl -sf http://localhost:3000 > /dev/null 2>&1; then
    fail "Could not start dev server"
    exit 1
  fi
fi

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  ${BOLD}PLATFORM INTEGRITY VALIDATION${RESET}"
if [[ "$QUICK" == "true" ]]; then
  echo -e "  Mode: ${YELLOW}Quick${RESET} (sidebar + renders only)"
else
  echo -e "  Mode: ${GREEN}Full${RESET} (all 8 suites)"
fi
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# ── Suite 1: Sidebar Navigation ──────────────────────────────────────────
run_suite "Sidebar Navigation (28 tests)" \
  tests/e2e/sidebar-grouped-navigation.spec.ts

# ── Suite 2: Admin Page Renders ──────────────────────────────────────────
run_suite "Admin Page Renders (64 pages)" \
  tests/e2e/admin-pages-render.spec.ts

# ── Suite 3: Admin API Health ────────────────────────────────────────────
run_suite "Admin API Health (40+ endpoints)" \
  tests/e2e/admin-api-200.spec.ts

# ── Suite 4: Public Page Renders ─────────────────────────────────────────
run_suite "Public Page Renders (11 pages)" \
  tests/e2e/public-pages-render.spec.ts

if [[ "$QUICK" == "false" ]]; then
  # ── Suite 5: Layout Regressions ──────────────────────────────────────
  run_suite "Layout Regressions (sidebar, mobile)" \
    tests/e2e/admin-workflow.spec.ts

  # ── Suite 6: Analytics Brain ─────────────────────────────────────────
  run_suite "Analytics Brain (7 tests)" \
    tests/pages/analytics-brain.spec.ts

  # ── Suite 7: OEM Portal ─────────────────────────────────────────────
  run_suite "OEM Portal (60 tests)" \
    tests/e2e/oem-portal.spec.ts

  # ── Suite 8: Production Canary (deep health, data source, write roundtrip, UI render)
  log "Running: Production Canary (66 tests)..."
  CANARY_START=$SECONDS
  CANARY_EXIT=0
  CANARY_OUTPUT=$(CANARY_URL=http://localhost:3000 CANARY_SECRET="" \
    npx playwright test --config=playwright.canary.config.ts --workers=1 --reporter=line 2>&1) || CANARY_EXIT=$?

  CANARY_PASSED=$(echo "$CANARY_OUTPUT" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo "0")
  CANARY_FAIL_CT=$(echo "$CANARY_OUTPUT" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo "0")
  CANARY_SKIPPED=$(echo "$CANARY_OUTPUT" | grep -oE '[0-9]+ skipped' | grep -oE '[0-9]+' || echo "0")
  CANARY_PASSED=${CANARY_PASSED:-0}
  CANARY_FAIL_CT=${CANARY_FAIL_CT:-0}
  CANARY_SKIPPED=${CANARY_SKIPPED:-0}
  CANARY_DURATION=$((SECONDS - CANARY_START))

  if [[ "$CANARY_FAIL_CT" == "0" && "$CANARY_EXIT" == "0" ]]; then
    ok "Production Canary: ${CANARY_PASSED} passed, ${CANARY_SKIPPED} skipped (${CANARY_DURATION}s)"
  else
    fail "Production Canary: ${CANARY_PASSED} passed, ${CANARY_FAIL_CT} FAILED, ${CANARY_SKIPPED} skipped (${CANARY_DURATION}s)"
    SUITE_FAILURES=$((SUITE_FAILURES + 1))
    echo "$CANARY_OUTPUT" | grep "✘" | head -10
  fi
  TOTAL_PASSED=$((TOTAL_PASSED + ${CANARY_PASSED}))
  TOTAL_FAILED=$((TOTAL_FAILED + ${CANARY_FAIL_CT}))
  TOTAL_SKIPPED=$((TOTAL_SKIPPED + ${CANARY_SKIPPED}))
fi

# ── Summary ──────────────────────────────────────────────────────────────
TOTAL_TIME=$((SECONDS - TOTAL_START))

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
if [[ ${SUITE_FAILURES} -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}PLATFORM INTEGRITY: ALL CHECKS PASSED${RESET}"
  echo -e "  ${GREEN}${TOTAL_PASSED} passed, ${TOTAL_SKIPPED} skipped, 0 failed${RESET}"
  echo -e "  ${GREEN}Safe to demo / deploy.${RESET}"
else
  echo -e "  ${RED}${BOLD}PLATFORM INTEGRITY: ${SUITE_FAILURES} SUITE(S) FAILED${RESET}"
  echo -e "  ${RED}${TOTAL_PASSED} passed, ${TOTAL_FAILED} FAILED, ${TOTAL_SKIPPED} skipped${RESET}"
  echo -e "  ${RED}DO NOT demo or deploy — fix failures first.${RESET}"
fi
echo -e "  Total time: $((TOTAL_TIME / 60))m $((TOTAL_TIME % 60))s"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# ── Log result to analytics (learning system) ────────────────────────────
RESULT_JSON=$(cat <<ENDJSON
{
  "event": "platform_integrity_validation",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "mode": "$(if [[ "$QUICK" == "true" ]]; then echo "quick"; else echo "full"; fi)",
  "passed": ${TOTAL_PASSED},
  "failed": ${TOTAL_FAILED},
  "skipped": ${TOTAL_SKIPPED},
  "suite_failures": ${SUITE_FAILURES},
  "duration_seconds": ${TOTAL_TIME},
  "commit": "$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")"
}
ENDJSON
)

# Append to validation history for learning system
HISTORY_FILE="${PROJECT_DIR}/.agenticqa/validation_history.jsonl"
mkdir -p "$(dirname "${HISTORY_FILE}")"
echo "${RESULT_JSON}" >> "${HISTORY_FILE}"
log "Result logged to ${HISTORY_FILE}"

exit "${SUITE_FAILURES}"
