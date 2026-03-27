#!/usr/bin/env python3
"""
shadow_runner.py — Orchestrate a full shadow-test cycle against a Neon DB branch.

Steps (full run):
  1. Validate required env vars
  2. Create Neon branch: shadow-test-{timestamp}
  3. Poll until branch is ready
  4. Run migrations against shadow DB
  5. Seed test data (2 dealers, 10 vehicles, 3 leads)
  6. Start Next.js on port 3100 with shadow DATABASE_URL
  7. Poll until server is ready
  8. Run Playwright shadow tests
  9. Kill Next.js server
  10. Delete Neon branch (unless --keep-branch)
  11. Exit with Playwright's exit code

Flags:
  --skip-branch   Use SHADOW_DATABASE_URL directly (skips steps 2-4)
  --keep-branch   Skip branch deletion after run (step 10)
  --test-filter   Playwright --grep pattern to run a subset of tests

Dependencies:
  pip install requests
"""

from __future__ import annotations

import argparse
import os
import shlex
import signal
import subprocess
import sys
import time
from typing import Optional

import requests

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

NEON_API_BASE = "https://console.neon.tech/api/v2"
SHADOW_PORT = 3100
SHADOW_URL = f"http://localhost:{SHADOW_PORT}"
SERVER_READY_PROBE = f"{SHADOW_URL}/inventory"
BRANCH_POLL_INTERVAL = 3   # seconds between branch-ready polls
BRANCH_POLL_TIMEOUT = 120  # seconds before giving up on branch creation
SERVER_POLL_INTERVAL = 2   # seconds between server-ready polls
SERVER_POLL_TIMEOUT = 120  # seconds before giving up on server startup

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def step(msg: str) -> None:
    print(f"\n[shadow] >>> {msg}", flush=True)


def info(msg: str) -> None:
    print(f"[shadow]     {msg}", flush=True)


def warn(msg: str) -> None:
    print(f"[shadow] WARN {msg}", flush=True)


def die(msg: str, code: int = 1) -> None:
    print(f"[shadow] ERROR {msg}", file=sys.stderr, flush=True)
    sys.exit(code)


