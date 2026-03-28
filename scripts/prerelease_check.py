#!/usr/bin/env python3
"""
prerelease_check.py — Wolfpack Auto production readiness gate.

Run before every client deployment:
    python scripts/prerelease_check.py

Exit code 0 = no FAILs (safe to deploy)
Exit code 1 = at least one FAIL (do NOT deploy)
"""

import os
import re
import subprocess
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Colour + result tracking
# ---------------------------------------------------------------------------

_RESULTS: list[tuple[str, str, str]] = []  # (status, check_name, detail)

GREEN  = "\033[32m"
YELLOW = "\033[33m"
RED    = "\033[31m"
RESET  = "\033[0m"

def _record(status: str, name: str, detail: str = "") -> None:
    _RESULTS.append((status, name, detail))
    colour = {"PASS": GREEN, "WARN": YELLOW, "FAIL": RED}.get(status, RESET)
    label = f"{colour}{status}{RESET}"
    suffix = f"  — {detail}" if detail else ""
    print(f"  [{label}] {name}{suffix}")


def PASS(name: str, detail: str = "") -> None:  # noqa: N802
    _record("PASS", name, detail)


def WARN(name: str, detail: str = "") -> None:  # noqa: N802
    _record("WARN", name, detail)


def FAIL(name: str, detail: str = "") -> None:  # noqa: N802
    _record("FAIL", name, detail)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent  # wolfpack-auto/


def _env(key: str) -> str:
    """Return env var value or empty string."""
    return os.environ.get(key, "")


def _is_hex(value: str, length: int) -> bool:
    """Return True if value is exactly `length` lowercase hex characters."""
    return bool(re.fullmatch(rf"[0-9a-fA-F]{{{length}}}", value))


# ---------------------------------------------------------------------------
# Check 1 — Environment variables
# ---------------------------------------------------------------------------

def check_env_vars() -> None:
    print("\n[1/5] Environment Variables")

    # DATABASE_URL
    db_url = _env("DATABASE_URL")
    if not db_url:
        FAIL("DATABASE_URL", "not set")
    elif "localhost" in db_url:
        FAIL("DATABASE_URL", "contains 'localhost' — must point to production DB")
    else:
        PASS("DATABASE_URL", "set and does not contain 'localhost'")

    # NEXTAUTH_SECRET
    secret = _env("NEXTAUTH_SECRET")
    if not secret:
        FAIL("NEXTAUTH_SECRET", "not set")
    elif secret == "wolfpack-dev-secret-change-in-production":
        FAIL("NEXTAUTH_SECRET", "still set to dev default — change immediately")
    else:
        PASS("NEXTAUTH_SECRET", "set and not the dev default")

    # PII_ENCRYPTION_KEY
    pii_key = _env("PII_ENCRYPTION_KEY")
    if not pii_key:
        FAIL("PII_ENCRYPTION_KEY", "not set")
    elif not _is_hex(pii_key, 64):
        FAIL("PII_ENCRYPTION_KEY", f"must be 64 hex chars (32 bytes); got {len(pii_key)} chars")
    else:
        PASS("PII_ENCRYPTION_KEY", "set and is 64 hex chars")

    # RESEND_API_KEY (warn only)
    if not _env("RESEND_API_KEY"):
        WARN("RESEND_API_KEY", "not set — email notifications will be disabled")
    else:
        PASS("RESEND_API_KEY", "set")

    # DEALER_ID
    if not _env("DEALER_ID"):
        FAIL("DEALER_ID", "not set")
    else:
        PASS("DEALER_ID", "set")

    # NEXTAUTH_URL
    nextauth_url = _env("NEXTAUTH_URL")
    if not nextauth_url:
        FAIL("NEXTAUTH_URL", "not set")
    elif "localhost" in nextauth_url:
        FAIL("NEXTAUTH_URL", f"contains 'localhost': {nextauth_url!r}")
    else:
        PASS("NEXTAUTH_URL", f"set to {nextauth_url!r}")


# ---------------------------------------------------------------------------
# Check 2 — Auth gate
# ---------------------------------------------------------------------------

def check_auth_gate() -> None:
    print("\n[2/5] Auth Gate (middleware.ts)")

    middleware_path = REPO_ROOT / "src" / "middleware.ts"
    if not middleware_path.exists():
        FAIL("middleware.ts", f"file not found at {middleware_path}")
        return

    source = middleware_path.read_text(encoding="utf-8")

    # The disabled guard pattern is:  if (false && isAdminRoute(
    # Detect any `false &&` that appears within 10 chars of `isAdminRoute`
    if re.search(r"false\s*&&\s*isAdminRoute", source):
        FAIL(
            "Auth gate disabled",
            "found `false && isAdminRoute(` in middleware.ts — "
            "remove the `false &&` before deploying to production",
        )
    else:
        PASS("Auth gate", "no `false && isAdminRoute` pattern found")


# ---------------------------------------------------------------------------
# Check 3 — Database connectivity + schema
# ---------------------------------------------------------------------------

REQUIRED_TABLES = ["dealers", "vehicles", "leads", "dealer_users"]


