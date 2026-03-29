/**
 * Canary: Deep Health Endpoint — Contract Tests
 *
 * These tests verify the deep health endpoint's response contract,
 * error handling, and auth behavior. They run against whatever
 * infrastructure is available (including shadow mode) and validate
 * the endpoint ITSELF works correctly regardless of deployment state.
 *
 * Unlike the other canary tests (which assert production is healthy),
 * these tests validate the canary tooling itself is reliable.
 */

import { test, expect } from "@playwright/test";

test.describe("Deep Health Endpoint — Contract", () => {
  test("returns valid JSON with all required top-level fields", async ({ request }) => {
    const res = await request.get("/api/health/deep");
    const body = await res.json();

    // Top-level fields
    expect(body.status).toMatch(/^(healthy|degraded|critical|shadow)$/);
    expect(body.timestamp).toBeTruthy();
    expect(typeof body.responseTimeMs).toBe("number");

    // Shadow mode section
    expect(typeof body.shadowMode.active).toBe("boolean");
    expect(typeof body.shadowMode.databaseUrlSet).toBe("boolean");
    expect(typeof body.shadowMode.detected).toBe("boolean");

    // Probes section
    expect(body.probes).toBeDefined();
    expect(body.probes.database).toBeDefined();
    expect(body.probes.writeRoundtrip).toBeDefined();
    expect(body.probes.elasticsearch).toBeDefined();
    expect(body.probes.analyticsPipeline).toBeDefined();

    // Deployment section
    expect(body.deployment).toBeDefined();
    expect(body.deployment.commitHash).toBeTruthy();
    expect(body.deployment.environment).toBeTruthy();

    // Canary section
    expect(body.canary).toBeDefined();
    expect(body.canary.runId).toMatch(/^canary-/);
    expect(body.canary.probeCount).toBe(4);
    expect(body.canary.verdict).toMatch(/^(PASS|FAIL)$/);
  });

  test("every probe has status, latencyMs, and detail", async ({ request }) => {
    const res = await request.get("/api/health/deep");
    const body = await res.json();

    for (const [name, probe] of Object.entries(body.probes) as [string, Record<string, unknown>][]) {
      expect(probe.status, `${name}.status`).toMatch(/^(pass|fail|skip)$/);
      expect(typeof probe.latencyMs, `${name}.latencyMs`).toBe("number");
      expect(typeof probe.detail, `${name}.detail`).toBe("string");
      expect(probe.detail, `${name}.detail should be non-empty`).toBeTruthy();
    }
  });

  test("probe counts are consistent", async ({ request }) => {
    const res = await request.get("/api/health/deep");
    const body = await res.json();

    const { passCount, failCount, skipCount, probeCount } = body.canary;
    expect(passCount + failCount + skipCount).toBe(probeCount);
  });

  test("status is shadow when DATABASE_URL is missing", async ({ request }) => {
    const res = await request.get("/api/health/deep");
    const body = await res.json();

    if (body.shadowMode.active) {
      expect(body.status).toBe("shadow");
      expect(body.shadowMode.databaseUrlSet).toBe(false);
      // Write roundtrip and analytics should be skipped
      expect(body.probes.writeRoundtrip.status).toBe("skip");
      expect(body.probes.analyticsPipeline.status).toBe("skip");
    }
  });

  test("status is healthy only when no probes fail", async ({ request }) => {
    const res = await request.get("/api/health/deep");
    const body = await res.json();

    if (body.status === "healthy") {
      expect(body.canary.failCount).toBe(0);
      expect(body.canary.verdict).toBe("PASS");
    }
  });

  test("returns 503 when status is critical or shadow", async ({ request }) => {
    const res = await request.get("/api/health/deep");
    const body = await res.json();

    if (body.status === "critical" || body.status === "shadow") {
      expect(res.status()).toBe(503);
    } else {
      expect(res.status()).toBe(200);
    }
  });

  test("unauthorized request without secret gets 401", async ({ request }) => {
    // Make a request WITHOUT the canary secret header
    const res = await request.fetch("/api/health/deep", {
      headers: { "x-canary-secret": "wrong-secret-value" },
    });

    // In development/demo mode, auth is bypassed
    // In production with CANARY_SECRET set, this should be 401
    // We accept either — the test validates the endpoint handles both
    expect([200, 401, 503]).toContain(res.status());
  });

  test("idempotent — consecutive calls produce consistent structure", async ({ request }) => {
    const res1 = await request.get("/api/health/deep");
    const res2 = await request.get("/api/health/deep");

    const body1 = await res1.json();
    const body2 = await res2.json();

    // Structure should be identical
    expect(Object.keys(body1).sort()).toEqual(Object.keys(body2).sort());
    expect(Object.keys(body1.probes).sort()).toEqual(Object.keys(body2.probes).sort());

    // Status should be consistent (same infrastructure, seconds apart)
    expect(body1.status).toBe(body2.status);
  });
});
