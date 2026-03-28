#!/bin/bash
# --------------------------------------------------------------------------
# auto-rollback.sh — Vercel deployment health watchdog
#
# Checks the /api/admin/system/health endpoint and triggers a Vercel
# rollback if the deployment is unhealthy.
#
# Usage:
#   ./scripts/auto-rollback.sh                          # one-shot check
#   HEALTH_URL=https://custom.domain/api/admin/system/health ./scripts/auto-rollback.sh
#
# Cron example (every 5 minutes):
#   */5 * * * * /path/to/wolfpack-auto/scripts/auto-rollback.sh >> /var/log/wolfpack-rollback.log 2>&1
# --------------------------------------------------------------------------

set -euo pipefail

HEALTH_URL="${HEALTH_URL:-https://wolfpack-auto.vercel.app/api/admin/system/health}"
MAX_TIME="${MAX_TIME:-10}"
LOG_PREFIX="[auto-rollback]"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "${LOG_PREFIX} ${TIMESTAMP} Checking health at ${HEALTH_URL}"

# Fetch the health endpoint — capture HTTP status code
HTTP_STATUS=$(curl -s -o /tmp/wolfpack-health-response.json -w "%{http_code}" "${HEALTH_URL}" --max-time "${MAX_TIME}" 2>/dev/null || echo "000")

if [ "${HTTP_STATUS}" = "200" ]; then
  echo "${LOG_PREFIX} ${TIMESTAMP} HEALTHY (HTTP ${HTTP_STATUS})"
  exit 0
fi

echo "${LOG_PREFIX} ${TIMESTAMP} UNHEALTHY (HTTP ${HTTP_STATUS})"

# Log response body if available
if [ -f /tmp/wolfpack-health-response.json ]; then
  echo "${LOG_PREFIX} Response body:"
  cat /tmp/wolfpack-health-response.json 2>/dev/null || true
  echo
fi

# Check if Vercel CLI is available
if ! command -v vercel &> /dev/null && ! command -v npx &> /dev/null; then
  echo "${LOG_PREFIX} ERROR: Neither 'vercel' CLI nor 'npx' found. Cannot rollback."
  exit 1
fi

echo "${LOG_PREFIX} ${TIMESTAMP} Triggering Vercel rollback..."

# Try native vercel CLI first, fall back to npx
if command -v vercel &> /dev/null; then
  vercel rollback --yes 2>&1 || {
    echo "${LOG_PREFIX} ERROR: Vercel rollback command failed."
    exit 1
  }
else
  npx vercel rollback --yes 2>&1 || {
    echo "${LOG_PREFIX} ERROR: Vercel rollback via npx failed."
    exit 1
  }
fi

echo "${LOG_PREFIX} ${TIMESTAMP} Rollback initiated successfully."

# Track the rollback event (best-effort curl to the health endpoint with a tag)
curl -s -X POST "${HEALTH_URL%/health}/analytics/track" \
  -H "Content-Type: application/json" \
  -d "{\"event\":\"system.auto_rollback\",\"http_status\":${HTTP_STATUS},\"timestamp\":\"${TIMESTAMP}\"}" \
  --max-time 5 2>/dev/null || true

exit 0