def _check_db_psycopg2(db_url: str) -> None:
    import psycopg2  # type: ignore

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public';"
    )
    existing = {row[0] for row in cur.fetchall()}
    cur.close()
    conn.close()

    for table in REQUIRED_TABLES:
        if table in existing:
            PASS(f"Table '{table}'", "exists")
        else:
            FAIL(f"Table '{table}'", "NOT FOUND — migrations may not have run")


def _check_db_psql(db_url: str) -> None:
    result = subprocess.run(
        ["psql", db_url, "-c",
         "SELECT tablename FROM pg_tables WHERE schemaname='public';"],
        capture_output=True,
        text=True,
        timeout=10,
    )
    output = result.stdout + result.stderr
    for table in REQUIRED_TABLES:
        if table in output:
            PASS(f"Table '{table}'", "exists (via psql)")
        else:
            FAIL(f"Table '{table}'", "NOT FOUND (via psql) — migrations may not have run")


def check_database() -> None:
    print("\n[3/5] Database Connectivity + Schema")

    db_url = _env("DATABASE_URL")
    if not db_url:
        WARN("Database check", "skipped — DATABASE_URL not set")
        return

    # Try psycopg2 first, fall back to psql CLI
    try:
        _check_db_psycopg2(db_url)
        return
    except ImportError:
        pass
    except Exception as exc:
        FAIL("Database connection", str(exc))
        return

    # psycopg2 not available — try psql binary
    try:
        _check_db_psql(db_url)
    except FileNotFoundError:
        WARN(
            "Database check",
            "skipped — neither psycopg2 nor psql is available in this environment",
        )
    except subprocess.TimeoutExpired:
        FAIL("Database connection", "timed out after 10 seconds")
    except Exception as exc:
        FAIL("Database check", str(exc))


# ---------------------------------------------------------------------------
# Check 4 — Secret strength
# ---------------------------------------------------------------------------

def check_secret_strength() -> None:
    print("\n[4/5] Secret Strength")

    secret = _env("NEXTAUTH_SECRET")
    if secret:
        if len(secret) >= 32:
            PASS("NEXTAUTH_SECRET length", f"{len(secret)} chars >= 32")
        else:
            FAIL("NEXTAUTH_SECRET length", f"only {len(secret)} chars — must be >= 32")

    pii_key = _env("PII_ENCRYPTION_KEY")
    if pii_key:
        if _is_hex(pii_key, 64):
            PASS("PII_ENCRYPTION_KEY format", "exactly 64 hex chars (32 bytes)")
        else:
            FAIL(
                "PII_ENCRYPTION_KEY format",
                f"expected 64 hex chars, got {len(pii_key)} chars",
            )


# ---------------------------------------------------------------------------
# Check 5 — File hygiene
# ---------------------------------------------------------------------------

# Patterns that suggest real secrets embedded in a .env file
_SECRET_PATTERNS = [
    re.compile(r"DATABASE_URL\s*=\s*postgres://[^$\n]{10,}"),
    re.compile(r"NEXTAUTH_SECRET\s*=\s*.{10,}"),
    re.compile(r"PII_ENCRYPTION_KEY\s*=\s*[0-9a-fA-F]{20,}"),
    re.compile(r"RESEND_API_KEY\s*=\s*re_[A-Za-z0-9]{10,}"),
]


def _contains_real_secret(path: Path) -> bool:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
        return any(pat.search(text) for pat in _SECRET_PATTERNS)
    except OSError:
        return False


def check_file_hygiene() -> None:
    print("\n[5/5] File Hygiene")

    env_local = REPO_ROOT / ".env.local"
    if env_local.exists():
        FAIL(
            ".env.local",
            ".env.local exists — it will override Vercel env vars in production. "
            "Delete it or add to .gitignore.",
        )
    else:
        PASS(".env.local", "not present (correct for production)")

    env_file = REPO_ROOT / ".env"
    if env_file.exists():
        if _contains_real_secret(env_file):
            FAIL(
                ".env secrets",
                ".env appears to contain real secret values — "
                "use Vercel env vars instead",
            )
        else:
            PASS(".env", "exists but does not appear to contain real secrets")
    else:
        PASS(".env", "not present")


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

def print_summary() -> int:
    counts = {"PASS": 0, "WARN": 0, "FAIL": 0}
    for status, _, _ in _RESULTS:
        counts[status] = counts.get(status, 0) + 1

    passes = counts["PASS"]
    warns  = counts["WARN"]
    fails  = counts["FAIL"]

    print("\n" + "=" * 40)
    print("=== Pre-release Check Summary ===")
    print("=" * 40)
    print(f"  {GREEN}PASS{RESET}: {passes}  {YELLOW}WARN{RESET}: {warns}  {RED}FAIL{RESET}: {fails}")

    if fails == 0:
        print(f"  Status: {GREEN}READY FOR PRODUCTION ✓{RESET}")
        return 0
    else:
        print(f"  Status: {RED}NOT READY — fix {fails} failing check(s) above ✗{RESET}")
        return 1


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> int:
    print("Wolfpack Auto — Pre-release Production Readiness Check")
    print(f"Checking against repo root: {REPO_ROOT}")

    check_env_vars()
    check_auth_gate()
    check_database()
    check_secret_strength()
    check_file_hygiene()

    return print_summary()


if __name__ == "__main__":
    sys.exit(main())
