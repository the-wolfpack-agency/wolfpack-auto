/**
 * Canary: Latency Gates
 *
 * Verifies production response times are within acceptable thresholds.
 * Catches cold-start regressions, connection pool exhaustion, and
 * infrastructure misconfigurations that wouldn't surface in shadow tests.
 *
 * Thresholds are generous for serverless (Vercel Functions) — first request
 * may be a cold start. Each endpoint is hit twice: first to warm, second
 * to measure.
 */

import { test, expect } from "@playwright/test";

interface LatencyCheck {
  name: string;
  path: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  warmThresholdMs: number; // p95 threshold for warmed response
  coldThresholdMs: number; // threshold for first (potentially cold) request
}

const CHECKS: LatencyCheck[] = [
  {
    name: "Shallow health",
    path: "/api/health",
    method: "GET",
    warmThresholdMs: 8000, // Vercel Hobby: Redis/DB probe timeouts add latency
    coldThresholdMs: 10000, // Serverless cold start + connection timeouts
  },
  {
    name: "Deep health (all probes)",
    path: "/api/health/deep",
    method: "GET",
    warmThresholdMs: 8000,
    coldThresholdMs: 10000,
  },
  {
    name: "Inventory list",
    path: "/api/inventory",
    method: "GET",
    warmThresholdMs: 5000,
    coldThresholdMs: 8000,
  },
  {
    name: "Lead submission",
    path: "/api/leads",
    method: "POST",
    body: {
      first_name: "Latency",
      last_name: "Canary",
      email: `latency-canary-${Date.now()}@test.wolfpackauto.com`,
      phone: "+15550000001",
      dealer_id: "demo-dealer",
      vehicle_interest: "Any — latency probe",
      message: "Latency canary probe — safe to delete",
      source: "website_form",
    },
    warmThresholdMs: 5000,
    coldThresholdMs: 8000,
  },
];

for (const check of CHECKS) {
  test(`${check.name} responds within ${check.coldThresholdMs}ms (cold) / ${check.warmThresholdMs}ms (warm)`, async ({
    request,
  }) => {
    // Cold request — may include serverless cold start
    const coldStart = Date.now();
    const coldRes =
      check.method === "POST"
        ? await request.post(check.path, { data: check.body })
        : await request.get(check.path);
    const coldLatency = Date.now() - coldStart;

    expect(coldRes.status()).toBeLessThan(500);
    expect(coldLatency).toBeLessThan(check.coldThresholdMs);

    // Warm request — function is now hot
    const warmStart = Date.now();
    const warmRes =
      check.method === "POST"
        ? await request.post(check.path, {
            data: {
              ...check.body,
              email: `latency-warm-${Date.now()}@test.wolfpackauto.com`,
            },
          })
        : await request.get(check.path);
    const warmLatency = Date.now() - warmStart;

    expect(warmRes.status()).toBeLessThan(500);
    expect(warmLatency).toBeLessThan(check.warmThresholdMs);
  });
}

test("sustained load — 5 sequential requests stay under threshold", async ({ request }) => {
  const latencies: number[] = [];

  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    const res = await request.get("/api/health");
    latencies.push(Date.now() - start);
    expect(res.status()).toBeLessThan(500);
  }

  // Sort and take p95 (for 5 requests, that's the max)
  latencies.sort((a, b) => a - b);
  const p95 = latencies[latencies.length - 1];

  // After warming, p95 should stay under 8s (Vercel Hobby cold starts + DB probes)
  expect(p95).toBeLessThan(8000);

  // Average should be under 6s
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  expect(avg).toBeLessThan(6000);
});
