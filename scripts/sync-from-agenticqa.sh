#!/usr/bin/env bash
#
# sync-from-agenticqa.sh
#
# Pulls the latest AgenticQA scanner scripts from the canonical parent repo
# (nhomyk/AgenticQA, checked out at $AGENTICQA_ROOT) into wolfpack-auto's
# scripts/ directory. This is the Pattern A "manual sync with manifest"
# approach from docs/wolfpack-platform-multivertical-2026-05-12.md.
#
# Why this exists:
#   AgenticQA is the user's personal-IP scanner platform. wolfpack-auto's
#   CI invokes a subset of its scripts via the agenticqa-full-pipeline.yml
#   workflow. To avoid silent drift between the source-of-truth scripts in
#   nhomyk/AgenticQA and the copies in wolfpack-auto, this script diffs
#   them, shows changes, and copies them on approval.
#
# Usage:
#   scripts/sync-from-agenticqa.sh                # interactive diff + approve
#   scripts/sync-from-agenticqa.sh --apply        # apply without prompting
#   scripts/sync-from-agenticqa.sh --check        # exit 1 if drift detected (CI use)
#
# Env:
#   AGENTICQA_ROOT — path to the canonical AgenticQA repo
#                    (defaults to ../, i.e. the parent of wolfpack-auto)

set -euo pipefail

# ---- Config -----------------------------------------------------------------

AGENTICQA_ROOT="${AGENTICQA_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
WOLFPACK_AUTO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Manifest of AgenticQA-sourced files that wolfpack-auto's pipeline depends on.
# Format: source_relative_to_agenticqa_root  dest_relative_to_wolfpack_auto_root
MANIFEST=(
  "scripts/sre_autofix.py                       scripts/sre_autofix.py"
  "scripts/audit_app_security.py                scripts/audit_app_security.py"
  "scripts/audit_history_exposure.py            scripts/audit_history_exposure.py"
  "scripts/test_audit_app_security.py           scripts/test_audit_app_security.py"
  "scripts/probe_security_headers.py            scripts/probe_security_headers.py"
  "scripts/probe_error_disclosure.py            scripts/probe_error_disclosure.py"
  "scripts/branch_protection_enforcer.py        scripts/branch_protection_enforcer.py"
  "scripts/secret_age_tracker.py                scripts/secret_age_tracker.py"
)

# ---- Args -------------------------------------------------------------------

MODE="interactive"
case "${1:-}" in
  --apply) MODE="apply" ;;
  --check) MODE="check" ;;
  "")      MODE="interactive" ;;
  *)       echo "Unknown flag: $1"; exit 2 ;;
esac

# ---- Sanity checks ----------------------------------------------------------

if [[ ! -d "$AGENTICQA_ROOT" ]]; then
  echo "ERROR: AGENTICQA_ROOT not found: $AGENTICQA_ROOT" >&2
  exit 1
fi

if [[ ! -d "$AGENTICQA_ROOT/scripts" ]]; then
  echo "ERROR: $AGENTICQA_ROOT/scripts not found — is AGENTICQA_ROOT pointing at the right repo?" >&2
  exit 1
fi

if [[ ! -f "$WOLFPACK_AUTO_ROOT/package.json" ]]; then
  echo "ERROR: this script must be run from inside wolfpack-auto" >&2
  exit 1
fi

# ---- Diff phase -------------------------------------------------------------

CHANGED_FILES=()
MISSING_FILES=()

echo "Comparing wolfpack-auto/scripts/ against $AGENTICQA_ROOT/scripts/ ..."
echo ""

for entry in "${MANIFEST[@]}"; do
  src_rel=$(echo "$entry" | awk '{print $1}')
  dst_rel=$(echo "$entry" | awk '{print $2}')
  src="$AGENTICQA_ROOT/$src_rel"
  dst="$WOLFPACK_AUTO_ROOT/$dst_rel"

  if [[ ! -f "$src" ]]; then
    echo "  [missing source]    $src_rel"
    MISSING_FILES+=("$src_rel")
    continue
  fi

  if [[ ! -f "$dst" ]]; then
    echo "  [new file]          $dst_rel"
    CHANGED_FILES+=("$entry")
    continue
  fi

  if ! diff -q "$src" "$dst" >/dev/null 2>&1; then
    echo "  [drift detected]    $dst_rel"
    CHANGED_FILES+=("$entry")
  else
    echo "  [in sync]           $dst_rel"
  fi
done

echo ""

# ---- Check mode (CI gate) ---------------------------------------------------

if [[ "$MODE" == "check" ]]; then
  if [[ ${#CHANGED_FILES[@]} -gt 0 ]]; then
    echo "DRIFT: ${#CHANGED_FILES[@]} file(s) differ from AgenticQA source." >&2
    echo "Run: scripts/sync-from-agenticqa.sh --apply" >&2
    exit 1
  fi
  echo "OK: all manifest files in sync with AgenticQA source."
  exit 0
fi

# ---- Interactive prompt -----------------------------------------------------

if [[ ${#CHANGED_FILES[@]} -eq 0 ]]; then
  echo "All files in sync. Nothing to do."
  exit 0
fi

if [[ "$MODE" == "interactive" ]]; then
  echo "About to copy ${#CHANGED_FILES[@]} file(s) from $AGENTICQA_ROOT into wolfpack-auto."
  echo ""
  echo "Show full diff before applying? [d=diff, y=apply, n=cancel]"
  read -r response
  case "$response" in
    d|D)
      for entry in "${CHANGED_FILES[@]}"; do
        src_rel=$(echo "$entry" | awk '{print $1}')
        dst_rel=$(echo "$entry" | awk '{print $2}')
        echo ""
        echo "=== $dst_rel ==="
        diff -u "$WOLFPACK_AUTO_ROOT/$dst_rel" "$AGENTICQA_ROOT/$src_rel" || true
      done
      echo ""
      echo "Apply these changes? [y/N]"
      read -r confirm
      [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Cancelled."; exit 0; }
      ;;
    y|Y) ;;  # proceed
    *)   echo "Cancelled."; exit 0 ;;
  esac
fi

# ---- Apply phase ------------------------------------------------------------

for entry in "${CHANGED_FILES[@]}"; do
  src_rel=$(echo "$entry" | awk '{print $1}')
  dst_rel=$(echo "$entry" | awk '{print $2}')
  src="$AGENTICQA_ROOT/$src_rel"
  dst="$WOLFPACK_AUTO_ROOT/$dst_rel"
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  echo "  copied: $dst_rel"
done

# ---- Post-sync sanity -------------------------------------------------------

echo ""
echo "Validating agenticqa-full-pipeline.yml still parses ..."
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/agenticqa-full-pipeline.yml'))" \
  && echo "  workflow YAML OK"

# Smoke-check that synced Python files at least import without crashing
echo "Smoke-checking synced Python files ..."
for entry in "${CHANGED_FILES[@]}"; do
  dst_rel=$(echo "$entry" | awk '{print $2}')
  case "$dst_rel" in
    *.py)
      python3 -c "import ast; ast.parse(open('$WOLFPACK_AUTO_ROOT/$dst_rel').read())" \
        && echo "  $dst_rel parses cleanly"
      ;;
  esac
done

echo ""
echo "Sync complete. Review changes, run tests, then commit:"
echo "  git status --short"
echo "  npm run test:unit"
echo "  git add scripts/ && git commit -m 'chore: sync agenticqa scripts from canonical repo'"
