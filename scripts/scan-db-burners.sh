#!/usr/bin/env bash
# scan-db-burners.sh — find code paths likely to be burning Neon's
# data-transfer quota. Codified per the "no AI greps" rule.
#
# Five buckets we surface, with the rationale for each:
#  1. Cron-driven full-table reads — schedule × every-row scan = predictable burn
#  2. Polling client hooks (setInterval) — every browser tab repeats forever
#  3. Routes with no LIMIT on SELECT — accidental full scans
#  4. Routes hit on every middleware pass — multiplied by traffic volume
#  5. Background `waitUntil` calls that pull data on every request
#
# Output: structured report per bucket with file:line refs.
#
# Usage:  bash scripts/scan-db-burners.sh
set -uo pipefail
# Tolerate non-matching greps (exit 1) without aborting the scan.
cd "$(dirname "$0")/.."

echo "================================================================"
echo "DB-burner scan — wolfpack-auto"
echo "Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "================================================================"
echo

echo "## Bucket 1: Cron-driven full-table reads"
echo "Vercel crons that hit the DB. Each schedule × table size = daily egress."
echo
for crondir in src/app/api/cron/*/; do
  name="$(basename "$crondir")"
  route="$crondir/route.ts"
  [ -f "$route" ] || continue
  echo "  cron: $name"
  # SELECT-without-LIMIT inside this cron
  grep -nE "SELECT [^;]*FROM\s+(\`)?\w+(\s|$)" "$route" 2>/dev/null \
    | grep -viE "LIMIT|COUNT\(\*\)|EXISTS" \
    | head -5 \
    | sed 's/^/    [no-LIMIT] /'
  # Any safeQuery / pool.query loops
  grep -nE "pool\.query|safeQuery" "$route" 2>/dev/null \
    | wc -l \
    | xargs -I{} echo "    queries-in-file: {}"
  echo
done

echo "## Bucket 2: Client-side polling hooks"
echo "setInterval calling /api/* — multiplied by every open browser tab."
echo
grep -rEn "setInterval\s*\(" src/ 2>/dev/null \
  | grep -viE "test|spec|__tests__" \
  | head -20 \
  | sed 's/^/  /'
echo

echo "## Bucket 3: SELECT without LIMIT on writable routes"
echo "Routes that may return full tables. High traffic × full scan = burn."
echo
# Limit to api routes; ignore test files
grep -rEn "SELECT\s+[*\w,\s]+FROM\s+\w+" src/app/api/ 2>/dev/null \
  | grep -viE "LIMIT|COUNT\(\*\)|EXISTS|test|spec|migration" \
  | head -30 \
  | sed 's/^/  /'
echo

echo "## Bucket 4: Middleware DB hits"
echo "Anything called from middleware.ts that touches the DB fires on EVERY request."
echo
if [ -f src/middleware.ts ]; then
  grep -nE "pool\.query|safeQuery|getDealer|tenant-resolver|requireAuth" src/middleware.ts 2>/dev/null \
    | head -10 \
    | sed 's/^/  /'
else
  echo "  (no src/middleware.ts)"
fi
echo

echo "## Bucket 5: waitUntil / fire-and-forget DB writes"
echo "waitUntil() with DB calls extend the request lifecycle silently."
echo
grep -rEn "waitUntil\s*\(" src/app/api/ 2>/dev/null \
  | head -10 \
  | sed 's/^/  /'
echo

echo "## Bucket 6: Triple-write fan-out hot paths"
echo "Every triple-write fires Postgres + Qdrant + Neo4j. Loops here are multiplied 3x."
echo
grep -rEn "tripleWrite|triple_write" src/app/api/ src/lib/ 2>/dev/null \
  | grep -viE "test|spec|__tests__|^.*://" \
  | head -10 \
  | sed 's/^/  /'
echo

echo "## Bucket 7: Analytics aggregations"
echo "analytics_events / micro_behavioral_* views — these aggregate large tables."
echo
grep -rEn "FROM analytics_events|FROM micro_behavioral_|analytics-engine" src/app/api/ src/lib/ 2>/dev/null \
  | head -10 \
  | sed 's/^/  /'
echo

echo "================================================================"
echo "Scan complete."
echo "================================================================"
