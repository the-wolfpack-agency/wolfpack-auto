#!/usr/bin/env python3
"""
scan_analytics_coverage.py — enumerate every interactive surface in
the codebase so the analytics canary can drive each one.

Why this is tooling (not AI grep):
  Codified discovery scales. Add a feature → re-run the script → the
  canary spec auto-picks up the new clickable surfaces and verifies
  they emit the right events.

What it finds:
  - Every page route under src/app (admin + public).
  - Every button / link / form / data-track element on each page,
    extracted from the page source.

Output:
  JSON to stdout (or file via --output).

Schema:
  {
    "scanned_at": ISO,
    "pages": [
      {
        "route": "/admin/heatmaps",
        "file": "src/app/admin/heatmaps/page.tsx",
        "interactive_count": 12,
        "data_tracks": ["heatmap_compare", ...]
      },
      ...
    ]
  }

The Playwright canary reads this JSON to decide what to click on.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_DIR = ROOT / "src" / "app"
SKIP_FRAGMENTS = (
    "/__tests__/",
    "/__mocks__/",
    "/api/",
    ".test.",
    ".spec.",
)


def page_route_for(path: Path) -> str:
    """Convert src/app/admin/heatmaps/page.tsx to /admin/heatmaps."""
    rel = path.relative_to(APP_DIR).parent
    parts = []
    for seg in rel.parts:
        # Strip route groups like (dashboard)
        if seg.startswith("(") and seg.endswith(")"):
            continue
        parts.append(seg)
    route = "/" + "/".join(parts)
    return route.replace("//", "/").rstrip("/") or "/"


RE_DATA_TRACK = re.compile(r'data-track\s*=\s*"([^"]+)"')
RE_BUTTON = re.compile(r"<button\b", re.IGNORECASE)
RE_LINK = re.compile(r"<a\b[^>]*href", re.IGNORECASE)
RE_FORM = re.compile(r"<form\b", re.IGNORECASE)
RE_INPUT = re.compile(r"<input\b", re.IGNORECASE)
RE_DYNAMIC_SEG = re.compile(r"\[\.\.\.|\[[A-Za-z][^\]]*\]")


def scan_page(path: Path) -> dict:
    text = path.read_text(encoding="utf-8", errors="replace")
    return {
        "route": page_route_for(path),
        "file": str(path.relative_to(ROOT)),
        "is_dynamic": bool(RE_DYNAMIC_SEG.search(str(path.relative_to(ROOT)))),
        "interactive_count": (
            len(RE_BUTTON.findall(text))
            + len(RE_LINK.findall(text))
            + len(RE_INPUT.findall(text))
        ),
        "buttons": len(RE_BUTTON.findall(text)),
        "links": len(RE_LINK.findall(text)),
        "forms": len(RE_FORM.findall(text)),
        "inputs": len(RE_INPUT.findall(text)),
        "data_tracks": sorted(set(RE_DATA_TRACK.findall(text))),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--output", help="write JSON here (default: stdout)")
    ap.add_argument(
        "--admin-only",
        action="store_true",
        help="restrict to /admin/* routes (analytics auto-consents there)",
    )
    args = ap.parse_args()

    pages = []
    for p in APP_DIR.rglob("page.tsx"):
        rel = str(p)
        if any(frag in rel for frag in SKIP_FRAGMENTS):
            continue
        info = scan_page(p)
        if args.admin_only and not info["route"].startswith("/admin"):
            continue
        if info["is_dynamic"]:
            continue  # dynamic routes need fixtures the canary doesn't have
        pages.append(info)

    pages.sort(key=lambda x: x["route"])

    payload = {
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "page_count": len(pages),
        "pages": pages,
    }

    out = json.dumps(payload, indent=2)
    if args.output:
        Path(args.output).write_text(out + "\n", encoding="utf-8")
        print(f"wrote {len(pages)} pages → {args.output}", file=sys.stderr)
    else:
        sys.stdout.write(out + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
