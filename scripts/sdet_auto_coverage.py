#!/usr/bin/env python3
"""
sdet_auto_coverage.py — Auto-generate Playwright tests for a single Next.js route file.

Usage:
    python scripts/sdet_auto_coverage.py \
        --route-file src/app/api/inventory/spotlight/route.ts \
        [--base-url http://localhost:3000] \
        [--playwright-config wolfpack-auto/playwright.config.ts] \
        [--output-dir wolfpack-auto/tests/shadow-hardening/auto] \
        [--run-tests]

Exit codes:
    0  — success (tests generated, and if --run-tests, all passed)
    1  — generation failure (LLM error, validation failed, file exists, etc.)
    2  — test execution failure (generated OK but playwright tests failed)

This script is designed to be run from the AgenticQA repo root:
    /Users/nicholashomyk/mono/AgenticQA/
"""
import argparse
import subprocess
import sys
from pathlib import Path


def _find_agenticqa_root() -> Path:
    """Walk up from this script's location to find the AgenticQA repo root."""
    here = Path(__file__).resolve()
    # This script lives at wolfpack-auto/scripts/sdet_auto_coverage.py
    # AgenticQA root is two levels up.
    return here.parent.parent.parent


def _ensure_src_on_path(agenticqa_root: Path) -> None:
    """Add AgenticQA/src to sys.path so agents.py is importable."""
    src = str(agenticqa_root / "src")
    if src not in sys.path:
        sys.path.insert(0, src)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate Playwright tests for a Next.js route file via SDETAgent"
    )
    parser.add_argument(
        "--route-file",
        required=True,
        help=(
            "Path to the route.ts file, relative to the wolfpack-auto directory. "
            "Example: src/app/api/inventory/spotlight/route.ts"
        ),
    )
    parser.add_argument(
        "--base-url",
        default="http://localhost:3000",
        help="Base URL for the running Next.js server (default: http://localhost:3000)",
    )
    parser.add_argument(
        "--playwright-config",
        default="",
        help=(
            "Path to playwright.config.ts, relative to the AgenticQA repo root. "
            "Example: wolfpack-auto/playwright.config.ts"
        ),
    )
    parser.add_argument(
        "--output-dir",
        default="",
        help=(
            "Output directory for generated .spec.ts files, relative to repo root. "
            "Defaults to wolfpack-auto/tests/shadow-hardening/auto/"
        ),
    )
    parser.add_argument(
        "--run-tests",
        action="store_true",
        help="Run the generated Playwright tests after generation (requires server running)",
    )
    args = parser.parse_args()

    agenticqa_root = _find_agenticqa_root()
    _ensure_src_on_path(agenticqa_root)

    # Normalise route-file path: strip leading wolfpack-auto/ if present
    route_file_raw = args.route_file.lstrip("/")
    if route_file_raw.startswith("wolfpack-auto/"):
        # Pass as-is — SDETAgent resolves relative to repo_path (agenticqa_root)
        route_file = route_file_raw
    else:
        # Prefix so SDETAgent can find it under agenticqa_root/wolfpack-auto/
        route_file = f"wolfpack-auto/{route_file_raw}"

    # Resolve output dir
    output_dir = args.output_dir
    if not output_dir:
        output_dir = str(
            agenticqa_root / "wolfpack-auto" / "tests" / "shadow-hardening" / "auto"
        )

    # Playwright config — relative to repo root
    playwright_config = args.playwright_config or "wolfpack-auto/playwright.config.ts"

    # Build gap dict
    gap = {
        "file": route_file,
        "type": "untested_api_route",
        "priority": "high",
        "base_url": args.base_url,
        "playwright_config": playwright_config,
        "output_dir": output_dir,
    }

    print(f"[sdet_auto_coverage] AgenticQA root: {agenticqa_root}")
    print(f"[sdet_auto_coverage] Route file:     {route_file}")
    print(f"[sdet_auto_coverage] Output dir:     {output_dir}")
    print(f"[sdet_auto_coverage] Base URL:       {args.base_url}")

    # Instantiate SDETAgent (avoids full __init__ to skip Weaviate/DB connections)
    try:
        from agents import SDETAgent
        from unittest.mock import MagicMock
        agent = SDETAgent.__new__(SDETAgent)
        agent.agent_name = "SDET_Agent"
        agent.use_data_store = False
        agent.use_rag = False
        agent.rag = None
        agent.pipeline = None
        agent.pattern_analyzer = None
        agent.repo_profile = None
        agent.feedback = MagicMock()
        agent.outcome_tracker = MagicMock()
        agent._threshold_calibrator = MagicMock()
        agent._strategy_selector = None
        agent.agent_registry = None
        agent._delegation_depth = 0
        agent._last_retrieved_doc_ids = []
        agent.execution_history = []

        def _console_log(msg, level="INFO"):
            print(f"[{level}] {msg}")

        agent.log = _console_log
    except ImportError as exc:
        print(f"[ERROR] Cannot import SDETAgent: {exc}", file=sys.stderr)
        print(
            "Make sure you run this from the AgenticQA repo root or ensure AgenticQA/src is on PYTHONPATH.",
            file=sys.stderr,
        )
        return 1

    # Generate tests
    print("[sdet_auto_coverage] Calling SDETAgent._generate_tests_for_gap() ...")
    result = agent._generate_tests_for_gap(gap, str(agenticqa_root))

    if not result.get("generated"):
        print(f"[FAIL] Test generation failed: {result.get('error', 'unknown error')}", file=sys.stderr)
        return 1

    generated_file = result["file_path"]
    print(f"[OK] Generated: {generated_file}")

    # Count test() calls in generated file
    try:
        import re
        content = Path(generated_file).read_text()
        test_count = len(re.findall(r"\btest\s*\(", content))
        print(f"[OK] Tests in file: {test_count}")
    except Exception:
        pass

    if not args.run_tests:
        print("[sdet_auto_coverage] Done. Use --run-tests to execute the generated spec.")
        return 0

    # Run tests with playwright
    if not playwright_config:
        print("[WARN] No playwright config found; skipping test execution.", file=sys.stderr)
        return 0

    cfg_path = agenticqa_root / playwright_config
    if not cfg_path.exists():
        print(
            f"[WARN] Playwright config not found at {cfg_path}; skipping test execution.",
            file=sys.stderr,
        )
        return 0

    wolfpack_dir = agenticqa_root / "wolfpack-auto"
    cmd = [
        "npx", "playwright", "test",
        generated_file,
        "--project=chromium",
        f"--config={cfg_path}",
    ]
    print(f"[sdet_auto_coverage] Running: {' '.join(cmd)}")
    proc = subprocess.run(cmd, cwd=str(wolfpack_dir))
    if proc.returncode != 0:
        print(f"[FAIL] Playwright tests failed (exit {proc.returncode})", file=sys.stderr)
        return 2

    print("[OK] All playwright tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
