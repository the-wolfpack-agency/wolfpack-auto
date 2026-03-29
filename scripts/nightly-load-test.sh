#!/usr/bin/env bash
# --------------------------------------------------------------------------
# Nightly Load Test
#
# Runs the k6 load test against production and compares results to the
# previous baseline. Logs results to the learning system for trend analysis.
#
# Usage:
#   npm run nightly:load-test
#   bash scripts/nightly-load-test.sh
#   BASE_URL=http://localhost:3000 bash scripts/nightly-load-test.sh
#
# Exit codes:
#   0 = all thresholds passed
#   1 = one or more thresholds crossed (performance regression)
#   2 = k6 not installed or setup error
# --------------------------------------------------------------------------
set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_DIR}"

log()  { echo -e "${CYAN}[load-test]${RESET} $*"; }
ok()   { echo -e "${GREEN}[load-test]  ✓${RESET} $*"; }
fail() { echo -e "${RED}[load-test]  ✗${RESET} $*"; }
warn() { echo -e "${YELLOW}[load-test]  ⚠${RESET} $*"; }

BASE_URL="${BASE_URL:-https://wolfpack-auto.vercel.app}"
RESULTS_FILE="${PROJECT_DIR}/load-test-results.json"
HISTORY_FILE="${PROJECT_DIR}/.agenticqa/load_test_history.jsonl"
K6_JSON_OUTPUT="/tmp/k6-nightly-$(date +%Y%m%d-%H%M%S).json"

# ── Preflight ────────────────────────────────────────────────────────────
if ! command -v k6 &>/dev/null; then
  fail "k6 is not installed. Install with: brew install k6"
  exit 2
fi

log "Target: ${BASE_URL}"
log "Verifying target is reachable..."

if ! curl -sf "${BASE_URL}" > /dev/null 2>&1; then
  fail "Cannot reach ${BASE_URL}"
  exit 2
fi
ok "Target reachable"

# ── Load previous baseline for comparison ────────────────────────────────
PREV_HEALTH_P95=""
PREV_LEAD_P95=""
PREV_INVENTORY_P95=""
PREV_DASHBOARD_P95=""

if [[ -f "${RESULTS_FILE}" ]]; then
  PREV_HEALTH_P95=$(python3 -c "import json; d=json.load(open('${RESULTS_FILE}')); print(d['metrics'].get('health_latency_p95', ''))" 2>/dev/null || echo "")
  PREV_LEAD_P95=$(python3 -c "import json; d=json.load(open('${RESULTS_FILE}')); print(d['metrics'].get('lead_submit_latency_p95', ''))" 2>/dev/null || echo "")
  PREV_INVENTORY_P95=$(python3 -c "import json; d=json.load(open('${RESULTS_FILE}')); print(d['metrics'].get('inventory_latency_p95', ''))" 2>/dev/null || echo "")
  PREV_DASHBOARD_P95=$(python3 -c "import json; d=json.load(open('${RESULTS_FILE}')); print(d['metrics'].get('admin_dashboard_latency_p95', ''))" 2>/dev/null || echo "")
  log "Previous baseline loaded (health=${PREV_HEALTH_P95}ms, leads=${PREV_LEAD_P95}ms, dashboard=${PREV_DASHBOARD_P95}ms)"
fi

# ── Run load test ────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  ${BOLD}NIGHTLY LOAD TEST${RESET}"
echo -e "  Target: ${BASE_URL}"
echo -e "  50 VUs, 4 minutes, 7-stage ramp"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

LOAD_START=$SECONDS
K6_EXIT=0
k6 run \
  --env BASE_URL="${BASE_URL}" \
  --out "json=${K6_JSON_OUTPUT}" \
  tests/load/k6-full-platform.js 2>&1 || K6_EXIT=$?

LOAD_DURATION=$((SECONDS - LOAD_START))

