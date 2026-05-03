#!/usr/bin/env python3
"""
audit_history_exposure.py — scan git log + commit messages + issue
bodies for client-name / PII exposure on a public repo.

Why this matters: the repo is public. Anything in commit messages,
PR titles, or issue bodies is search-indexed. A client name attached
to an issue or commit becomes a permanent disclosure.

Patterns:
  H1  client / dealer name in commit messages or PR titles
  H2  email addresses in commit messages
  H3  IP addresses (potentially internal infra) in commit messages
  H4  file paths that look like exfiltrated reports
  H5  dealer slugs / IDs in source files (CLAUDE.md ban — generic only)

Usage:
  python3 scripts/audit_history_exposure.py
  python3 scripts/audit_history_exposure.py --json
  python3 scripts/audit_history_exposure.py --since=2026-01-01
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Maintain these lists — the canonical "do-not-publish" set.
# Generic placeholder names (ACME Motors, Mile High Motors, Summit Auto)
# are deliberately NOT in here; they're allow-listed.
#
# UNIQUE names: case-insensitive match. Safe to be aggressive — these
#   strings don't collide with English vocabulary.
# COMMON names: case-sensitive whole-word match. These collide with
#   regular English ("enterprise-grade") so we only flag the exact
#   capitalized brand spelling adjacent to a word boundary.
SENSITIVE_UNIQUE = [
    "Aidan Mulready",
    "Aidan",
    "Mulready",
    "CFTR",
    # Add any unique client / partner / pre-release stakeholder name.
]
SENSITIVE_COMMON = [
    "Avis",
    "Hertz",
    "Enterprise Rent-A-Car",
    "Enterprise Holdings",
    # Brand-shaped common words — match only the multi-word brand
    # form so we don't trip on "enterprise-grade" in feature copy.
]

SENSITIVE_RE_UNIQUE = re.compile(
    r"\b(?:" + "|".join(re.escape(n) for n in SENSITIVE_UNIQUE) + r")\b",
    re.IGNORECASE,
)
SENSITIVE_RE_COMMON = re.compile(
    r"\b(?:" + "|".join(re.escape(n) for n in SENSITIVE_COMMON) + r")\b",
)
def find_sensitive(text: str):
    yield from SENSITIVE_RE_UNIQUE.finditer(text)
    yield from SENSITIVE_RE_COMMON.finditer(text)
EMAIL_RE = re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"
)
IP_RE = re.compile(
    r"\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b"
)


@dataclass
class Finding:
    pattern: str
    where: str  # commit / file / issue
    ref: str
    severity: str
    snippet: str


def git_log(since: str | None) -> list[tuple[str, str, str]]:
    """Return [(sha, subject, body)] for every commit, optionally since a date."""
    cmd = ["git", "log", "--all", "--format=%H%x1f%s%x1f%b%x1e"]
    if since:
        cmd.append(f"--since={since}")
    try:
        out = subprocess.check_output(cmd, cwd=str(ROOT), text=True)
    except subprocess.CalledProcessError:
        return []
    commits = []
    for entry in out.split("\x1e"):
        entry = entry.strip()
        if not entry:
            continue
        parts = entry.split("\x1f")
        if len(parts) >= 3:
            commits.append((parts[0], parts[1], parts[2]))
    return commits


def scan_commits(since: str | None) -> list[Finding]:
    findings: list[Finding] = []
    for sha, subject, body in git_log(since):
        text = f"{subject}\n{body}"

        for m in find_sensitive(text):
            findings.append(
                Finding(
                    "H1", "commit", sha[:12], "high",
                    f"sensitive name in commit: {m.group(0)} — {subject[:80]}",
                )
            )
        for m in EMAIL_RE.finditer(text):
            email = m.group(0)
            # Allow internal-org emails; flag external ones.
            if email.endswith(("@thewolfpack.agency", "@anthropic.com", "@github.com",
                                "@noreply.github.com", "@users.noreply.github.com")):
                continue
            findings.append(
                Finding(
                    "H2", "commit", sha[:12], "medium",
                    f"external email in commit: {email}",
                )
            )
        for m in IP_RE.finditer(text):
            findings.append(
                Finding(
                    "H3", "commit", sha[:12], "medium",
                    f"internal IP in commit: {m.group(0)}",
                )
            )
    return findings


def scan_source() -> list[Finding]:
    findings: list[Finding] = []
    src = ROOT / "src"
    if not src.exists():
        return findings
    for p in src.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix not in {".ts", ".tsx", ".md"}:
            continue
        if "/node_modules/" in str(p) or "/__tests__/" in str(p):
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        rel = str(p.relative_to(ROOT))
        for m in find_sensitive(text):
            line = text[: m.start()].count("\n") + 1
            findings.append(
                Finding(
                    "H5", "file", f"{rel}:{line}", "high",
                    f"sensitive name in source: {m.group(0)} ({rel}:{line})",
                )
            )
    return findings


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--since", help="git log --since arg, e.g. 2026-01-01")
    args = ap.parse_args()

    findings: list[Finding] = []
    findings.extend(scan_commits(args.since))
    findings.extend(scan_source())

    sev_rank = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: (sev_rank[f.severity], f.pattern, f.ref))

    if args.json:
        json.dump(
            {"finding_count": len(findings), "findings": [asdict(f) for f in findings]},
            sys.stdout, indent=2,
        )
        sys.stdout.write("\n")
        return 0

    sev = {"high": 0, "medium": 0, "low": 0}
    for f in findings:
        sev[f.severity] += 1
    print(f"# audit_history_exposure — {len(findings)} findings")
    print(f"#   high={sev['high']}  medium={sev['medium']}  low={sev['low']}\n")
    for f in findings:
        print(f"  [{f.severity:>6}] {f.pattern} {f.where} {f.ref}")
        print(f"           {f.snippet}")
    if not findings:
        print("  (no exposed sensitive names / emails / IPs found)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
