#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# canary-post-deploy.sh — Production Canary Runner
#
# Runs the canary test suite against a live deployment to verify real
# infrastructure is working. Designed to run after every Vercel deploy.
#
# Usage:
#   CANARY_URL=https://wolfpack-auto.vercel.app \
#   CANARY_SECRET=your-secret \
#     bash scripts/canary-post-deploy.sh [--quick] [--json]
#
# Flags:
#   --quick      Run only the deep health probe (skip Playwright tests)
#   --json       Output results as JSON (for CI consumption)
#   --rollback   Trigger Vercel rollback on failure (requires vercel CLI)
#
# Exit codes:
#   0  All canary checks passed
#   1  One or more canary checks failed
#   2  Configuration error (missing CANARY_URL)
# ---------------------------------------------------------------------------

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
QUICK=false
JSON_OUTPUT=false
AUTO_ROLLBACK=false
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EXIT_CODE=0

for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=true ;;
    --json) JSON_OUTPUT=true ;;
    --rollback) AUTO_ROLLBACK=true ;;
  esac
done

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

CANARY_URL="${CANARY_URL:-}"
CANARY_SECRET="${CANARY_SECRET:-}"

if [ -z "$CANARY_URL" ]; then
  echo "ERROR: CANARY_URL is required"
  echo "Usage: CANARY_URL=https://your-app.vercel.app bash scripts/canary-post-deploy.sh"
  exit 2
fi

log() {
  if [ "$JSON_OUTPUT" = false ]; then
    echo "[canary] $1"
  fi
}

# ---------------------------------------------------------------------------
# Quick mode: Just hit the deep health endpoint
# ---------------------------------------------------------------------------

if [ "$QUICK" = true ]; then
  log "Quick canary — probing $CANARY_URL/api/health/deep"

  DEEP_HEALTH=$(curl -sf \
    --max-time 15 \
    -H "x-canary-secret: ${CANARY_SECRET}" \
    "${CANARY_URL}/api/health/deep" 2>/dev/null) || {
    log "FAIL: Deep health endpoint unreachable"
    if [ "$JSON_OUTPUT" = true ]; then
      echo '{"verdict":"FAIL","error":"Deep health endpoint unreachable","timestamp":"'"$TIMESTAMP"'"}'
    fi
    exit 1
  }

  VERDICT=$(echo "$DEEP_HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['canary']['verdict'])" 2>/dev/null || echo "UNKNOWN")
  STATUS=$(echo "$DEEP_HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null || echo "unknown")

  if [ "$JSON_OUTPUT" = true ]; then
    echo "$DEEP_HEALTH"
  else
    log "Status: $STATUS"
    log "Verdict: $VERDICT"
  fi

  if [ "$VERDICT" = "PASS" ]; then
    log "Canary PASSED"
    exit 0
  else
    log "Canary FAILED — deployment may be in shadow mode or have infrastructure issues"
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Full mode: Run Playwright canary suite
# ---------------------------------------------------------------------------

log "Full canary suite — targeting $CANARY_URL"
log "Timestamp: $TIMESTAMP"

cd "$PROJECT_DIR"

# Step 1: Quick probe first — fail fast if deployment is unreachable
log "Step 1/3: Probing deep health endpoint..."
DEEP_HEALTH=$(curl -sf \
  --max-time 15 \
  -H "x-canary-secret: ${CANARY_SECRET}" \
  "${CANARY_URL}/api/health/deep" 2>/dev/null) || {
  log "FAIL: Deployment unreachable at $CANARY_URL"
  exit 1
}

DEEP_STATUS=$(echo "$DEEP_HEALTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null || echo "unknown")
log "Deep health status: $DEEP_STATUS"

if [ "$DEEP_STATUS" = "shadow" ]; then
  log "FAIL: Deployment is in Shadow Mode — no real database connected"
  exit 1
fi

# Step 2: Run Playwright canary tests
log "Step 2/3: Running Playwright canary tests..."
CANARY_URL="$CANARY_URL" \
CANARY_SECRET="$CANARY_SECRET" \
  npx playwright test \
    --config=playwright.canary.config.ts \
    --reporter=list \
  || EXIT_CODE=$?

# Step 3: Log results to history
log "Step 3/3: Logging canary results..."
HISTORY_DIR="$PROJECT_DIR/.agenticqa"
HISTORY_FILE="$HISTORY_DIR/canary_history.jsonl"
mkdir -p "$HISTORY_DIR"

# Build result JSON
COMMIT="${VERCEL_GIT_COMMIT_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}"
RESULT_JSON=$(python3 -c "
import json, sys
result = {
    'timestamp': '$TIMESTAMP',
    'url': '$CANARY_URL',
    'commit': '$COMMIT',
    'deep_health_status': '$DEEP_STATUS',
    'playwright_exit_code': $EXIT_CODE,
    'verdict': 'PASS' if $EXIT_CODE == 0 else 'FAIL',
    'environment': '${VERCEL_ENV:-local}',
}
print(json.dumps(result))
" 2>/dev/null || echo '{"timestamp":"'"$TIMESTAMP"'","verdict":"UNKNOWN"}')

echo "$RESULT_JSON" >> "$HISTORY_FILE"

if [ "$JSON_OUTPUT" = true ]; then
  echo "$RESULT_JSON"
fi

if [ "$EXIT_CODE" -eq 0 ]; then
  log "Canary PASSED — deployment verified against real infrastructure"
else
  log "Canary FAILED — test suite returned exit code $EXIT_CODE. Check canary-report/ for details."

  # Auto-rollback if requested and Vercel CLI is available
  if [ "$AUTO_ROLLBACK" = true ]; then
    log "Auto-rollback enabled — initiating Vercel rollback..."
    if command -v vercel &> /dev/null; then
      vercel rollback --yes 2>&1 && log "Rollback initiated successfully" || log "ERROR: Rollback failed"
    elif command -v npx &> /dev/null; then
      npx vercel rollback --yes 2>&1 && log "Rollback initiated successfully" || log "ERROR: Rollback failed"
    else
      log "ERROR: Neither 'vercel' CLI nor 'npx' found — cannot rollback"
    fi

    # Track rollback in analytics (best-effort)
    curl -s -X POST "${CANARY_URL}/api/health/deep" \
      -H "x-canary-secret: ${CANARY_SECRET}" \
      --max-time 5 2>/dev/null || true
  fi
fi

exit "$EXIT_CODE"
