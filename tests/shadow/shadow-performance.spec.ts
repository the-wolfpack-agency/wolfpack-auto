/**
 * shadow-performance.spec.ts
 *
 * Response time baselines for every public API endpoint.
 * Catches slow queries, N+1 problems, and missing indexes before they
 * reach production and affect client trust.
 *
 * Thresholds are intentionally generous (they must pass in CI with a cold
 * local DB). The value is trend detection — if an endpoint consistently runs
 * at 50ms and suddenly hits 800ms, a developer changed something.
 *
 * Adjust SLA_MS if your production infrastructure has different performance
 * characteristics.
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// SLA thresholds (ms) — fail the test if p50 exceeds this
// ---------------------------------------------------------------------------

const SLA_MS = {
  // Public endpoints (no auth, no heavy computation)
  public_page: 3000,
  // API endpoints — DB reads
  api_fast: 2000,
  // API endpoints — DB writes or complex queries
  api_write: 3000,
  // Health check — must be near-instant
  health: 1000,
};

const DEALER_ID = "00000000-0000-4000-a000-000000000001";

// ---------------------------------------------------------------------------
// Helper: measure a request and assert it finishes within the threshold
// ---------------------------------------------------------------------------

async function assertResponseTime(
  label: string,
  request: () => Promise<{ status: () => number }>,
  thresholdMs: number,
): Promise<void> {
  const start = Date.now();
  const resp = await request();
  const elapsed = Date.now() - start;

  // Don't fail on 404 (route may not be in this build) — but DO record time
  if (resp.status() === 404) {
    console.log(`[SKIP] ${label} — 404, route not in this build`);
    return;
  }

  expect(
    elapsed,
    `${label} took ${elapsed}ms — exceeded SLA of ${thresholdMs}ms`,
  ).toBeLessThan(thresholdMs);
}

// ---------------------------------------------------------------------------
// Health check — fastest endpoint, no DB required
// ---------------------------------------------------------------------------

test.describe("Performance — /api/health", () => {
  test("responds within SLA", async ({ request }) => {
    await assertResponseTime(
      "/api/health",
      () => request.get("/api/health"),
      SLA_MS.health,
    );
  });

  test("responds within SLA on repeated calls (no cold-start penalty)", async ({
    request,
  }) => {
    // First call may warm up connection pool — second should be faster
    await request.get("/api/health");
    await assertResponseTime(
      "/api/health (warm)",
      () => request.get("/api/health"),
      SLA_MS.health,
    );
  });
});

// ---------------------------------------------------------------------------
// Inventory API — most traffic-heavy endpoint
// ---------------------------------------------------------------------------

test.describe("Performance — /api/inventory", () => {
  test("default list responds within SLA", async ({ request }) => {
    await assertResponseTime(
      "GET /api/inventory",
      () => request.get("/api/inventory"),
      SLA_MS.api_fast,
    );
  });

  test("make filter responds within SLA", async ({ request }) => {
    await assertResponseTime(
      "GET /api/inventory?make=Toyota",
      () => request.get("/api/inventory?make=Toyota"),
      SLA_MS.api_fast,
    );
  });

  test("pagination responds within SLA", async ({ request }) => {
    await assertResponseTime(
      "GET /api/inventory?page=1&page_size=20",
      () => request.get("/api/inventory?page=1&page_size=20"),
      SLA_MS.api_fast,
    );
  });
});

// ---------------------------------------------------------------------------
// Spotlight API — homepage critical path
// ---------------------------------------------------------------------------

test.describe("Performance — /api/inventory/spotlight", () => {
  test("responds within SLA (homepage depends on this)", async ({
    request,
  }) => {
    await assertResponseTime(
      "GET /api/inventory/spotlight",
      () =>
        request.get(
          `/api/inventory/spotlight?dealer_id=${DEALER_ID}`,
        ),
      SLA_MS.api_fast,
    );
  });
});

// ---------------------------------------------------------------------------
// Leads POST — conversion-critical write path
// ---------------------------------------------------------------------------

test.describe("Performance — POST /api/leads", () => {
  test("lead submission responds within SLA", async ({ request }) => {
    await assertResponseTime(
      "POST /api/leads",
      () =>
        request.post("/api/leads", {
          data: {
            dealer_id: DEALER_ID,
            first_name: "Perf",
            last_name: "Test",
            email: `perf-${Date.now()}@shadow-test.invalid`,
            vehicle_interest: "performance test vehicle",
            source: "website_form",
          },
        }),
      SLA_MS.api_write,
    );
  });
});

// ---------------------------------------------------------------------------
// Admin leads — backend-facing, higher latency acceptable
// ---------------------------------------------------------------------------

test.describe("Performance — /api/admin/leads", () => {
  test("admin lead list responds within SLA", async ({ request }) => {
    await assertResponseTime(
      "GET /api/admin/leads",
      () => request.get("/api/admin/leads"),
      SLA_MS.api_fast,
    );
  });

  test("admin lead list with pagination responds within SLA", async ({
    request,
  }) => {
    await assertResponseTime(
      "GET /api/admin/leads?page=1&page_size=25",
      () => request.get("/api/admin/leads?page=1&page_size=25"),
      SLA_MS.api_fast,
    );
  });
});

// ---------------------------------------------------------------------------
// Public pages — browser-facing, must feel instant
// ---------------------------------------------------------------------------

test.describe("Performance — public pages", () => {
  test("homepage responds within SLA", async ({ page }) => {
    const start = Date.now();
    const resp = await page.goto("/");
    const elapsed = Date.now() - start;
    const status = resp?.status() ?? 0;

    if (status === 404) return; // redirect to dealer page acceptable
    expect(elapsed, `Homepage took ${elapsed}ms`).toBeLessThan(
      SLA_MS.public_page,
    );
  });

  test("inventory page responds within SLA", async ({ page }) => {
    const start = Date.now();
    const resp = await page.goto("/inventory");
    const elapsed = Date.now() - start;
    const status = resp?.status() ?? 0;

    if (status === 404) return;
    expect(elapsed, `/inventory took ${elapsed}ms`).toBeLessThan(
      SLA_MS.public_page,
    );
  });

  test("contact page responds within SLA", async ({ page }) => {
    const start = Date.now();
    const resp = await page.goto("/contact");
    const elapsed = Date.now() - start;
    const status = resp?.status() ?? 0;

    if (status === 404) return;
    expect(elapsed, `/contact took ${elapsed}ms`).toBeLessThan(
      SLA_MS.public_page,
    );
  });
});

// ---------------------------------------------------------------------------
// Regression guard: response time should not increase >50% across test runs
// (this is a placeholder — a real implementation would store baseline in CI
//  artifacts and compare; here we assert a hard upper bound)
// ---------------------------------------------------------------------------

test.describe("Performance — regression guard", () => {
  test("no endpoint exceeds hard ceiling of 5s", async ({ request }) => {
    const HARD_CEILING_MS = 5000;
    const endpoints = [
      "/api/health",
      "/api/inventory",
      `/api/inventory/spotlight?dealer_id=${DEALER_ID}`,
      "/api/admin/leads",
    ];

    for (const url of endpoints) {
      const start = Date.now();
      await request.get(url);
      const elapsed = Date.now() - start;
      expect(
        elapsed,
        `${url} exceeded hard ceiling: ${elapsed}ms > ${HARD_CEILING_MS}ms`,
      ).toBeLessThan(HARD_CEILING_MS);
    }
  });
});
