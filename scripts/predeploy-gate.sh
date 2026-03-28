#!/usr/bin/env bash
# --------------------------------------------------------------------------
# Pre-Deploy Gate — builds, type-checks, and runs ALL 728+ E2E tests
# against a production server in shadow mode (no DB).
#
# Exit codes:
#   0 = all checks pass → safe to deploy
#   1 = one or more checks failed → DO NOT deploy
#
# Usage:
#   npm run predeploy          # full gate
#   bash scripts/predeploy-gate.sh --quick   # type-check + smoke only
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

for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=true ;;
  esac
done

log()  { echo -e "${CYAN}[predeploy]${RESET} $*"; }
ok()   { echo -e "${GREEN}[predeploy]  ✓${RESET} $*"; }
fail() { echo -e "${RED}[predeploy]  ✗${RESET} $*"; }

TOTAL_START=$SECONDS
FAILURES=0

cd "${PROJECT_DIR}"

# ── Step 1: TypeScript ────────────────────────────────────────────────────
log "Step 1/4: Type-checking..."
if npx tsc --noEmit; then
  ok "TypeScript — zero errors"
else
  fail "TypeScript errors found"
  FAILURES=$((FAILURES + 1))
fi

# ── Step 2: Unit tests ───────────────────────────────────────────────────
log "Step 2/4: Unit tests..."
if npx jest --no-coverage --silent 2>/dev/null; then
  ok "Unit tests passed"
else
  fail "Unit tests failed"
  FAILURES=$((FAILURES + 1))
fi

# ── Step 3: Production build ─────────────────────────────────────────────
log "Step 3/4: Production build..."
BUILD_START=$SECONDS
if npm run build; then
  ok "Build completed in $((SECONDS - BUILD_START))s"
else
  fail "Build failed — cannot proceed to E2E tests"
  exit 1
fi

# ── Step 4: E2E tests ───────────────────────────────────────────────────
if [[ "$QUICK" == "true" ]]; then
  log "Step 4/4: Quick smoke tests (--quick mode)..."
  PW_CONFIG="playwright.config.ts"
  PW_ARGS="tests/smoke.spec.ts tests/e2e/full-platform-smoke.spec.ts"
else
  log "Step 4/4: Full E2E test suite (728+ tests)..."
  PW_CONFIG="playwright.predeploy.config.ts"
  PW_ARGS=""
fi

PW_EXIT=0
npx playwright test --config="${PW_CONFIG}" ${PW_ARGS} || PW_EXIT=$?

if [[ ${PW_EXIT} -eq 0 ]]; then
  ok "E2E tests — all passed"
else
  fail "E2E tests — ${PW_EXIT} failures"
  FAILURES=$((FAILURES + 1))
fi

# ── Summary ──────────────────────────────────────────────────────────────
TOTAL_TIME=$((SECONDS - TOTAL_START))
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
if [[ ${FAILURES} -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}PRE-DEPLOY GATE: ALL CHECKS PASSED${RESET}"
  echo -e "  ${GREEN}Safe to deploy.${RESET}"
else
  echo -e "  ${RED}${BOLD}PRE-DEPLOY GATE: ${FAILURES} CHECK(S) FAILED${RESET}"
  echo -e "  ${RED}DO NOT DEPLOY — fix failures first.${RESET}"
fi
echo -e "  Total time: $((TOTAL_TIME / 60))m $((TOTAL_TIME % 60))s"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

exit "${FAILURES}"
