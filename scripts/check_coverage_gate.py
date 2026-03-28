#!/usr/bin/env python3
"""
check_coverage_gate.py — Pre-commit developer reminder for route test coverage.

Gets the list of staged files from git, filters for Next.js API route files
(src/app/api/**/route.ts), and checks whether each has a corresponding test.

Does NOT hard-fail (exits 0 always) — this is a developer reminder only.
The GitHub Actions workflow is the hard gate.

Usage:
    python scripts/check_coverage_gate.py

Exit codes:
    0 — always (warn-only mode; GitHub Actions is the enforcement gate)
"""
import subprocess
import sys
from pathlib import Path


def _find_wolfpack_dir() -> Path:
    """Resolve wolfpack-auto/ directory relative to this script."""
    here = Path(__file__).resolve().parent  # wolfpack-auto/scripts/
    return here.parent  # wolfpack-auto/


def _get_staged_files() -> list[str]:
    """Return list of staged file paths from git diff --cached."""
    try:
        result = subprocess.run(
            ["git", "diff", "--cached", "--name-only"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            return []
        return [line.strip() for line in result.stdout.splitlines() if line.strip()]
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []


def _is_route_file(path: str) -> bool:
    """Return True if the file matches src/app/api/**/route.ts."""
    p = Path(path)
    parts = p.parts
    try:
        src_idx = list(parts).index("src")
        # Expect: src / app / api / ... / route.ts
        return (
            len(parts) > src_idx + 3
            and parts[src_idx + 1] == "app"
            and parts[src_idx + 2] == "api"
            and p.name == "route.ts"
        )
    except ValueError:
        return False


def _route_slug_from_path(route_file: Path, wolfpack_dir: Path) -> str:
    """
    Derive the expected slug for a route file.
    Matches the logic in sdet_watch_routes.py / SDETAgent._ts_route_slug().
    Example: src/app/api/inventory/spotlight/route.ts -> api-inventory-spotlight
    """
    import re
    try:
        parts = route_file.relative_to(wolfpack_dir).parts
    except ValueError:
        parts = route_file.parts

    try:
        app_idx = list(parts).index("app")
    except ValueError:
        return route_file.stem

    route_parts = list(parts[app_idx + 1:])
    if route_parts and route_parts[-1].startswith("route."):
        route_parts = route_parts[:-1]

    clean = []
    for p in route_parts:
        p = re.sub(r"\[+\.{0,3}", "", p)
        p = re.sub(r"\]+", "", p)
        p = re.sub(r"[^a-zA-Z0-9\-]", "-", p).strip("-")
        if p:
            clean.append(p)
    return "-".join(clean) or "route"


def _find_test_files(wolfpack_dir: Path) -> list[Path]:
    """Return all .spec.ts files under wolfpack-auto/tests/."""
    tests_dir = wolfpack_dir / "tests"
    if not tests_dir.exists():
        return []
    return list(tests_dir.rglob("*.spec.ts"))


def _has_coverage(route_file: Path, wolfpack_dir: Path, test_files: list[Path]) -> bool:
    """
    Return True if any .spec.ts covers this route.

    Matching strategy (any counts):
    1. Spec filename contains the route slug
    2. Spec filename contains the route directory name
    3. Spec file content references the route path as a string literal
    """
    slug = _route_slug_from_path(route_file, wolfpack_dir)
    dir_name = route_file.parent.name

    for spec in test_files:
        spec_name = spec.name
        if slug in spec_name:
            return True
        if dir_name in spec_name and dir_name not in ("api", "app", "src"):
            return True
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
    wolfpack_dir = _find_wolfpack_dir()

    # Get staged files
    staged = _get_staged_files()

    # Filter to route files — accept paths relative to repo root or wolfpack-auto/
    route_paths: list[Path] = []
    for f in staged:
        p = Path(f)
        # Path may be relative to git root (wolfpack-auto/src/...) or to wolfpack-auto (src/...)
        if _is_route_file(str(p)):
            # Determine absolute path
            candidate = wolfpack_dir / p
            if not candidate.exists():
                # Try relative to git root (one level up from wolfpack_dir)
                candidate = wolfpack_dir.parent / p
            if candidate.exists():
                route_paths.append(candidate)
            else:
                # Use as-is for reporting even if file doesn't exist yet
                route_paths.append(wolfpack_dir / p)

    if not route_paths:
        print("[coverage-gate] No staged API route files detected — skipping coverage check.")
        return 0

    test_files = _find_test_files(wolfpack_dir)

    covered = []
    uncovered = []

    for route_file in route_paths:
        if _has_coverage(route_file, wolfpack_dir, test_files):
            covered.append(route_file)
        else:
            uncovered.append(route_file)

    total = len(route_paths)
    covered_count = len(covered)

    print(f"\n[coverage-gate] Staged route coverage: {covered_count}/{total} routes have test coverage")

    if covered:
        for r in covered:
            try:
                rel = r.relative_to(wolfpack_dir)
            except ValueError:
                rel = r
            print(f"  [OK]   {rel}")

    if uncovered:
        print()
        print("[coverage-gate] WARNING — the following staged routes have NO test coverage:")
        for r in uncovered:
            try:
                rel = r.relative_to(wolfpack_dir)
            except ValueError:
                rel = r
            print(f"  [WARN] {rel}")
        print()
        print("[coverage-gate] Tip: run `python scripts/sdet_watch_routes.py --generate` to auto-generate tests.")
        print("[coverage-gate] Note: This is a developer reminder only. The CI workflow is the hard gate.")

    # Always exit 0 — warn-only, never block
    return 0


if __name__ == "__main__":
    sys.exit(main())