# ── Parse results ────────────────────────────────────────────────────────
# The k6 test script writes load-test-results.json automatically
if [[ -f "${RESULTS_FILE}" ]]; then
  NEW_HEALTH_P95=$(python3 -c "import json; d=json.load(open('${RESULTS_FILE}')); print(d['metrics'].get('health_latency_p95', 'N/A'))" 2>/dev/null || echo "N/A")
  NEW_LEAD_P95=$(python3 -c "import json; d=json.load(open('${RESULTS_FILE}')); print(d['metrics'].get('lead_submit_latency_p95', 'N/A'))" 2>/dev/null || echo "N/A")
  NEW_INVENTORY_P95=$(python3 -c "import json; d=json.load(open('${RESULTS_FILE}')); print(d['metrics'].get('inventory_latency_p95', 'N/A'))" 2>/dev/null || echo "N/A")
  NEW_DASHBOARD_P95=$(python3 -c "import json; d=json.load(open('${RESULTS_FILE}')); print(d['metrics'].get('admin_dashboard_latency_p95', 'N/A'))" 2>/dev/null || echo "N/A")
  NEW_ERROR_RATE=$(python3 -c "import json; d=json.load(open('${RESULTS_FILE}')); print(round(d['metrics'].get('error_rate', 0) * 100, 1))" 2>/dev/null || echo "N/A")
  NEW_TOTAL_REQS=$(python3 -c "import json; d=json.load(open('${RESULTS_FILE}')); print(d['metrics'].get('http_reqs', 'N/A'))" 2>/dev/null || echo "N/A")
else
  warn "Results file not found — k6 test script may not have written it"
  NEW_HEALTH_P95="N/A"
  NEW_LEAD_P95="N/A"
  NEW_INVENTORY_P95="N/A"
  NEW_DASHBOARD_P95="N/A"
  NEW_ERROR_RATE="N/A"
  NEW_TOTAL_REQS="N/A"
fi

# ── Comparison ───────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  ${BOLD}RESULTS${RESET}"
echo ""
echo -e "  ${BOLD}Endpoint            p95 (now)     p95 (prev)${RESET}"
echo -e "  Health check       ${NEW_HEALTH_P95}ms       ${PREV_HEALTH_P95:-N/A}ms"
echo -e "  Lead submission    ${NEW_LEAD_P95}ms       ${PREV_LEAD_P95:-N/A}ms"
echo -e "  Admin dashboard    ${NEW_DASHBOARD_P95}ms       ${PREV_DASHBOARD_P95:-N/A}ms"
echo -e "  Inventory (VDP)    ${NEW_INVENTORY_P95}ms       ${PREV_INVENTORY_P95:-N/A}ms"
echo ""
echo -e "  Total requests:    ${NEW_TOTAL_REQS}"
echo -e "  Error rate:        ${NEW_ERROR_RATE}%"
echo -e "  Duration:          $((LOAD_DURATION / 60))m $((LOAD_DURATION % 60))s"
echo ""

if [[ ${K6_EXIT} -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}LOAD TEST: ALL THRESHOLDS PASSED${RESET}"
else
  echo -e "  ${RED}${BOLD}LOAD TEST: THRESHOLDS CROSSED (exit ${K6_EXIT})${RESET}"
fi
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"

# ── Log to learning system ───────────────────────────────────────────────
mkdir -p "$(dirname "${HISTORY_FILE}")"
HISTORY_ENTRY=$(cat <<ENDJSON
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "event": "nightly_load_test",
  "base_url": "${BASE_URL}",
  "commit": "$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")",
  "thresholds_passed": $(if [[ ${K6_EXIT} -eq 0 ]]; then echo "true"; else echo "false"; fi),
  "health_p95": ${NEW_HEALTH_P95:-null},
  "lead_submit_p95": ${NEW_LEAD_P95:-null},
  "admin_dashboard_p95": ${NEW_DASHBOARD_P95:-null},
  "inventory_p95": ${NEW_INVENTORY_P95:-null},
  "error_rate_pct": ${NEW_ERROR_RATE:-null},
  "total_requests": ${NEW_TOTAL_REQS:-null},
  "duration_seconds": ${LOAD_DURATION}
}
ENDJSON
)
echo "${HISTORY_ENTRY}" >> "${HISTORY_FILE}"
log "Results logged to ${HISTORY_FILE}"

# Clean up k6 JSON output (can be large)
rm -f "${K6_JSON_OUTPUT}"

exit "${K6_EXIT}"
