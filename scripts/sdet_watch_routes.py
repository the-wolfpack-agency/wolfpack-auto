#!/usr/bin/env python3
"""
sdet_watch_routes.py — Find uncovered Next.js API routes and optionally generate tests.

Scans wolfpack-auto/src/app/api/**/*.ts for route files (files named route.ts),
checks whether a corresponding .spec.ts exists anywhere under wolfpack-auto/tests/,
and reports or generates tests for routes with no coverage.

Usage:
    # Report only
    python scripts/sdet_watch_routes.py

    # Generate tests for uncovered routes (calls sdet_auto_coverage.py per route)
    python scripts/sdet_watch_routes.py --generate

    # Custom base URL
    python scripts/sdet_watch_routes.py --generate --base-url http://localhost:3001

Exit codes:
    0  — all routes covered (or generation succeeded for all uncovered)
    1  — uncovered routes found (report-only mode)
    2  — one or more generation attempts failed

This script is runnable from the AgenticQA repo root or from wolfpack-auto/.
"""
import argparse
import subprocess
import sys
from pathlib import Path


def _find_agenticqa_root() -> Path:
    """Walk up from this script's location to find the AgenticQA repo root."""
    here = Path(__file__).resolve()
    # This script lives at wolfpack-auto/scripts/sdet_watch_routes.py
    # AgenticQA root is two levels up.
    return here.parent.parent.parent


def _find_route_files(wolfpack_dir: Path) -> list[Path]:
    """Return all route.ts files under wolfpack-auto/src/app/api/."""
    api_dir = wolfpack_dir / "src" / "app" / "api"
    if not api_dir.exists():
        return []
    return sorted(api_dir.rglob("route.ts"))


def _find_test_files(wolfpack_dir: Path) -> list[Path]:
    """Return all .spec.ts files under wolfpack-auto/tests/."""
    tests_dir = wolfpack_dir / "tests"
    if not tests_dir.exists():
        return []
    return list(tests_dir.rglob("*.spec.ts"))


def _route_slug_from_path(route_file: Path, wolfpack_dir: Path) -> str:
    """
    Derive the expected slug for a route file — must match SDETAgent._ts_route_slug().
    Example: wolfpack-auto/src/app/api/inventory/spotlight/route.ts -> api-inventory-spotlight
    """
    import re
    parts = route_file.relative_to(wolfpack_dir).parts
    try:
        app_idx = list(parts).index("app")
    except ValueError:
        return route_file.stem

    route_parts = list(parts[app_idx + 1:])
    # Drop 'route.ts'
    if route_parts and route_parts[-1].startswith("route."):
        route_parts = route_parts[:-1]
    # Sanitize dynamic segments
    clean = []
    for p in route_parts:
        p = re.sub(r"\[+\.{0,3}", "", p)
        p = re.sub(r"\]+", "", p)
        p = re.sub(r"[^a-zA-Z0-9\-]", "-", p).strip("-")
        if p:
            clean.append(p)
    return "-".join(clean) or "route"


def _has_coverage(route_file: Path, wolfpack_dir: Path, test_files: list[Path]) -> bool:
    """
    Return True if any .spec.ts file in tests/ covers this route.

    Matching strategy (any of these counts as covered):
    1. A spec file whose name contains the route slug (e.g. api-inventory-spotlight.spec.ts)
    2. A spec file whose name contains the directory name (e.g. spotlight.spec.ts)
    3. A spec file that contains the route path as a string literal
    """
    slug = _route_slug_from_path(route_file, wolfpack_dir)
    dir_name = route_file.parent.name  # e.g. "spotlight"

    for spec in test_files:
        spec_name = spec.name
        # Match 1: slug in spec filename
        if slug in spec_name:
            return True
        # Match 2: directory name in spec filename (simple heuristic)
        if dir_name in spec_name and dir_name not in ("api", "app", "src"):
            return True
        # Match 3: route path string in spec content (read only first 4000 chars)
        try:
            parts = route_file.parts
            app_idx = list(parts).index("app")
            route_path = "/" + "/".join(parts[app_idx + 1: -1])
            content = spec.read_text(errors="replace")[:4000]
            if route_path in content:
                return True
        except (ValueError, OSError):
            pass

    return False


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Scan for uncovered Next.js API routes and optionally generate Playwright tests"
    )
    parser.add_argument(
        "--generate",
        action="store_true",
        help="Generate Playwright tests for each uncovered route via sdet_auto_coverage.py",
    )
    parser.add_argument(
        "--base-url",
        default="http://localhost:3000",
        help="Base URL passed to sdet_auto_coverage.py (default: http://localhost:3000)",
    )
    parser.add_argument(
        "--playwright-config",
        default="wolfpack-auto/playwright.config.ts",
        help="Playwright config path, relative to AgenticQA root",
    )
    args = parser.parse_args()

    agenticqa_root = _find_agenticqa_root()
    wolfpack_dir = agenticqa_root / "wolfpack-auto"

    if not wolfpack_dir.exists():
        print(f"[ERROR] wolfpack-auto not found at {wolfpack_dir}", file=sys.stderr)
        return 1

    route_files = _find_route_files(wolfpack_dir)
    test_files = _find_test_files(wolfpack_dir)

    print(f"[sdet_watch_routes] Found {len(route_files)} route.ts file(s)")
    print(f"[sdet_watch_routes] Found {len(test_files)} .spec.ts file(s)")
    print()

    covered = []
    uncovered = []

    for route_file in route_files:
        rel = route_file.relative_to(wolfpack_dir)
        if _has_coverage(route_file, wolfpack_dir, test_files):
            covered.append(rel)
        else:
            uncovered.append(rel)

    # Report
    print(f"Covered routes ({len(covered)}):")
    for r in covered:
        print(f"  [OK] {r}")

    print()
    print(f"Uncovered routes ({len(uncovered)}):")
    for r in uncovered:
        print(f"  [!!] {r}")

    if not uncovered:
        print("\nAll routes have test coverage.")
        return 0

    if not args.generate:
        print(
            f"\n{len(uncovered)} route(s) lack test coverage. "
            "Run with --generate to auto-generate Playwright tests."
        )
        return 1

    # Generate tests for each uncovered route
    print(f"\nGenerating tests for {len(uncovered)} uncovered route(s) ...")
    script_path = Path(__file__).parent / "sdet_auto_coverage.py"
    failures = []

    for rel in uncovered:
        route_file_arg = f"wolfpack-auto/{rel}"
        print(f"\n--- Generating for {rel} ---")
        cmd = [
            sys.executable,
            str(script_path),
            "--route-file", str(rel),
            "--base-url", args.base_url,
            "--playwright-config", args.playwright_config,
        ]
        proc = subprocess.run(cmd, cwd=str(agenticqa_root))
        if proc.returncode != 0:
            failures.append(str(rel))
            print(f"[FAIL] Generation failed for {rel}")
        else:
            print(f"[OK] Generated for {rel}")

    if failures:
        print(f"\n{len(failures)} generation failure(s):")
        for f in failures:
            print(f"  {f}")
        return 2

    print(f"\nAll {len(uncovered)} uncovered routes now have generated tests.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
