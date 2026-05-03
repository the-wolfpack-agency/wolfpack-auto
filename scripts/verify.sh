#!/usr/bin/env bash
# verify.sh — pre-push gate. Output format pinned by
# src/__tests__/verify-script.test.ts:
#   - prints "verify summary" at the end
#   - prints "[PASS] <stage>", "[FAIL] <stage>", or "[SKIP] <stage>" per stage
#   - exits non-zero if any stage failed
# All stages run regardless of earlier failures so we surface every problem
# in one log instead of fix-one, run-again, fix-next.
#
# Stages drive npm scripts so the local + CI behavior is identical:
#   lint         → npm run lint
#   typecheck    → npm run type-check
#   unit-tests   → npm run test:unit
#   e2e-smoke    → npm run test:e2e:smoke (skipped when VERIFY_SKIP_E2E=1)

set -u
cd "$(dirname "$0")/.."

declare -a RESULTS=()
fail_count=0
n=0

step() {
  # step <name> <skip-cond:0|1> <cmd...>
  n=$((n + 1))
  local name="$1"
  local skip="$2"
  shift 2
  echo "=== [$n] $name ==="
  if [ "$skip" = "1" ]; then
    echo "(skipped)"
    RESULTS+=("[SKIP] $name")
    return 0
  fi
  if "$@"; then
    RESULTS+=("[PASS] $name")
  else
    RESULTS+=("[FAIL] $name")
    fail_count=$((fail_count + 1))
  fi
}

# Stages — names match the verify-script.test.ts regex.
step "lint"       0 npm run lint --silent
step "typecheck"  0 npm run type-check --silent
step "unit-tests" 0 npm run test:unit --silent

skip_e2e=0
if [ "${VERIFY_SKIP_E2E:-0}" = "1" ] || [ "${CI:-}" = "true" ]; then
  # E2E needs a dev server; skip it inside the verify gate. CI runs e2e
  # in a dedicated job. Local devs can opt-in by unsetting VERIFY_SKIP_E2E.
  skip_e2e=1
fi
step "e2e-smoke"  "$skip_e2e" npm run test:e2e:smoke --silent

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
