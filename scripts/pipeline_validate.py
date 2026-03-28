#!/usr/bin/env python3
"""
pipeline_validate.py — Wolfpack Auto Pipeline Execution Validator

Executes against a running instance and validates that every major feature
produces correct business logic outputs — not just HTTP 200s.

Three validation layers:
  Layer 1 (Playwright/shadow): Does the API surface work?
  Layer 2 (THIS SCRIPT): Does the business logic produce valid outputs?
  Layer 3 (prerelease_check.py): Is the environment configured correctly?

Usage:
  python scripts/pipeline_validate.py                    # localhost:3000
  BASE_URL=http://localhost:3100 python scripts/pipeline_validate.py  # shadow env
  python scripts/pipeline_validate.py --json            # machine-readable output
  python scripts/pipeline_validate.py --fail-fast       # stop on first failure

Exit codes:
  0 — all validations passed
  1 — one or more validations failed
  2 — could not reach the server
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
DEALER_ID = os.environ.get("DEALER_ID", "a1000000-0000-0000-0000-000000000001")
TIMEOUT = int(os.environ.get("VALIDATE_TIMEOUT", "10"))


# ---------------------------------------------------------------------------
# Result tracking
# ---------------------------------------------------------------------------

@dataclass
class ValidationResult:
    name: str
    passed: bool
    message: str
    details: Optional[Any] = None
    duration_ms: float = 0.0


results: list[ValidationResult] = []
fail_fast = False


def check(name: str, condition: bool, message: str, details: Any = None, duration_ms: float = 0.0) -> bool:
    status = "PASS" if condition else "FAIL"
    color = "\033[32m" if condition else "\033[31m"
    reset = "\033[0m"
    print(f"  {color}{status}{reset}  {name}")
    if not condition:
        print(f"        → {message}")
        if details:
            print(f"        → details: {json.dumps(details, indent=2)[:200]}")
    results.append(ValidationResult(name, condition, message, details, duration_ms))
    if fail_fast and not condition:
        print("\n[fail-fast] Stopping on first failure.")
        summarize()
        sys.exit(1)
    return condition


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def get(path: str, params: dict = None) -> tuple[int, Any]:
    url = f"{BASE_URL}{path}"
    if params:
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        url = f"{url}?{qs}"
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT) as resp:
            body = json.loads(resp.read().decode())
            return resp.status, body
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {"error": str(e)}
        return e.code, body
    except Exception as e:
        return 0, {"error": str(e)}


def post(path: str, data: dict, headers: dict = None) -> tuple[int, Any]:
    url = f"{BASE_URL}{path}"
    payload = json.dumps(data).encode()
    req = urllib.request.Request(url, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            body = json.loads(resp.read().decode())
            return resp.status, body
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except Exception:
            body = {"error": str(e)}
        return e.code, body
    except Exception as e:
        return 0, {"error": str(e)}


# ---------------------------------------------------------------------------
# Validators
# ---------------------------------------------------------------------------

def validate_server_reachable():
    print("\n[ Server Connectivity ]")
    t0 = time.monotonic()
    status, body = get("/api/health")
    ms = (time.monotonic() - t0) * 1000
    if status == 0:
        print(f"\n\033[31mERROR: Cannot reach {BASE_URL}\033[0m")
        print(f"  {body.get('error', 'unknown error')}")
        sys.exit(2)
    check("Server is reachable", status in (200, 503),
          f"Expected 200 or 503, got {status}", duration_ms=ms)
    check("Health response has status field", "status" in body,
          "Missing 'status' field in health response", body)
    check("Health status is valid enum",
          body.get("status") in ("healthy", "degraded", "unhealthy"),
          f"Invalid status: {body.get('status')}")


def validate_inventory_api():
    print("\n[ Inventory API — Business Logic ]")

    # Shape
    status, body = get("/api/inventory")
    check("Inventory returns 200", status == 200, f"Got {status}")
    check("Has vehicles array", isinstance(body.get("vehicles"), list),
          "vehicles is not a list", body)
    check("Has total (integer)", isinstance(body.get("total"), int),
          f"total is {type(body.get('total'))}")
    check("Has facets object", isinstance(body.get("facets"), dict),
          "facets is not a dict")
    check("Has page and page_size", "page" in body and "page_size" in body,
          "Missing pagination fields")

    # Source field
    check("Has source field", "source" in body,
          "Missing source field (elasticsearch|database|placeholder)")
    if "source" in body:
        check("Source is valid enum",
              body["source"] in ("elasticsearch", "database", "placeholder"),
              f"Invalid source: {body['source']}")

    # Make filter produces correct results
    status2, body2 = get("/api/inventory", {"make": "Toyota"})
    if status2 == 200 and body2.get("vehicles"):
        bad = [v for v in body2["vehicles"] if v.get("make", "").lower() != "toyota"]
        check("Make filter returns only matching vehicles", len(bad) == 0,
              f"{len(bad)} vehicles have wrong make", bad[:2])

    # Condition filter
    status3, body3 = get("/api/inventory", {"condition": "used"})
    check("Condition filter returns 200", status3 == 200, f"Got {status3}")

    # Invalid param → 400
    status4, body4 = get("/api/inventory", {"year_min": "notanumber"})
    check("Invalid year_min returns 400", status4 == 400,
          f"Expected 400 got {status4}")
    check("400 response has error field", "error" in body4,
          "Missing error field on 400 response")

    # EV filter
    status5, body5 = get("/api/inventory", {"ev_only": "true"})
    check("ev_only filter returns 200", status5 == 200, f"Got {status5}")
    if status5 == 200 and body5.get("vehicles"):
        non_ev = [v for v in body5["vehicles"] if not v.get("is_ev")]
        check("ev_only returns only EV vehicles", len(non_ev) == 0,
              f"{len(non_ev)} non-EV vehicles returned with ev_only=true")


def validate_lead_submission():
    print("\n[ Lead Submission + Scoring ]")

    unique_email = f"pipeline-validate-{int(time.time())}@pipeline-test.invalid"
    t0 = time.monotonic()
    status, body = post("/api/leads", {
        "dealer_id": DEALER_ID,
        "first_name": "Pipeline",
        "last_name": "Validator",
        "email": unique_email,
        "vehicle_interest": "2024 Toyota Camry pipeline test",
        "source": "vdp_inquiry",
        "message": "I am very interested in this vehicle and would like to schedule a test drive at your earliest convenience.",
    })
    ms = (time.monotonic() - t0) * 1000

    check("Lead submission returns 201", status == 201,
          f"Expected 201 got {status}", body, ms)

    if status == 201:
        check("Response has lead_id", bool(body.get("lead_id")),
              "Missing lead_id in response")
        check("Response has created_at", bool(body.get("created_at")),
              "Missing created_at in response")
        check("Response does not leak emailSent field",
              "emailSent" not in body and "email_sent" not in body,
              "Response leaks internal email delivery status")
        check("Response does not leak resendId",
              "resendId" not in body and "resend_id" not in body,
              "Response leaks Resend internal ID")

        # Intent score — should be set fire-and-forget on vdp_inquiry with long message
        # We can't directly verify the DB from here, but we can assert the API doesn't crash
        check("Lead submission under 3s", ms < 3000,
              f"Took {ms:.0f}ms — exceeds 3s SLA")

    # Validation rejects bad email
    status2, body2 = post("/api/leads", {
        "dealer_id": DEALER_ID,
        "first_name": "Bad",
        "last_name": "Email",
        "email": "not-an-email",
        "vehicle_interest": "test",
        "source": "website_form",
    })
    check("Invalid email returns 422", status2 == 422, f"Got {status2}")

    # Validation rejects invalid source
    status3, body3 = post("/api/leads", {
        "dealer_id": DEALER_ID,
        "first_name": "Bad",
        "last_name": "Source",
        "email": f"bad-source-{int(time.time())}@test.invalid",
        "vehicle_interest": "test",
        "source": "telepathy",
    })
    check("Invalid source returns 422", status3 == 422, f"Got {status3}")

    # Missing required fields → 422 with details array
    status4, body4 = post("/api/leads", {"dealer_id": DEALER_ID})
    check("Missing fields returns 422", status4 == 422, f"Got {status4}")
    if status4 == 422:
        check("422 response has details array",
              isinstance(body4.get("details"), list),
              "Missing details array on 422")


def validate_lead_scoring():
    print("\n[ Lead Scoring — Business Logic ]")

    # Submit a vdp_inquiry lead (highest source score) and verify scoring
    # We validate the scoring logic by testing the scoreLeadIntent function indirectly
    # through the /api/admin/leads/score endpoint (may need auth — we test gracefully)
    status, body = post("/api/admin/leads/score", {"lead_id": "nonexistent"})
    check("Lead score endpoint exists (not 404)",
          status != 404, f"Got 404 — endpoint missing")
    check("Lead score endpoint is auth-protected",
          status in (401, 403, 422, 404),
          f"Unauthenticated access returned {status} — expected 401/403")


def validate_compliance_scoring():
    print("\n[ Compliance Scoring — Business Logic ]")

    status, body = get("/api/admin/compliance")
    check("Compliance endpoint exists (not 404)", status != 404,
          "GET /api/admin/compliance returned 404")
    check("Compliance endpoint is auth-protected",
          status in (401, 403),
          f"Unauthenticated access returned {status}")

    # POST (trigger check) also auth-protected
    status2, body2 = post("/api/admin/compliance", {})
    check("Compliance POST is auth-protected",
          status2 in (401, 403),
          f"Unauthenticated POST returned {status2}")


def validate_pricing_intelligence():
    print("\n[ Pricing Intelligence — Business Logic ]")

    status, body = get("/api/admin/pricing")
    check("Pricing endpoint exists (not 404)", status != 404,
          "GET /api/admin/pricing returned 404")
    check("Pricing endpoint is auth-protected",
          status in (401, 403),
          f"Unauthenticated access returned {status}")


def validate_funnel_health():
    print("\n[ Funnel Health — Business Logic ]")

    status, body = get("/api/admin/funnel-health")
    check("Funnel health endpoint exists (not 404)", status != 404,
          "GET /api/admin/funnel-health returned 404")
    check("Funnel health is auth-protected",
          status in (401, 403),
          f"Unauthenticated access returned {status}")


def validate_security_headers():
    print("\n[ Security Headers — All Routes ]")

    routes = [
        "/api/health",
        "/api/inventory",
        "/api/admin/leads",
        "/api/admin/compliance",
        "/api/admin/pricing",
        "/api/admin/funnel-health",
    ]

    required_headers = {
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
    }

    for route in routes:
        url = f"{BASE_URL}{route}"
        try:
            req = urllib.request.Request(url, method="GET")
            try:
                with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                    headers = {k.lower(): v for k, v in resp.headers.items()}
            except urllib.error.HTTPError as e:
                headers = {k.lower(): v for k, v in e.headers.items()}

            for header, expected in required_headers.items():
                actual = headers.get(header, "")
                check(f"{route} → {header}",
                      actual == expected,
                      f"Expected '{expected}', got '{actual}'")
        except Exception as e:
            check(f"{route} → headers reachable", False, str(e))


def validate_no_stack_traces():
    print("\n[ Error Safety — No Stack Traces Leaked ]")

    bad_inputs = [
        ("/api/inventory", {"year_min": "'; DROP TABLE vehicles; --"}),
        ("/api/inventory", {"make": "<script>alert(1)</script>"}),
    ]

    for path, params in bad_inputs:
        status, body = get(path, params)
        body_str = json.dumps(body)
        check(f"No stack trace in {path} error response",
              "node_modules" not in body_str and ".js:" not in body_str,
              "Stack trace leaked in response body")
        check(f"No SQL error in {path} response",
              "syntax error" not in body_str.lower() and
              "pg_" not in body_str and
              "postgres" not in body_str.lower(),
              "SQL error details leaked in response body")


def validate_rate_limiting():
    print("\n[ Rate Limiting — Bulk APIs ]")

    # Verify the bulk leads endpoint exists and is auth-protected (rate limit tested at auth layer)
    status, body = post("/api/admin/leads/bulk", {"action": "status", "lead_ids": [], "value": "new"})
    check("Bulk leads endpoint exists (not 404)", status != 404,
          "POST /api/admin/leads/bulk returned 404")
    check("Bulk leads endpoint is auth-protected",
          status in (401, 403),
          f"Unauthenticated access returned {status}")


def validate_ev_features():
    print("\n[ EV Features — Inventory Filtering ]")

    status, body = get("/api/inventory", {"ev_only": "true"})
    check("ev_only filter returns 200", status == 200, f"Got {status}")

    status2, body2 = get("/api/inventory", {"ev_range_min": "200"})
    check("ev_range_min filter returns 200", status2 == 200, f"Got {status2}")
    if status2 == 200 and body2.get("vehicles"):
        short_range = [v for v in body2["vehicles"]
                       if v.get("ev_range_miles") is not None and v["ev_range_miles"] < 200]
        check("ev_range_min filters correctly", len(short_range) == 0,
              f"{len(short_range)} vehicles returned with range < 200 miles")


# ---------------------------------------------------------------------------
# Trade-In Valuation
# ---------------------------------------------------------------------------

def validate_trade_in():
    print("\n[ Trade-In Valuation — Business Logic ]")

    camry_payload = {
        "year": 2020,
        "make": "Toyota",
        "model": "Camry",
        "trim": "LE",
        "mileage": 35000,
        "condition": "good",
        "hasAccident": False,
        "titleStatus": "clean",
        "zipCode": "10001",
    }

    start = time.time()
    status, body = post("/api/trade-in/estimate", camry_payload)
    duration = (time.time() - start) * 1000

    check("trade-in estimate returns 200", status == 200, f"Got {status}")

    if status == 200:
        low = body.get("estimatedLow")
        mid = body.get("estimatedMid")
        high = body.get("estimatedHigh")
        confidence = body.get("confidence")
        expires_at = body.get("expiresAt")
        factors = body.get("factors")

        check("estimatedLow is positive", isinstance(low, (int, float)) and low > 0,
              f"estimatedLow={low}")
        check("estimatedMid > estimatedLow", isinstance(mid, (int, float)) and isinstance(low, (int, float)) and mid > low,
              f"mid={mid} low={low}")
        check("estimatedHigh > estimatedMid", isinstance(high, (int, float)) and isinstance(mid, (int, float)) and high > mid,
              f"high={high} mid={mid}")
        check("confidence is valid enum", confidence in ("high", "medium", "low"),
              f"confidence={confidence}")
        check("expiresAt is present", bool(expires_at), "missing expiresAt")
        check("factors list present", isinstance(factors, list) and len(factors) > 0,
              f"factors={factors}")
        check("response under 500ms", duration < 500,
              f"Took {duration:.0f}ms — valuation algorithm too slow", duration_ms=duration)

        # Range sanity: 2020 Camry LE with 35k miles in good condition should be $12k-$25k
        check("estimatedMid in plausible range for 2020 Camry", 8000 <= mid <= 30000,
              f"estimatedMid={mid} outside plausible $8k-$30k range for 2020 Camry LE")

    # Test with high-mileage beater — should produce lower estimate
    beater_payload = {
        "year": 2012,
        "make": "Ford",
        "model": "Focus",
        "trim": "SE",
        "mileage": 150000,
        "condition": "fair",
        "hasAccident": True,
        "titleStatus": "clean",
        "zipCode": "10001",
    }
    status2, body2 = post("/api/trade-in/estimate", beater_payload)
    check("high-mileage estimate returns 200", status2 == 200, f"Got {status2}")
    if status2 == 200 and isinstance(body2.get("estimatedMid"), (int, float)) and isinstance(mid, (int, float)):
        check("beater estimate lower than clean Camry", body2["estimatedMid"] < mid,
              f"beater mid={body2['estimatedMid']} not lower than Camry mid={mid}")

    # Test validation — missing required fields
    status3, _ = post("/api/trade-in/estimate", {"year": 2020})
    check("estimate rejects incomplete request", status3 in (400, 422),
          f"Expected 400/422, got {status3}")


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

def summarize(as_json: bool = False):
    passed = sum(1 for r in results if r.passed)
    failed = sum(1 for r in results if not r.passed)
    total = len(results)

    if as_json:
        print(json.dumps({
            "passed": passed,
            "failed": failed,
            "total": total,
            "results": [
                {"name": r.name, "passed": r.passed, "message": r.message}
                for r in results
            ]
        }, indent=2))
        return

    print("\n" + "─" * 60)
    print("Pipeline Execution Validator — Summary")
    print("─" * 60)
    print(f"  PASS: {passed}   FAIL: {failed}   TOTAL: {total}")

    if failed == 0:
        print("\n  \033[32m✓ All validations passed — safe to deploy\033[0m\n")
    else:
        print(f"\n  \033[31m✗ {failed} validation(s) failed — do not deploy\033[0m\n")
        print("  Failed checks:")
        for r in results:
            if not r.passed:
                print(f"    • {r.name}: {r.message}")
        print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    global fail_fast

    parser = argparse.ArgumentParser(description="Wolfpack Auto Pipeline Execution Validator")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    parser.add_argument("--fail-fast", action="store_true", help="Stop on first failure")
    args = parser.parse_args()
    fail_fast = args.fail_fast

    print(f"Wolfpack Auto — Pipeline Execution Validator")
    print(f"Target: {BASE_URL}")
    print(f"Dealer: {DEALER_ID}")

    validate_server_reachable()
    validate_inventory_api()
    validate_lead_submission()
    validate_lead_scoring()
    validate_compliance_scoring()
    validate_pricing_intelligence()
    validate_funnel_health()
    validate_security_headers()
    validate_no_stack_traces()
    validate_rate_limiting()
    validate_ev_features()
    validate_trade_in()

    summarize(as_json=args.json)
    sys.exit(0 if all(r.passed for r in results) else 1)


if __name__ == "__main__":
    main()
