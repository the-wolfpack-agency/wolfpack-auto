#!/usr/bin/env bash
# generate_all_missing_tests.sh — Generate Playwright tests for all uncovered API routes.
#
# Usage:
#   bash scripts/generate_all_missing_tests.sh [--base-url <url>]
#
# Options:
#   --base-url  Base URL of the running Next.js server (default: http://localhost:3000)
#
# Exit codes:
#   0  — all uncovered routes now have generated tests
#   1  — one or more generation attempts failed
#   2  — sdet_watch_routes.py itself reported an error
#
# Run from the wolfpack-auto/ directory or from the AgenticQA repo root.

set -euo pipefail

BASE_URL="http://localhost:3000"

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    *)
      echo "[generate_all_missing_tests] Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Resolve script location to find wolfpack-auto/ and AgenticQA root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WOLFPACK_DIR="$(dirname "$SCRIPT_DIR")"   # wolfpack-auto/
AGENTICQA_ROOT="$(dirname "$WOLFPACK_DIR")"  # AgenticQA/

AUTO_DIR="${WOLFPACK_DIR}/tests/shadow-hardening/auto"

echo "============================================================"
echo " generate_all_missing_tests.sh"
echo " AgenticQA root : ${AGENTICQA_ROOT}"
echo " wolfpack-auto  : ${WOLFPACK_DIR}"
echo " Base URL       : ${BASE_URL}"
echo " Auto output dir: ${AUTO_DIR}"
echo "============================================================"
echo ""

# Step 1: Run sdet_watch_routes.py --generate
echo "[Step 1] Calling sdet_watch_routes.py --generate ..."
python "${SCRIPT_DIR}/sdet_watch_routes.py" \
    --generate \
    --base-url "${BASE_URL}" \
    2>&1
WATCH_EXIT=$?

if [[ $WATCH_EXIT -eq 0 ]]; then
    echo ""
    echo "[Step 1] All routes covered or successfully generated."
elif [[ $WATCH_EXIT -eq 2 ]]; then
    echo ""
    echo "[Step 1] WARNING: One or more generation attempts failed (exit 2)."
elif [[ $WATCH_EXIT -eq 1 ]]; then
    echo ""
    echo "[Step 1] NOTE: Uncovered routes remain but --generate was not called (exit 1)."
fi

echo ""

# Step 2: Check newly generated files in tests/shadow-hardening/auto/
echo "[Step 2] Checking auto/ directory for generated spec files ..."
if [[ ! -d "${AUTO_DIR}" ]]; then
    echo "  No auto/ directory found at ${AUTO_DIR} — nothing was generated."
    GENERATED_COUNT=0
else
    GENERATED_COUNT=$(find "${AUTO_DIR}" -name "*.spec.ts" | wc -l | tr -d ' ')
    echo "  Found ${GENERATED_COUNT} generated spec file(s) in ${AUTO_DIR}/"
    if [[ $GENERATED_COUNT -gt 0 ]]; then
        echo ""
        echo "  Generated files:"
        find "${AUTO_DIR}" -name "*.spec.ts" | sort | while read -r f; do
            echo "    ${f}"
        done
    fi
fi

echo ""

# Step 3: Summary
echo "============================================================"
echo " Summary"
echo "============================================================"
echo "  sdet_watch_routes.py exit code : ${WATCH_EXIT}"
echo "  Generated spec files in auto/  : ${GENERATED_COUNT}"
echo ""

if [[ $WATCH_EXIT -eq 0 ]]; then
    echo "  Result: SUCCESS — all routes have test coverage."
    exit 0
elif [[ $WATCH_EXIT -eq 2 ]]; then
    echo "  Result: PARTIAL — some generation attempts failed. Review output above."
    exit 1
else
    echo "  Result: DONE — review sdet_watch_routes.py output above for details."
    exit 0
fi
