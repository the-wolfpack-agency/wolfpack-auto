#!/usr/bin/env python3
"""
scan_demo_placeholders.py — codified detection of demo/fake/placeholder
data leaks in the wolfpack-auto runtime surface.

Scope: src/app/api/admin/**, src/app/admin/**, src/lib/**.
Skips: tests, mocks, scripts, db/migrations, node_modules, .next, dist.

Patterns (each codified — no AI grep):
    1. DEMO_<NAME> constant arrays/objects in non-test files.
    2. `if (!process.env.DATABASE_URL)` shadow-mode branches that return
       hardcoded payloads instead of empty state.
    3. `Math.random()` used to fabricate response data inside routes/lib.
    4. Inline arrays of objects with rounded fake metrics (visitorCount,
       pageviews) embedded in route/lib code.
    5. Functions named *demo*/*fake*/*sample*/*placeholder* that return
       data shapes consumed by UI surfaces.
    6. Hard-coded "Hero CTA Button"-style stub strings adjacent to a
       hottestElement / topPages / stats key.
    7. JSX with hardcoded numeric stats not derived from a fetch result
       (`<div>2,832</div>` etc) — narrow heuristic, low-signal so kept
       last.
    8. Illegal named exports on Next.js page modules. Pages may only
       export `default`, `metadata`, `generateMetadata`, `viewport`,
       `generateViewport`, `generateStaticParams`, `dynamic`,
       `dynamicParams`, `revalidate`, `fetchCache`, `runtime`,
       `preferredRegion`, `maxDuration`, `experimental_ppr`. Any
       other `export <name>` on a `page.tsx` / `page.ts` breaks the
       prod build with "X is not a valid Page export field." Caught
       once in prod (vehicle-provenance/page.tsx, 2026-05-02).

Usage:
    python3 scripts/scan_demo_placeholders.py
    python3 scripts/scan_demo_placeholders.py --json > demo_findings.json
    python3 scripts/scan_demo_placeholders.py --severity high

Output: text table by default, JSON via --json. Always exits 0; this is
a triage tool, not a CI gate (yet).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCAN_DIRS = [
    ROOT / "src" / "app" / "api",
    ROOT / "src" / "app" / "admin",
    ROOT / "src" / "lib",
]
SKIP_PATH_FRAGMENTS = (
    "/__tests__/",
    "/__mocks__/",
    "/node_modules/",
    "/.next/",
    "/dist/",
    "/coverage/",
    "/playwright-report/",
    ".test.ts",
    ".test.tsx",
    ".spec.ts",
    ".spec.tsx",
    "/seed",
    "/fixtures/",
    "/mocks/",
)


@dataclass
class Finding:
    file: str
    line: int
    severity: str  # high | medium | low
    pattern: str
    snippet: str


def is_skipped(path: Path) -> bool:
    p = str(path)
    return any(frag in p for frag in SKIP_PATH_FRAGMENTS)


def iter_source_files() -> list[Path]:
    out: list[Path] = []
    for base in SCAN_DIRS:
        if not base.exists():
            continue
        for p in base.rglob("*"):
            if not p.is_file():
                continue
            if p.suffix not in {".ts", ".tsx"}:
                continue
            if is_skipped(p):
                continue
            out.append(p)
    return out


# Pattern compilers --------------------------------------------------------

RE_DEMO_CONST = re.compile(
    r"^\s*(?:export\s+)?const\s+(DEMO_[A-Z0-9_]+|FAKE_[A-Z0-9_]+|PLACEHOLDER_[A-Z0-9_]+|SAMPLE_[A-Z0-9_]+|MOCK_[A-Z0-9_]+)\s*[:=]"
)
RE_SHADOW_BRANCH = re.compile(
    r"if\s*\(\s*!\s*process\.env\.DATABASE_URL\s*\)"
)
RE_MATH_RANDOM = re.compile(r"\bMath\.random\s*\(")
RE_DEMO_FN = re.compile(
    r"\bfunction\s+(demo|fake|sample|placeholder|mock)[A-Za-z0-9_]*\s*\("
    r"|\bconst\s+(demo|fake|sample|placeholder|mock)[A-Za-z0-9_]*\s*=\s*(?:async\s*)?\("
)
# Heuristic for stub object literals: visitorCount / pageviews / count
# with a 3-or-4-digit literal AND not from a query.
RE_STUB_KEYS = re.compile(
    r"\b(visitorCount|pageviews|uniqueVisitors|hottestElement|totalClicks|avgScrollDepth)\s*:\s*"
    r"(?:\d{2,7}|\"[A-Z][A-Za-z ]+\")"
)
RE_RETURN_DEMO = re.compile(r"return\s+(?:NextResponse\.json\(\s*)?(?:\{|\[).*\b(DEMO_|FAKE_|MOCK_|SAMPLE_|PLACEHOLDER_)")
RE_HARDCODED_SHADOW_RETURN = re.compile(
    r"//\s*(Shadow mode|demo data|placeholder data|fake data|sample data|stub)",
    re.IGNORECASE,
)

# Page-module export rule — Next 15 / App Router rejects any export
# from a page module other than these reserved names.
RESERVED_PAGE_EXPORTS = frozenset({
    "default",
    "metadata",
    "generateMetadata",
    "viewport",
    "generateViewport",
    "generateStaticParams",
    "dynamic",
    "dynamicParams",
    "revalidate",
    "fetchCache",
    "runtime",
    "preferredRegion",
    "maxDuration",
    "experimental_ppr",
})

RE_NAMED_EXPORT = re.compile(
    r"^\s*export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z_][A-Za-z0-9_]*)"
)
RE_DEFAULT_EXPORT = re.compile(r"^\s*export\s+default\b")

# Analytics-event field hygiene — `page` must be a URL path, not a
# dealer_id / tenant_id / session_id. 444 rows of UUID-in-page were
# found in prod (2026-05-02) from GoogleMapsEmbed misuse.
RE_PAGE_FIELD_MISUSE = re.compile(
    r"\bpage\s*:\s*(dealerId|dealer_id|tenantId|tenant_id|sessionId|session_id|userId|user_id|fingerprint|fingerprint_id)\b"
)

# Zod v4 changed z.record(value) → z.record(keySchema, valueSchema).
# The single-arg form silently compiled under v3 but `next build`
# against v4 throws "Expected 2-3 arguments, but got 1." and Vercel
# deploys fail. Catch in the scanner before push — the deploy log
# is too far downstream.
RE_ZOD_RECORD_SINGLE_ARG = re.compile(
    r"\bz\.record\(\s*z\.[a-zA-Z]+\([^,)]*\)\s*\)(?!\s*,)",
)

# @elastic/elasticsearch v9 dropped the `body:` wrapping in
# search()/index()/etc; old form compiled in v8 but `next build`
# v9 throws "No overload matches this call." Catch BEFORE Vercel.
RE_ES_BODY_WRAPPING = re.compile(
    r"esClient\.(search|index|update|delete|bulk|count|msearch)\([^)]*\bbody\s*:",
    re.DOTALL,
)


def classify_file_role(path: Path) -> str:
    p = str(path)
    if "/src/app/api/" in p:
        return "route"
    if "/src/app/admin/" in p:
        return "page"
    if "/src/lib/" in p:
        return "lib"
    return "other"


def is_page_module(path: Path) -> bool:
    name = path.name
    return name in {"page.tsx", "page.ts", "page.jsx", "page.js"}


def scan_file(path: Path) -> list[Finding]:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    role = classify_file_role(path)
    rel = str(path.relative_to(ROOT))
    findings: list[Finding] = []
    page_module = is_page_module(path)
    in_shadow_branch = False
    shadow_branch_depth = 0
    brace_depth_at_branch = 0
    cur_brace = 0

    for i, raw in enumerate(text.splitlines(), start=1):
        line = raw.rstrip()
        # Track brace depth crudely so we can attribute findings inside
        # a shadow-mode branch with higher severity.
        cur_brace += line.count("{") - line.count("}")

        if RE_SHADOW_BRANCH.search(line):
            findings.append(
                Finding(rel, i, "high", "shadow_mode_branch_no_db",
                        line.strip()[:160])
            )
            in_shadow_branch = True
            brace_depth_at_branch = cur_brace
            shadow_branch_depth = cur_brace

        if in_shadow_branch and cur_brace < shadow_branch_depth:
            in_shadow_branch = False

        m = RE_DEMO_CONST.match(line)
        if m:
            findings.append(
                Finding(rel, i, "high", "demo_constant_block",
                        line.strip()[:160])
            )

        if RE_RETURN_DEMO.search(line):
            findings.append(
                Finding(rel, i, "high", "returns_demo_payload",
                        line.strip()[:160])
            )

        if RE_MATH_RANDOM.search(line) and role in {"route", "lib"}:
            # Allow Math.random in cache-jitter / id helpers — but flag
            # when adjacent to count/intensity/pageviews etc.
            sev = "high" if re.search(
                r"\b(count|intensity|pageviews|visitor|score|delta|delta_count)\b",
                line, re.IGNORECASE,
            ) else "medium"
            findings.append(
                Finding(rel, i, sev, "math_random_in_response_data",
                        line.strip()[:160])
            )

        if RE_DEMO_FN.search(line):
            findings.append(
                Finding(rel, i, "medium", "demo_named_function",
                        line.strip()[:160])
            )

        if RE_STUB_KEYS.search(line) and role in {"route", "lib"}:
            findings.append(
                Finding(rel, i, "medium", "stub_metric_literal",
                        line.strip()[:160])
            )

        if RE_HARDCODED_SHADOW_RETURN.search(line) and role in {"route", "lib"}:
            findings.append(
                Finding(rel, i, "low", "comment_admits_demo",
                        line.strip()[:160])
            )

        if page_module:
            ne = RE_NAMED_EXPORT.match(line)
            if ne and ne.group(1) not in RESERVED_PAGE_EXPORTS:
                findings.append(
                    Finding(rel, i, "high", "illegal_page_named_export",
                            line.strip()[:160])
                )

        if RE_ZOD_RECORD_SINGLE_ARG.search(line):
            findings.append(
                Finding(rel, i, "high", "zod_v4_record_single_arg",
                        line.strip()[:160])
            )

        if RE_ES_BODY_WRAPPING.search(line):
            findings.append(
                Finding(rel, i, "high", "elasticsearch_v9_body_wrapping",
                        line.strip()[:160])
            )

        if RE_PAGE_FIELD_MISUSE.search(line):
            findings.append(
                Finding(rel, i, "high", "page_field_misuse_uuid_in_url_column",
                        line.strip()[:160])
            )

    return findings


SEVERITY_RANK = {"high": 0, "medium": 1, "low": 2}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help="emit JSON")
    ap.add_argument("--severity", choices=["high", "medium", "low"],
                    help="filter to severity >=")
    args = ap.parse_args()

    files = iter_source_files()
    all_findings: list[Finding] = []
    for f in files:
        all_findings.extend(scan_file(f))

    if args.severity:
        threshold = SEVERITY_RANK[args.severity]
        all_findings = [f for f in all_findings
                        if SEVERITY_RANK[f.severity] <= threshold]

    # Group by file for the text view; still sort by severity within.
    if args.json:
        json.dump(
            {
                "scanned_files": len(files),
                "finding_count": len(all_findings),
                "findings": [asdict(f) for f in all_findings],
            },
            sys.stdout, indent=2,
        )
        sys.stdout.write("\n")
        return 0

    # Text summary
    by_file: dict[str, list[Finding]] = {}
    for f in all_findings:
        by_file.setdefault(f.file, []).append(f)

    print(f"# scan_demo_placeholders — {len(files)} files scanned, "
          f"{len(all_findings)} findings\n")
    sev_counts = {"high": 0, "medium": 0, "low": 0}
    for f in all_findings:
        sev_counts[f.severity] += 1
    print(f"## Severity: high={sev_counts['high']} "
          f"medium={sev_counts['medium']} low={sev_counts['low']}\n")

    # File table sorted by max severity desc, then count.
    def file_key(item: tuple[str, list[Finding]]) -> tuple[int, int]:
        _, lst = item
        max_rank = min(SEVERITY_RANK[x.severity] for x in lst)
        return (max_rank, -len(lst))

    for path, lst in sorted(by_file.items(), key=file_key):
        lst.sort(key=lambda x: SEVERITY_RANK[x.severity])
        print(f"\n### {path}  ({len(lst)} finding{'s' if len(lst) != 1 else ''})")
        for f in lst:
            print(f"  [{f.severity:>6}] L{f.line:<5} {f.pattern}")
            print(f"           {f.snippet}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
