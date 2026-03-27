#!/usr/bin/env bash
# --------------------------------------------------------------------------
# Shadow Hardening Test Runner
#
# Builds the Next.js production bundle, starts it on a shadow port, runs
# the Playwright shadow-hardening suite, generates the HTML report, and
# cleans up. Exits with Playwright's exit code so CI gates work correctly.
# --------------------------------------------------------------------------
set -euo pipefail

# ── Colors ----------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Config ----------------------------------------------------------------
SHADOW_PORT="${SHADOW_PORT:-3099}"
SHADOW_URL="http://localhost:${SHADOW_PORT}"
MAX_WAIT=60          # seconds to wait for the server to become ready
POLL_INTERVAL=1      # seconds between health-check polls
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SERVER_PID=""

# ── Helpers ---------------------------------------------------------------
log()  { echo -e "${CYAN}[shadow]${RESET} $*"; }
ok()   { echo -e "${GREEN}[shadow]  ✓${RESET} $*"; }
warn() { echo -e "${YELLOW}[shadow]  ⚠${RESET} $*"; }
err()  { echo -e "${RED}[shadow]  ✗${RESET} $*" >&2; }

elapsed() {
  local secs=$1
  printf '%dm %ds' $((secs / 60)) $((secs % 60))
}

# ── Cleanup trap ----------------------------------------------------------
cleanup() {
  if [[ -n "${SERVER_PID}" ]]; then
    log "Stopping shadow server (PID ${SERVER_PID})…"
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
    ok "Server stopped."
  fi
}
trap cleanup EXIT INT TERM

# ── Main ------------------------------------------------------------------
cd "${PROJECT_DIR}"

TOTAL_START=$SECONDS

# 1. Build ─────────────────────────────────────────────────────────────────
log "Building Next.js production bundle…"
BUILD_START=$SECONDS

if ! npm run build; then
  err "Build failed — aborting shadow test."
  exit 1
fi

ok "Build completed in $(elapsed $((SECONDS - BUILD_START)))."

# 2. Start shadow server ──────────────────────────────────────────────────
log "Starting shadow server on port ${SHADOW_PORT}…"

PORT="${SHADOW_PORT}" npx next start -p "${SHADOW_PORT}" &
SERVER_PID=$!

# 3. Wait for ready ───────────────────────────────────────────────────────
WAITED=0
while [[ ${WAITED} -lt ${MAX_WAIT} ]]; do
  if curl -sf "${SHADOW_URL}" -o /dev/null 2>/dev/null; then
    ok "Server ready after ${WAITED}s at ${SHADOW_URL}"
    break
  fi
  sleep "${POLL_INTERVAL}"
  WAITED=$((WAITED + POLL_INTERVAL))
done

if [[ ${WAITED} -ge ${MAX_WAIT} ]]; then
  err "Server did not become ready within ${MAX_WAIT}s — aborting."
  exit 1
fi

# 4. Run Playwright ───────────────────────────────────────────────────────
log "Running shadow-hardening Playwright suite…"
PW_START=$SECONDS
PW_EXIT=0

SHADOW_URL="${SHADOW_URL}" npx playwright test \
  --config playwright.shadow.config.ts || PW_EXIT=$?

if [[ ${PW_EXIT} -eq 0 ]]; then
  ok "All shadow tests passed in $(elapsed $((SECONDS - PW_START)))."
else
  warn "Playwright exited with code ${PW_EXIT} ($(elapsed $((SECONDS - PW_START))))."
fi

# 5. Generate HTML report ─────────────────────────────────────────────────
if [[ -f "${PROJECT_DIR}/scripts/generate-shadow-report.mjs" ]]; then
  log "Generating shadow hardening HTML report…"
  node "${PROJECT_DIR}/scripts/generate-shadow-report.mjs" && ok "Report generated." || warn "Report generation failed (non-fatal)."
else
  warn "generate-shadow-report.mjs not found — skipping report generation."
fi

# 6. Summary ──────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
if [[ ${PW_EXIT} -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}SHADOW HARDENING: ALL TESTS PASSED${RESET}"
else
  echo -e "  ${RED}${BOLD}SHADOW HARDENING: TESTS FAILED (exit ${PW_EXIT})${RESET}"
fi
echo -e "  Total time: $(elapsed $((SECONDS - TOTAL_START)))"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

exit "${PW_EXIT}"
