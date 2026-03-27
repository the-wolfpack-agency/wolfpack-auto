#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Dependency vulnerability scanner for wolfpack-auto
# Runs npm audit, parses JSON output, prints a colour-coded summary table,
# and exits non-zero when critical or high vulnerabilities are present.
# ---------------------------------------------------------------------------
set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────
RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m' # No Colour

# ── Run npm audit ──────────────────────────────────────────────────────────
echo -e "${BOLD}Running npm audit ...${NC}"

AUDIT_JSON=$(npm audit --json 2>/dev/null || true)

# npm audit --json returns a "vulnerabilities" summary object.
# Parse counts by severity.
critical=$(echo "$AUDIT_JSON" | node -e "
  const d = JSON.parse(require('fs').readFileSync(0,'utf8'));
  const v = (d.metadata && d.metadata.vulnerabilities) || {};
  console.log(v.critical || 0);
")
high=$(echo "$AUDIT_JSON" | node -e "
  const d = JSON.parse(require('fs').readFileSync(0,'utf8'));
  const v = (d.metadata && d.metadata.vulnerabilities) || {};
  console.log(v.high || 0);
")
moderate=$(echo "$AUDIT_JSON" | node -e "
  const d = JSON.parse(require('fs').readFileSync(0,'utf8'));
  const v = (d.metadata && d.metadata.vulnerabilities) || {};
  console.log(v.moderate || 0);
")
low=$(echo "$AUDIT_JSON" | node -e "
  const d = JSON.parse(require('fs').readFileSync(0,'utf8'));
  const v = (d.metadata && d.metadata.vulnerabilities) || {};
  console.log(v.low || 0);
")
info=$(echo "$AUDIT_JSON" | node -e "
  const d = JSON.parse(require('fs').readFileSync(0,'utf8'));
  const v = (d.metadata && d.metadata.vulnerabilities) || {};
  console.log(v.info || 0);
")
total=$(( critical + high + moderate + low + info ))

# ── Summary table ──────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Dependency Vulnerability Summary    ║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════╣${NC}"

if (( critical > 0 )); then
  echo -e "║  ${RED}Critical : ${critical}${NC}$(printf '%*s' $((26 - ${#critical})) '')║"
else
  echo -e "║  ${GREEN}Critical : 0${NC}                         ║"
fi

if (( high > 0 )); then
  echo -e "║  ${RED}High     : ${high}${NC}$(printf '%*s' $((26 - ${#high})) '')║"
else
  echo -e "║  ${GREEN}High     : 0${NC}                         ║"
fi

if (( moderate > 0 )); then
  echo -e "║  ${YELLOW}Moderate : ${moderate}${NC}$(printf '%*s' $((26 - ${#moderate})) '')║"
else
  echo -e "║  ${GREEN}Moderate : 0${NC}                         ║"
fi

if (( low > 0 )); then
  echo -e "║  ${YELLOW}Low      : ${low}${NC}$(printf '%*s' $((26 - ${#low})) '')║"
else
  echo -e "║  ${GREEN}Low      : 0${NC}                         ║"
fi

echo -e "║  Info     : ${info}$(printf '%*s' $((25 - ${#info})) '')║"
echo -e "║  ────────────────────                ║"
echo -e "║  Total    : ${total}$(printf '%*s' $((25 - ${#total})) '')║"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""

# ── Fixable preview ────────────────────────────────────────────────────────
if (( total > 0 )); then
  echo -e "${BOLD}Fixable vulnerabilities (dry-run):${NC}"
  npm audit fix --dry-run 2>/dev/null || true
  echo ""
fi

# ── Exit code ──────────────────────────────────────────────────────────────
if (( critical > 0 || high > 0 )); then
  echo -e "${RED}${BOLD}FAIL${NC} — ${critical} critical, ${high} high vulnerabilities found."
  exit 1
fi

if (( moderate > 0 || low > 0 )); then
  echo -e "${YELLOW}${BOLD}WARN${NC} — ${moderate} moderate, ${low} low vulnerabilities (non-blocking)."
  exit 0
fi

echo -e "${GREEN}${BOLD}PASS${NC} — No vulnerabilities detected."
exit 0
