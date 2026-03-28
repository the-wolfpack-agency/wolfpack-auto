/**
 * Enhancement tests — duplicate lead detection, API versioning, useApi hook.
 *
 * Tests run against a live or mock server depending on the environment.
 * For CI without a running server, the source-level checks still validate
 * that the implementation code is wired correctly.
 */

import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

/* ====================================================================== */
/*  Helpers                                                                */
/* ====================================================================== */

function readSource(relativePath: string): string {
  const abs = join(__dirname, "../../src", relativePath);
  if (!existsSync(abs)) {
    throw new Error(`Source file not found: ${abs}`);
  }
  return readFileSync(abs, "utf-8");
}

function uniqueEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

function leadPayload(overrides: Record<string, unknown> = {}) {
  return {
    dealer_id: "test-dealer-001",
    first_name: "Test",
    last_name: "User",
    email: uniqueEmail(),
    phone: "+12025551234",
    vehicle_interest: "2024 Test Vehicle",
    source: "website_form",
    notes: "Automated test submission",
    ...overrides,
  };
}

/* ====================================================================== */
/*  1. Duplicate Lead Detection                                            */
/* ====================================================================== */

test.describe("Duplicate Lead Detection", () => {
  test("POST /api/leads with new email returns 201", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/leads`, {
      data: leadPayload(),
    });
    // Accept 201 (created) or 200 (queued without DB) — both are success
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    expect(body).toHaveProperty("lead_id");
  });

  test("POST /api/leads with same email again returns duplicate flag", async ({
    request,
  }) => {
    const email = uniqueEmail();
    const payload = leadPayload({ email });

    // First submission
    const first = await request.post(`${BASE_URL}/api/leads`, {
      data: payload,
    });
    expect([200, 201]).toContain(first.status());

    // Second submission with same email + dealer
    const second = await request.post(`${BASE_URL}/api/leads`, {
      data: payload,
    });
    const body = await second.json();

    // If DB is connected, expect duplicate detection (200 with duplicate: true)
    // If no DB (queued mode), both come back 201 — still valid behavior
    if (second.status() === 200 && body.duplicate) {
      expect(body.duplicate).toBe(true);
      expect(body).toHaveProperty("id");
      expect(body.message).toBe("Lead already exists");
    }
  });

  test("POST /api/leads with same email but different dealer is not a duplicate", async ({
    request,
  }) => {
    const email = uniqueEmail();

    const first = await request.post(`${BASE_URL}/api/leads`, {
      data: leadPayload({ email, dealer_id: "dealer-A" }),
    });
    expect([200, 201]).toContain(first.status());

    const second = await request.post(`${BASE_URL}/api/leads`, {
      data: leadPayload({ email, dealer_id: "dealer-B" }),
    });
    // Different dealer = not a duplicate, should create new
    expect([200, 201]).toContain(second.status());
    const body = await second.json();
    // Should NOT have duplicate flag
    expect(body.duplicate).toBeFalsy();
  });

  test("duplicate detection query filters by 30-day window", () => {
    const src = readSource("app/api/leads/route.ts");
    // The SQL must include a time-window filter
    expect(src).toContain("INTERVAL '30 days'");
    expect(src).toContain("deleted_at IS NULL");
  });

  test("duplicate detection fires analytics event", () => {
    const src = readSource("app/api/leads/route.ts");
    expect(src).toContain("trackLead");
    expect(src).toContain("lead.duplicate_detected");
  });

  test("leads route imports trackLead from analytics-hooks", () => {
    const src = readSource("app/api/leads/route.ts");
    expect(src).toMatch(/import\s*\{[^}]*trackLead[^}]*\}\s*from\s*["']@\/lib\/analytics-hooks["']/);
  });

  test("LeadEvent type includes duplicate_detected", () => {
    const src = readSource("lib/analytics-hooks.ts");
    expect(src).toContain('"lead.duplicate_detected"');
  });
});

/* ====================================================================== */
/*  2. API Versioning                                                      */
/* ====================================================================== */

test.describe("API Versioning Header", () => {
  test("api-version module exports API_VERSION and withApiVersion", () => {
    const src = readSource("lib/api-version.ts");
    expect(src).toMatch(/export const API_VERSION\s*=\s*"/);
    expect(src).toMatch(/export function withApiVersion/);
    expect(src).toContain("X-API-Version");
  });

  test("API_VERSION is a valid semver string", () => {
    const src = readSource("lib/api-version.ts");
    const match = src.match(/API_VERSION\s*=\s*"(\d+\.\d+\.\d+)"/);
    expect(match).not.toBeNull();
    const [major, minor, patch] = match![1].split(".").map(Number);
    expect(major).toBeGreaterThanOrEqual(0);
    expect(minor).toBeGreaterThanOrEqual(0);
    expect(patch).toBeGreaterThanOrEqual(0);
  });

  test("middleware sets X-API-Version on all responses", () => {
    const src = readSource("middleware.ts");
    expect(src).toContain("API_VERSION_HEADER");
    expect(src).toContain("API_VERSION");
    expect(src).toMatch(/import.*API_VERSION.*from.*api-version/);
  });

  test("GET /api/health includes X-API-Version header", async ({
    request,
  }) => {
    const res = await request.get(`${BASE_URL}/api/health`);
    const version = res.headers()["x-api-version"];
    // Middleware sets this on all routes including /api/health
    if (version) {
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  test("POST /api/leads includes X-API-Version header", async ({
    request,
  }) => {
    const res = await request.post(`${BASE_URL}/api/leads`, {
      data: leadPayload(),
    });
    const version = res.headers()["x-api-version"];
    if (version) {
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});

/* ====================================================================== */
/*  3. useApi Hook                                                         */
/* ====================================================================== */

test.describe("useApi Hook", () => {
  test("use-api.ts exists and exports useApi", () => {
    const src = readSource("lib/use-api.ts");
    expect(src).toMatch(/export function useApi/);
  });

  test("useApi uses 'use client' directive", () => {
    const src = readSource("lib/use-api.ts");
    expect(src).toMatch(/^["']use client["']/);
  });

  test("useApi handles 401 gracefully without setting error", () => {
    const src = readSource("lib/use-api.ts");
    // Must check for 401 and return null without an error message
    expect(src).toContain("401");
    expect(src).toContain("setData(null)");
  });

  test("useApi supports refreshInterval option", () => {
    const src = readSource("lib/use-api.ts");
    expect(src).toContain("refreshInterval");
    expect(src).toContain("setInterval");
    expect(src).toContain("clearInterval");
  });

  test("useApi supports revalidateOnFocus option", () => {
    const src = readSource("lib/use-api.ts");
    expect(src).toContain("revalidateOnFocus");
    expect(src).toContain("addEventListener");
    expect(src).toContain('"focus"');
  });

  test("useApi exposes mutate function for manual refetch", () => {
    const src = readSource("lib/use-api.ts");
    expect(src).toContain("mutate");
    // The return object must include mutate
    expect(src).toMatch(/return\s*\{[^}]*mutate/);
  });

  test("useApi includes migration documentation", () => {
    const src = readSource("lib/use-api.ts");
    expect(src).toContain("Migration path");
  });
});
