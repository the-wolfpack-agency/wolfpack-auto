/**
 * Unit tests for lighthouse-runner — focused on graceful fallback when
 * Lighthouse isn't installed and on the test-runner override path.
 */

import { runLighthouse } from "@/lib/website-audit/lighthouse-runner";

describe("runLighthouse", () => {
  test("returns unavailable when lighthouse module is not installed", async () => {
    const r = await runLighthouse("https://example.com");
    if (!r.available) {
      expect(r.reason).toBe("lighthouse_not_installed");
      expect(r.fetched_at).toMatch(/T/);
    } else {
      // If by chance lighthouse is installed on this machine, accept the shape.
      expect(typeof r.performance_score).toBe("number");
    }
  });

  test("uses the test runner override when provided", async () => {
    const r = await runLighthouse("https://example.com", {
      __testRunner: async () => ({
        available: true,
        performance_score: 88,
        accessibility_score: 90,
        seo_score: 91,
        best_practices_score: 80,
        lcp_seconds: 1.9,
        cls: 0.05,
        tbt_ms: 100,
        fcp_seconds: 1.1,
        fetched_at: new Date().toISOString(),
      }),
    });
    expect(r.available).toBe(true);
    if (r.available) {
      expect(r.performance_score).toBe(88);
    }
  });

  test("test runner errors fall back to invocation_failed", async () => {
    const r = await runLighthouse("https://example.com", {
      __testRunner: async () => {
        throw new Error("boom");
      },
    });
    expect(r.available).toBe(false);
    if (!r.available) {
      expect(r.reason).toBe("lighthouse_invocation_failed");
    }
  });
});
