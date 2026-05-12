/**
 * analytics-lead-source-roi.spec.ts — Playwright E2E for the lead-source-ROI
 * dealer analytics dashboard.
 *
 * What this proves:
 *   1. Unauthenticated GET returns 401, never a 500/blank.
 *   2. Authenticated GET (DEMO_MODE) returns 200 with rows + headline.
 *   3. Cost-per-lead UI banner appears when no source has cost configured.
 *   4. Drill-down requires source; returns 200 when provided.
 *   5. Page renders on mobile + desktop with headline + table/empty state.
 *   6. Copy is plain English (no "v_lead_source_roi" jargon).
 */

import { test, expect } from "@playwright/test";

const DEMO = process.env.DEMO_MODE === "true";

test.describe("Lead source ROI analytics — API", () => {
  test("unauthenticated GET returns 401", async ({ request }) => {
    test.skip(DEMO, "DEMO_MODE bypasses auth for the API");
    const res = await request.get("/api/admin/analytics/lead-source-roi");
    expect([401, 403]).toContain(res.status());
  });

  test("authenticated GET returns 200 with rows + plain-English headline", async ({ request }) => {
    test.skip(!DEMO, "Requires DEMO_MODE=true to reach the authed path");
    const res = await request.get("/api/admin/analytics/lead-source-roi");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.rows)).toBe(true);
    expect(typeof body.headline).toBe("string");
    expect(body.headline).not.toMatch(/v_lead_source_roi/i);
    expect(body.headline).not.toMatch(/conversion_rate_pct/i);
    // No cost data exists yet — surface this honestly.
    expect(body.costNotConfigured).toBe(true);
  });

  test("drill requires source; returns 200 when present", async ({ request }) => {
    test.skip(!DEMO, "Requires DEMO_MODE=true");
    const bad = await request.get("/api/admin/analytics/lead-source-roi?drill=1");
    expect(bad.status()).toBe(400);

    const ok = await request.get(
      "/api/admin/analytics/lead-source-roi?drill=1&source=autotrader",
    );
    expect(ok.status()).toBe(200);
    const body = await ok.json();
    expect(body.source).toBe("autotrader");
    expect(Array.isArray(body.rows)).toBe(true);
  });
});

test.describe("Lead source ROI analytics — Page", () => {
  test("renders headline + table (or empty state) + cost banner", async ({ page }) => {
    test.skip(!DEMO, "Page requires DEMO_MODE=true for auth bypass");
    await page.goto("/admin/analytics/lead-source-roi");
    await expect(page.getByTestId("lead-source-roi-page")).toBeVisible();
    await expect(page.getByTestId("lead-source-roi-headline")).toBeVisible();
    await expect(page.getByTestId("lead-source-roi-cost-banner")).toBeVisible();
    const table = page.getByTestId("lead-source-roi-table");
    const empty = page.getByTestId("lead-source-roi-table-empty");
    await expect(table.or(empty)).toBeVisible();
  });

  test("renders on mobile viewport", async ({ page }) => {
    test.skip(!DEMO, "Page requires DEMO_MODE=true for auth bypass");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/admin/analytics/lead-source-roi");
    await expect(page.getByTestId("lead-source-roi-page")).toBeVisible();
    await expect(page.getByTestId("lead-source-roi-headline")).toBeVisible();
  });
});
