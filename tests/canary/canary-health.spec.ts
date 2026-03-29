/**
 * Canary: Deep Health Verification
 *
 * Verifies the production deployment has real infrastructure connected,
 * is NOT silently running in Shadow Mode, and all probes pass.
 */

import { test, expect } from "@playwright/test";

test.describe("Deep Health — Production Readiness", () => {
  test("deep health returns 200 with healthy status", async ({ request }) => {
    const res = await request.get("/api/health/deep");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("healthy");
    expect(body.canary.verdict).toBe("PASS");
    expect(body.canary.failCount).toBe(0);
  });

  test("shadow mode is NOT active", async ({ request }) => {
    const res = await request.get("/api/health/deep");
    const body = await res.json();

    expect(body.shadowMode.active).toBe(false);
    expect(body.shadowMode.databaseUrlSet).toBe(true);
    expect(body.shadowMode.detected).toBe(false);
  });

  test("database probe passes with real tables", async ({ request }) => {
    const res = await request.get("/api/health/deep");
    const body = await res.json();

    expect(body.probes.database.status).toBe("pass");
    expect(body.probes.database.tableCount).toBeGreaterThan(0);
    expect(body.probes.database.latencyMs).toBeGreaterThan(0);
    expect(body.probes.database.circuitBreakerState).toBe("CLOSED");
  });

  test("write roundtrip probe passes", async ({ request }) => {
    const res = await request.get("/api/health/deep");
    const body = await res.json();

    expect(body.probes.writeRoundtrip.status).toBe("pass");
    expect(body.probes.writeRoundtrip.inserted).toBe(true);
    expect(body.probes.writeRoundtrip.readBack).toBe(true);
    expect(body.probes.writeRoundtrip.cleaned).toBe(true);
  });

  test("analytics pipeline probe passes", async ({ request }) => {
    const res = await request.get("/api/health/deep");
    const body = await res.json();

    expect(body.probes.analyticsPipeline.status).toBe("pass");
    expect(body.probes.analyticsPipeline.eventPersisted).toBe(true);
  });

  test("deployment metadata is present", async ({ request }) => {
    const res = await request.get("/api/health/deep");
    const body = await res.json();

    expect(body.deployment.commitHash).toBeTruthy();
    expect(body.deployment.environment).toBeTruthy();
    expect(body.deployment.url).toMatch(/^https?:\/\//);
  });

  test("response time is under 5 seconds", async ({ request }) => {
    const res = await request.get("/api/health/deep");
    const body = await res.json();

    // Deep health runs 4 probes including write roundtrip — 5s is generous
    expect(body.responseTimeMs).toBeLessThan(5000);
  });

  test("canary run metadata is complete", async ({ request }) => {
    const res = await request.get("/api/health/deep");
    const body = await res.json();

    expect(body.canary.runId).toMatch(/^canary-/);
    expect(body.canary.probeCount).toBe(4);
    expect(body.canary.passCount + body.canary.failCount + body.canary.skipCount)
      .toBe(body.canary.probeCount);
  });

  test("no-cache headers prevent stale results", async ({ request }) => {
    const res = await request.get("/api/health/deep");
    const cacheControl = res.headers()["cache-control"];
    expect(cacheControl).toContain("no-store");
    expect(cacheControl).toContain("no-cache");
  });
});
