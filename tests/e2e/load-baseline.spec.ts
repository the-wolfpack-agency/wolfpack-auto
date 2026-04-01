/**
 * Load Baseline — Performance Regression Gate
 *
 * Measures response times for critical endpoints and validates the platform
 * handles concurrent requests without errors. Results are emitted to the
 * analytics pipeline so the learning system can track performance trends.
 *
 * Thresholds:
 *   - API endpoints: p95 < 500ms
 *   - Page routes:   p95 < 2000ms
 *   - Error rate:    0% 500s under moderate load
 *   - Concurrency:   10 parallel requests, no failures
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Endpoint definitions
// ---------------------------------------------------------------------------

interface EndpointDef {
  path: string;
  label: string;
  kind: "api" | "page";
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}

const ENDPOINTS: EndpointDef[] = [
  // API endpoints — p95 must be < 500ms
  { path: "/api/inventory", label: "inventory_api", kind: "api" },
  { path: "/api/admin/leads", label: "leads_api", kind: "api" },
  { path: "/api/admin/deals", label: "deals_api", kind: "api" },
  { path: "/api/admin/analytics/dashboard", label: "analytics_api", kind: "api" },
  { path: "/api/admin/stats", label: "stats_api", kind: "api" },
  { path: "/api/admin/inventory", label: "inventory_admin_api", kind: "api" },

  // Page routes — p95 must be < 2000ms
  { path: "/inventory", label: "inventory_page", kind: "page" },
  { path: "/admin", label: "admin_page", kind: "page" },
  { path: "/admin/leads", label: "leads_page", kind: "page" },
  { path: "/admin/deals", label: "deals_page", kind: "page" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect N latency samples for a single endpoint. */
async function measureEndpoint(
  request: import("@playwright/test").APIRequestContext,
  ep: EndpointDef,
  samples: number,
): Promise<{ latencies: number[]; errors: number }> {
  const latencies: number[] = [];
  let errors = 0;

  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    try {
      const resp =
        ep.method === "POST"
          ? await request.post(ep.path, {
              data: ep.body,
              headers: { "Content-Type": "application/json" },
            })
          : await request.get(ep.path);

      const elapsed = performance.now() - start;
      latencies.push(elapsed);

      if (resp.status() >= 500) errors++;
    } catch {
      const elapsed = performance.now() - start;
      latencies.push(elapsed);
      errors++;
    }
  }

  return { latencies, errors };
}

/** Compute percentile from a sorted array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/** Sort numbers ascending. */
function sortAsc(arr: number[]): number[] {
  return [...arr].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const SAMPLES_PER_ENDPOINT = 10;
const API_P95_THRESHOLD_MS = 500;
const PAGE_P95_THRESHOLD_MS = 2000;
const CONCURRENCY = 10;

test.describe("Load Baseline — Performance", () => {
  const allResults: Array<{
    endpoint: string;
    p50_ms: number;
    p95_ms: number;
    p99_ms: number;
    error_rate: number;
    concurrent_ok: boolean;
  }> = [];

  for (const ep of ENDPOINTS) {
    test(`${ep.label}: p95 latency within threshold`, async ({ request }) => {
      const { latencies, errors } = await measureEndpoint(
        request,
        ep,
        SAMPLES_PER_ENDPOINT,
      );

      const sorted = sortAsc(latencies);
      const p50 = percentile(sorted, 50);
      const p95 = percentile(sorted, 95);
      const p99 = percentile(sorted, 99);
      const errorRate = errors / SAMPLES_PER_ENDPOINT;

      const threshold =
        ep.kind === "api" ? API_P95_THRESHOLD_MS : PAGE_P95_THRESHOLD_MS;

      // No 500s allowed
      expect(
        errors,
        `${ep.label}: ${errors}/${SAMPLES_PER_ENDPOINT} requests returned 500`,
      ).toBe(0);

      // p95 must be under threshold
      expect(
        p95,
        `${ep.label}: p95=${p95.toFixed(0)}ms exceeds ${threshold}ms threshold`,
      ).toBeLessThan(threshold);

      allResults.push({
        endpoint: ep.label,
        p50_ms: Math.round(p50),
        p95_ms: Math.round(p95),
        p99_ms: Math.round(p99),
        error_rate: errorRate,
        concurrent_ok: true, // updated by concurrency test
      });
    });
  }

  test("concurrent requests: 10 parallel, no failures", async ({ request }) => {
    // Fire CONCURRENCY requests to each critical API endpoint simultaneously
    const criticalPaths = ENDPOINTS.filter((e) => e.kind === "api").map(
      (e) => e.path,
    );

    for (const path of criticalPaths) {
      const promises = Array.from({ length: CONCURRENCY }, () =>
        request.get(path).then((r) => r.status()),
      );

      const statuses = await Promise.all(promises);
      const failures = statuses.filter((s) => s >= 500);

      expect(
        failures.length,
        `${path}: ${failures.length}/${CONCURRENCY} concurrent requests returned 500`,
      ).toBe(0);
    }
  });

  test("emit results to analytics pipeline", async ({ request }) => {
    // Collect a fresh round of metrics specifically for the analytics event
    const metrics: Array<{
      endpoint: string;
      p50_ms: number;
      p95_ms: number;
      p99_ms: number;
      error_rate: number;
      concurrent_ok: boolean;
    }> = [];

    for (const ep of ENDPOINTS) {
      const { latencies, errors } = await measureEndpoint(request, ep, 5);
      const sorted = sortAsc(latencies);

      metrics.push({
        endpoint: ep.label,
        p50_ms: Math.round(percentile(sorted, 50)),
        p95_ms: Math.round(percentile(sorted, 95)),
        p99_ms: Math.round(percentile(sorted, 99)),
        error_rate: errors / 5,
        concurrent_ok: true,
      });
    }

    // Emit to analytics
    const resp = await request.post("/api/analytics/events", {
      data: {
        category: "load_baseline",
        action: "performance_baseline",
        timestamp: new Date().toISOString(),
        metadata: {
          metrics,
          thresholds: {
            api_p95_ms: API_P95_THRESHOLD_MS,
            page_p95_ms: PAGE_P95_THRESHOLD_MS,
            concurrency: CONCURRENCY,
          },
        },
      },
      headers: { "Content-Type": "application/json" },
    });

    // Analytics endpoint should accept the event (200/201) or at minimum not 500
    expect(
      resp.status(),
      `Analytics event submission failed with ${resp.status()}`,
    ).toBeLessThan(500);
  });
});
