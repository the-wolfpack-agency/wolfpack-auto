/**
 * Load Test Runner — k6 Orchestrator with Fallback
 *
 * If k6 is installed, runs the k6 smoke and inventory scripts and validates
 * the output. If k6 is not available, falls back to built-in concurrent
 * request testing using Playwright's HTTP client.
 *
 * This test lives in tests/load/ and is excluded from the default Playwright
 * run (testIgnore includes **/load/**). It must be invoked explicitly:
 *
 *   npx playwright test tests/load/load-test-runner.spec.ts
 */

import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isK6Available(): boolean {
  try {
    execSync("k6 version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function runK6Script(
  scriptName: string,
  baseUrl: string,
  timeoutMs = 120_000,
): { stdout: string; success: boolean } {
  const scriptPath = path.resolve(__dirname, scriptName);
  if (!fs.existsSync(scriptPath)) {
    return { stdout: `Script not found: ${scriptPath}`, success: false };
  }

  try {
    const stdout = execSync(
      `k6 run --env BASE_URL=${baseUrl} --duration 15s --vus 2 "${scriptPath}"`,
      { timeout: timeoutMs, stdio: "pipe" },
    ).toString();
    return { stdout, success: true };
  } catch (err: unknown) {
    const output =
      err instanceof Error && "stdout" in err
        ? String((err as { stdout: Buffer }).stdout)
        : String(err);
    return { stdout: output, success: false };
  }
}

// ---------------------------------------------------------------------------
// Concurrent request fallback (used when k6 is not installed)
// ---------------------------------------------------------------------------

interface ConcurrentResult {
  path: string;
  total: number;
  errors: number;
  avgMs: number;
  maxMs: number;
}

async function concurrentBurst(
  request: import("@playwright/test").APIRequestContext,
  targetPath: string,
  count: number,
): Promise<ConcurrentResult> {
  const starts: number[] = [];
  const durations: number[] = [];
  let errors = 0;

  const promises = Array.from({ length: count }, async () => {
    const start = performance.now();
    starts.push(start);
    try {
      const resp = await request.get(targetPath);
      durations.push(performance.now() - start);
      if (resp.status() >= 500) errors++;
    } catch {
      durations.push(performance.now() - start);
      errors++;
    }
  });

  await Promise.all(promises);

  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const max = Math.max(...durations);

  return { path: targetPath, total: count, errors, avgMs: avg, maxMs: max };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const HAS_K6 = isK6Available();
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

test.describe("Load Test Runner", () => {
  test.describe.configure({ timeout: 180_000 });

  if (HAS_K6) {
    // ----- k6 path -----

    test("k6 smoke test", () => {
      const { stdout, success } = runK6Script("k6-smoke.js", BASE_URL);
      console.log(stdout);
      // k6 exits 0 when all thresholds pass
      expect(success, "k6-smoke thresholds failed").toBeTruthy();
    });

    test("k6 inventory search", () => {
      const { stdout, success } = runK6Script(
        "k6-inventory-search.js",
        BASE_URL,
      );
      console.log(stdout);
      expect(success, "k6-inventory-search thresholds failed").toBeTruthy();
    });

    test("k6 leads load", () => {
      const { stdout, success } = runK6Script("k6-leads.js", BASE_URL);
      console.log(stdout);
      expect(success, "k6-leads thresholds failed").toBeTruthy();
    });
  } else {
    // ----- Fallback: built-in concurrent testing -----

    test("fallback: concurrent inventory requests (20)", async ({
      request,
    }) => {
      const result = await concurrentBurst(request, "/api/inventory", 20);
      console.log(
        `Inventory burst: ${result.total} requests, ${result.errors} errors, avg=${result.avgMs.toFixed(0)}ms, max=${result.maxMs.toFixed(0)}ms`,
      );
      expect(result.errors, "Inventory: 500 errors under load").toBe(0);
      expect(result.maxMs, "Inventory: slowest request > 5s").toBeLessThan(
        5000,
      );
    });

    test("fallback: concurrent leads requests (20)", async ({ request }) => {
      const result = await concurrentBurst(request, "/api/admin/leads", 20);
      console.log(
        `Leads burst: ${result.total} requests, ${result.errors} errors, avg=${result.avgMs.toFixed(0)}ms, max=${result.maxMs.toFixed(0)}ms`,
      );
      expect(result.errors, "Leads: 500 errors under load").toBe(0);
      expect(result.maxMs, "Leads: slowest request > 5s").toBeLessThan(5000);
    });

    test("fallback: concurrent analytics requests (20)", async ({
      request,
    }) => {
      const result = await concurrentBurst(
        request,
        "/api/admin/analytics/dashboard",
        20,
      );
      console.log(
        `Analytics burst: ${result.total} requests, ${result.errors} errors, avg=${result.avgMs.toFixed(0)}ms, max=${result.maxMs.toFixed(0)}ms`,
      );
      expect(result.errors, "Analytics: 500 errors under load").toBe(0);
      expect(result.maxMs, "Analytics: slowest request > 5s").toBeLessThan(
        5000,
      );
    });

    test("fallback: concurrent health requests (50)", async ({ request }) => {
      const result = await concurrentBurst(request, "/api/health", 50);
      console.log(
        `Health burst: ${result.total} requests, ${result.errors} errors, avg=${result.avgMs.toFixed(0)}ms, max=${result.maxMs.toFixed(0)}ms`,
      );
      expect(result.errors, "Health: 500 errors under load").toBe(0);
      expect(result.maxMs, "Health: slowest request > 3s").toBeLessThan(3000);
    });

    test("fallback: mixed concurrent load (30 requests across endpoints)", async ({
      request,
    }) => {
      const endpoints = [
        "/api/inventory",
        "/api/admin/leads",
        "/api/admin/deals",
        "/api/admin/stats",
        "/api/health",
        "/api/admin/analytics/dashboard",
      ];

      const promises = Array.from({ length: 30 }, (_, i) => {
        const ep = endpoints[i % endpoints.length];
        return request
          .get(ep)
          .then((r) => ({ path: ep, status: r.status() }));
      });

      const results = await Promise.all(promises);
      const failures = results.filter((r) => r.status >= 500);

      expect(
        failures.length,
        `${failures.length}/30 mixed requests returned 500: ${JSON.stringify(failures)}`,
      ).toBe(0);
    });
  }
});
