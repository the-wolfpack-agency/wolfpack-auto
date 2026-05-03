#!/usr/bin/env bash
# verify.sh — pre-push gate. Output format pinned by
# src/__tests__/verify-script.test.ts:
#   - prints "verify summary" at the end
#   - prints "[PASS] <stage>" or "[FAIL] <stage>" per stage
#   - exits non-zero if any stage failed
# All three stages run regardless of earlier failures so we surface
# every problem in one log instead of fix-one, run-again, fix-next.

set -u
cd "$(dirname "$0")/.."

declare -a STAGES=(
  "lint:npx eslint . --max-warnings 0"
  "typecheck:npx tsc --noEmit"
  "unit-tests:npx jest --silent"
)

declare -a RESULTS=()
fail_count=0
n=0

for entry in "${STAGES[@]}"; do
  n=$((n + 1))
  name="${entry%%:*}"
  cmd="${entry#*:}"
  echo "=== [$n] $name ==="
  if eval "$cmd"; then
    RESULTS+=("[PASS] $name")
  else
    RESULTS+=("[FAIL] $name")
    fail_count=$((fail_count + 1))
  fi
done

echo "=== verify summary ==="
for line in "${RESULTS[@]}"; do
  echo "$line"
done

if [ "$fail_count" -gt 0 ]; then
  echo "verify: $fail_count stage(s) failed"
  exit 1
fi
echo "verify: all $n stages passed"
exit 0