def neon_headers(api_key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# Step 1 — Validate env vars
# ---------------------------------------------------------------------------


def validate_env(skip_branch: bool) -> dict[str, str]:
    step("Validating environment variables")
    env: dict[str, str] = {}

    if skip_branch:
        shadow_db = os.environ.get("SHADOW_DATABASE_URL")
        if not shadow_db:
            die("--skip-branch requires SHADOW_DATABASE_URL to be set")
        env["SHADOW_DATABASE_URL"] = shadow_db
        info("--skip-branch: will use SHADOW_DATABASE_URL directly")
    else:
        for var in ("NEON_API_KEY", "NEON_PROJECT_ID", "DATABASE_URL"):
            val = os.environ.get(var)
            if not val:
                die(f"Required env var '{var}' is not set")
            env[var] = val
        info("All required env vars present")

    return env


# ---------------------------------------------------------------------------
# Step 2 — Create Neon branch
# ---------------------------------------------------------------------------


def create_neon_branch(api_key: str, project_id: str) -> tuple[str, str]:
    """
    Returns (branch_id, connection_string).
    """
    step("Creating Neon branch")
    timestamp = int(time.time())
    branch_name = f"shadow-test-{timestamp}"

    url = f"{NEON_API_BASE}/projects/{project_id}/branches"
    payload = {
        "branch": {"name": branch_name},
        "endpoints": [{"type": "read_write"}],
    }

    resp = requests.post(url, json=payload, headers=neon_headers(api_key), timeout=30)
    if resp.status_code not in (200, 201):
        die(f"Neon branch creation failed: HTTP {resp.status_code}\n{resp.text}")

    data = resp.json()
    branch_id: str = data["branch"]["id"]
    info(f"Branch created: {branch_name} ({branch_id})")
    return branch_id, branch_name


# ---------------------------------------------------------------------------
# Step 3 — Poll until branch ready
# ---------------------------------------------------------------------------


def wait_for_branch(api_key: str, project_id: str, branch_id: str) -> str:
    """
    Polls branch status until 'ready'. Returns the connection string.
    """
    step(f"Waiting for branch {branch_id} to be ready")
    url = f"{NEON_API_BASE}/projects/{project_id}/branches/{branch_id}"
    deadline = time.time() + BRANCH_POLL_TIMEOUT

    while time.time() < deadline:
        resp = requests.get(url, headers=neon_headers(api_key), timeout=15)
        if resp.status_code != 200:
            warn(f"Branch status poll returned HTTP {resp.status_code}, retrying...")
            time.sleep(BRANCH_POLL_INTERVAL)
            continue

        data = resp.json()
        state = data["branch"].get("current_state", "unknown")
        info(f"Branch state: {state}")

        if state == "ready":
            # Extract connection URI from endpoints
            endpoints_url = f"{NEON_API_BASE}/projects/{project_id}/endpoints"
            ep_resp = requests.get(endpoints_url, headers=neon_headers(api_key), timeout=15)
            if ep_resp.status_code == 200:
                for ep in ep_resp.json().get("endpoints", []):
                    if ep.get("branch_id") == branch_id and ep.get("type") == "read_write":
                        host = ep["host"]
                        # Construct connection string from project connection string template
                        conn_url = (
                            f"postgresql://neondb_owner@{host}/neondb"
                            f"?sslmode=require"
                        )
                        info(f"Shadow DB endpoint: {host}")
                        return conn_url

            # Fallback: try connection_uris endpoint
            uris_url = f"{NEON_API_BASE}/projects/{project_id}/connection_uri?branch_id={branch_id}&role_name=neondb_owner&database_name=neondb"
            uri_resp = requests.get(uris_url, headers=neon_headers(api_key), timeout=15)
            if uri_resp.status_code == 200:
                conn = uri_resp.json().get("uri", "")
                if conn:
                    info("Extracted connection URI from connection_uri endpoint")
                    return conn

            die("Branch is ready but could not extract connection string")

        time.sleep(BRANCH_POLL_INTERVAL)

    die(f"Timed out waiting for Neon branch to become ready ({BRANCH_POLL_TIMEOUT}s)")
    return ""  # unreachable


# ---------------------------------------------------------------------------
# Step 4 — Run migrations
# ---------------------------------------------------------------------------


def run_migrations(shadow_db_url: str, migrations_dir: str) -> None:
    step("Running migrations against shadow DB")

    import glob as globlib
    import re

    pattern = os.path.join(migrations_dir, "*.sql")
    files = sorted(globlib.glob(pattern))

    if not files:
        warn(f"No migration files found in {migrations_dir} — skipping")
        return

    for filepath in files:
        filename = os.path.basename(filepath)
        info(f"Applying migration: {filename}")
        result = subprocess.run(
            ["psql", shadow_db_url, "-f", filepath],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            # Tolerate "already exists" errors (idempotent re-run)
            stderr_lower = result.stderr.lower()
            if "already exists" in stderr_lower or "duplicate" in stderr_lower:
                warn(f"{filename}: some objects already exist — continuing")
            else:
                die(
                    f"Migration {filename} failed:\n{result.stderr}\n{result.stdout}"
                )
        else:
            info(f"  OK: {filename}")


# ---------------------------------------------------------------------------
# Step 5 — Seed test data
# ---------------------------------------------------------------------------

SEED_SQL = """
-- Shadow test seed data
-- All identifiers are prefixed with 'shadow-test-' for easy cleanup.

-- Dealers
INSERT INTO dealers (
    id, name, slug, subdomain, phone, email, website_url,
    address, sales_hours, service_hours, branding,
    has_service_center, has_financing, has_trade_in, is_active
) VALUES
(
    'a1000000-0000-0000-0000-000000000001',
    'Shadow Test Dealer One',
    'shadow-test-dealer-1',
    'shadow-test-1',
    '+15550000001',
    'dealer1@shadow-test.invalid',
    'https://shadow-test-1.example.invalid',
    '{"street": "1 Shadow Way", "city": "Testville", "state": "CO", "zip": "80000"}',
    '[]',
    '[]',
    '{"primaryColor": "#FF0000", "logoUrl": null}',
    false, true, true, true
),
(
    'a2000000-0000-0000-0000-000000000002',
    'Shadow Test Dealer Two',
    'shadow-test-dealer-2',
    'shadow-test-2',
    '+15550000002',
    'dealer2@shadow-test.invalid',
    'https://shadow-test-2.example.invalid',
    '{"street": "2 Shadow Lane", "city": "Testburg", "state": "CO", "zip": "80001"}',
    '[]',
    '[]',
    '{"primaryColor": "#0000FF", "logoUrl": null}',
    false, true, true, true
)
ON CONFLICT (slug) DO NOTHING;

-- Vehicles for Dealer 1 (5 vehicles)
INSERT INTO vehicles (
    dealer_id, vin, stock_number, year, make, model, trim,
    body_style, exterior_color, interior_color, engine,
    transmission, drivetrain, fuel_type, price, condition,
    mileage, status, description, features, photo_count
) VALUES
(
    'a1000000-0000-0000-0000-000000000001',
    'SHADOW1VIN0000001A',
    'STK-S1-001',
    2023, 'Toyota', 'Camry', 'SE',
    'Sedan', 'Midnight Black', 'Black', '2.5L 4-Cylinder',
    'Automatic', 'FWD', 'gasoline', 24995, 'used',
    28000, 'available', 'Shadow test vehicle 1 - Dealer 1', '["Backup Camera","Bluetooth"]', 0
),
(
    'a1000000-0000-0000-0000-000000000001',
    'SHADOW1VIN0000002B',
    'STK-S1-002',
    2024, 'Honda', 'Civic', 'Sport',
    'Sedan', 'Pearl White', 'Gray', '1.5L Turbo',
    'CVT', 'FWD', 'gasoline', 22500, 'new',
    0, 'available', 'Shadow test vehicle 2 - Dealer 1', '["Apple CarPlay","Lane Assist"]', 0
),
(
    'a1000000-0000-0000-0000-000000000001',
    'SHADOW1VIN0000003C',
    'STK-S1-003',
    2022, 'Ford', 'F-150', 'XLT',
    'Truck', 'Atlas Blue', 'Tan', '3.5L EcoBoost',
    'Automatic', '4WD', 'gasoline', 38500, 'used',
    42000, 'available', 'Shadow test vehicle 3 - Dealer 1', '["Towing Package","Heated Seats"]', 0
),
(
    'a1000000-0000-0000-0000-000000000001',
    'SHADOW1VIN0000004D',
    'STK-S1-004',
    2024, 'Tesla', 'Model 3', 'Long Range',
    'Sedan', 'Red', 'White', 'Dual Motor Electric',
    'Automatic', 'AWD', 'electric', 42990, 'new',
    0, 'available', 'Shadow test vehicle 4 - Dealer 1', '["Autopilot","Over-the-Air Updates"]', 0
),
(
    'a1000000-0000-0000-0000-000000000001',
    'SHADOW1VIN0000005E',
    'STK-S1-005',
    2023, 'Subaru', 'Outback', 'Premium',
    'SUV', 'Wilderness Green', 'Black', '2.5L Boxer',
    'CVT', 'AWD', 'gasoline', 29800, 'used',
    19500, 'available', 'Shadow test vehicle 5 - Dealer 1', '["EyeSight","Sunroof"]', 0
),

-- Vehicles for Dealer 2 (5 vehicles)
(
    'a2000000-0000-0000-0000-000000000002',
    'SHADOW2VIN0000001F',
    'STK-S2-001',
    2023, 'BMW', '3 Series', '330i',
    'Sedan', 'Alpine White', 'Black', '2.0L TwinPower Turbo',
    'Automatic', 'RWD', 'gasoline', 44500, 'used',
    18000, 'available', 'Shadow test vehicle 1 - Dealer 2', '["iDrive","Parking Sensors"]', 0
),
(
    'a2000000-0000-0000-0000-000000000002',
    'SHADOW2VIN0000002G',
    'STK-S2-002',
    2024, 'Audi', 'Q5', 'Premium Plus',
    'SUV', 'Glacier White', 'Beige', '2.0L TFSI',
    'Automatic', 'AWD', 'gasoline', 52000, 'new',
    0, 'available', 'Shadow test vehicle 2 - Dealer 2', '["Virtual Cockpit","Quattro"]', 0
),
(
    'a2000000-0000-0000-0000-000000000002',
    'SHADOW2VIN0000003H',
    'STK-S2-003',
    2022, 'Mercedes-Benz', 'C-Class', 'C300',
    'Sedan', 'Obsidian Black', 'Ivory', '2.0L Turbo',
    'Automatic', 'RWD', 'gasoline', 38900, 'used',
    31000, 'available', 'Shadow test vehicle 3 - Dealer 2', '["MBUX","Burmester Sound"]', 0
),
(
    'a2000000-0000-0000-0000-000000000002',
    'SHADOW2VIN0000004I',
    'STK-S2-004',
    2024, 'Porsche', 'Macan', 'Base',
    'SUV', 'Crayon', 'Black', '2.0L Turbo',
    'Automatic', 'AWD', 'gasoline', 67800, 'new',
    0, 'available', 'Shadow test vehicle 4 - Dealer 2', '["PASM","Sport Chrono"]', 0
),
(
    'a2000000-0000-0000-0000-000000000002',
    'SHADOW2VIN0000005J',
    'STK-S2-005',
    2023, 'Lexus', 'RX', '350',
    'SUV', 'Nori Green', 'Glazed Caramel', '3.5L V6',
    'Automatic', 'AWD', 'gasoline', 49200, 'used',
    22000, 'available', 'Shadow test vehicle 5 - Dealer 2', '["Mark Levinson Audio","Panoramic Roof"]', 0
)
ON CONFLICT (dealer_id, vin) DO NOTHING;

-- Leads for Dealer 1 (2 leads)
INSERT INTO leads (
    dealer_id, first_name, last_name, email, phone,
    vehicle_interest, source, status, notes, created_at, updated_at
) VALUES
(
    'a1000000-0000-0000-0000-000000000001',
    'Shadow', 'LeadOne',
    'shadow-lead-1@shadow-test.invalid',
    '+15550001001',
    'shadow-test vehicle interest 1',
    'website_form', 'new', '[Shadow test lead 1]',
    NOW(), NOW()
),
(
    'a1000000-0000-0000-0000-000000000001',
    'Shadow', 'LeadTwo',
    'shadow-lead-2@shadow-test.invalid',
    '+15550001002',
    'shadow-test vehicle interest 2',
    'vdp_inquiry', 'contacted', '[Shadow test lead 2]',
    NOW(), NOW()
)
ON CONFLICT DO NOTHING;

-- Lead for Dealer 2 (1 lead — used to verify RLS isolation)
INSERT INTO leads (
    dealer_id, first_name, last_name, email, phone,
    vehicle_interest, source, status, notes, created_at, updated_at
) VALUES
(
    'a2000000-0000-0000-0000-000000000002',
    'Shadow', 'LeadThree',
    'shadow-lead-3@shadow-test.invalid',
    '+15550002001',
    'shadow-test dealer 2 vehicle interest',
    'website_form', 'new', '[Shadow test lead 3 - dealer 2]',
    NOW(), NOW()
)
ON CONFLICT DO NOTHING;
"""


def seed_test_data(shadow_db_url: str) -> None:
    step("Seeding shadow test data")

    result = subprocess.run(
        ["psql", shadow_db_url, "-c", SEED_SQL],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        stderr_lower = result.stderr.lower()
        if "already exists" in stderr_lower or "duplicate" in stderr_lower:
            info("Some seed rows already exist — OK (idempotent seed)")
        else:
            die(f"Seed failed:\n{result.stderr}\n{result.stdout}")
    else:
        info("Seed complete: 2 dealers, 10 vehicles, 3 leads")


# ---------------------------------------------------------------------------
# Step 6/7 — Start Next.js and wait for readiness
# ---------------------------------------------------------------------------


def start_nextjs(shadow_db_url: str) -> subprocess.Popen:  # type: ignore[type-arg]
    step(f"Starting Next.js on port {SHADOW_PORT}")

    env = os.environ.copy()
    env["PORT"] = str(SHADOW_PORT)
    env["DATABASE_URL"] = shadow_db_url
    # Disable telemetry and other noise in shadow runs
    env["NEXT_TELEMETRY_DISABLED"] = "1"
    env["NODE_ENV"] = "production"

    proc = subprocess.Popen(
        ["npm", "run", "start"],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        preexec_fn=os.setsid,  # process group for clean kill
    )

    info(f"Next.js started (PID {proc.pid}), waiting for readiness...")
    return proc


def wait_for_server(proc: subprocess.Popen) -> None:  # type: ignore[type-arg]
    step(f"Polling {SERVER_READY_PROBE} for server readiness")
    deadline = time.time() + SERVER_POLL_TIMEOUT

    while time.time() < deadline:
        # Check process hasn't died
        if proc.poll() is not None:
            out, _ = proc.communicate()
            die(f"Next.js exited prematurely (code {proc.returncode}):\n{out}")

        try:
            resp = requests.get(SERVER_READY_PROBE, timeout=5)
            if resp.status_code < 500:
                info(f"Server ready (HTTP {resp.status_code})")
                return
        except requests.exceptions.ConnectionError:
            pass

        time.sleep(SERVER_POLL_INTERVAL)

    die(f"Server did not become ready within {SERVER_POLL_TIMEOUT}s")


def stop_nextjs(proc: subprocess.Popen) -> None:  # type: ignore[type-arg]
    step("Stopping Next.js server")
    try:
        # Kill the whole process group so any spawned workers also die
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        proc.wait(timeout=10)
        info(f"Next.js stopped (exit code {proc.returncode})")
    except ProcessLookupError:
        info("Next.js process already gone")
    except subprocess.TimeoutExpired:
        warn("SIGTERM timed out — sending SIGKILL")
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)


# ---------------------------------------------------------------------------
# Step 8 — Run Playwright
# ---------------------------------------------------------------------------


def run_playwright(test_filter: Optional[str]) -> int:
    step("Running Playwright shadow tests")
    cmd = [
        "npx", "playwright", "test",
        "--config=playwright.shadow.config.ts",
    ]
    if test_filter:
        cmd += ["--grep", test_filter]
        info(f"Test filter: {test_filter}")

    env = os.environ.copy()
    env["SHADOW_URL"] = SHADOW_URL

    result = subprocess.run(cmd, env=env)
    return result.returncode


# ---------------------------------------------------------------------------
# Step 9 — Delete Neon branch
# ---------------------------------------------------------------------------


def delete_neon_branch(api_key: str, project_id: str, branch_id: str) -> None:
    step(f"Deleting Neon branch {branch_id}")
    url = f"{NEON_API_BASE}/projects/{project_id}/branches/{branch_id}"
    resp = requests.delete(url, headers=neon_headers(api_key), timeout=30)
    if resp.status_code in (200, 204):
        info("Branch deleted")
    else:
        warn(f"Branch deletion returned HTTP {resp.status_code} — may need manual cleanup")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Shadow test runner for Wolfpack Auto")
    parser.add_argument(
        "--skip-branch",
        action="store_true",
        help="Use SHADOW_DATABASE_URL directly; skip Neon branch creation and migration",
    )
    parser.add_argument(
        "--keep-branch",
        action="store_true",
        help="Do not delete the Neon branch after the run (useful for debugging)",
    )
    parser.add_argument(
        "--test-filter",
        metavar="PATTERN",
        help="Playwright --grep pattern to run a subset of tests",
    )
    args = parser.parse_args()

    # Resolve cwd to wolfpack-auto/ so npm commands work
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    os.chdir(project_dir)
    info(f"Working directory: {project_dir}")

    # --- Step 1: Validate env ---
    env = validate_env(args.skip_branch)

    branch_id: Optional[str] = None
    shadow_db_url: str
    proc: Optional[subprocess.Popen] = None  # type: ignore[type-arg]
    playwright_exit_code = 1

    try:
        if args.skip_branch:
            # Fast path: use provided DB URL directly
            shadow_db_url = env["SHADOW_DATABASE_URL"]
            info(f"Using existing SHADOW_DATABASE_URL (--skip-branch)")
        else:
            # --- Step 2: Create Neon branch ---
            api_key = env["NEON_API_KEY"]
            project_id = env["NEON_PROJECT_ID"]
            branch_id, _branch_name = create_neon_branch(api_key, project_id)

            # --- Step 3: Wait for branch ready ---
            shadow_db_url = wait_for_branch(api_key, project_id, branch_id)

            # --- Step 4: Run migrations ---
            migrations_dir = os.path.join(project_dir, "src", "db", "migrations")
            run_migrations(shadow_db_url, migrations_dir)

        # --- Step 5: Seed test data ---
        seed_test_data(shadow_db_url)

        # --- Step 6: Start Next.js ---
        proc = start_nextjs(shadow_db_url)

        # --- Step 7: Wait for server ready ---
        wait_for_server(proc)

        # --- Step 8: Run Playwright ---
        playwright_exit_code = run_playwright(args.test_filter)

    finally:
        # --- Step 9: Stop Next.js ---
        if proc is not None:
            stop_nextjs(proc)

        # --- Step 10: Delete branch (unless --keep-branch or --skip-branch) ---
        if branch_id and not args.keep_branch and not args.skip_branch:
            api_key = env.get("NEON_API_KEY", "")
            project_id = env.get("NEON_PROJECT_ID", "")
            if api_key and project_id:
                delete_neon_branch(api_key, project_id, branch_id)
        elif branch_id and args.keep_branch:
            warn(f"--keep-branch: branch {branch_id} was NOT deleted")

        step(f"Shadow run complete — exit code: {playwright_exit_code}")

    sys.exit(playwright_exit_code)


if __name__ == "__main__":
    main()
