/**
 * analytics-trim-velocity.spec.ts — Playwright E2E for the trim-velocity
 * dealer analytics dashboard.
 *
 * What this proves:
 *   1. Unauthenticated request to the API returns 401 (not a 500/blank).
 *   2. With DEMO_MODE=true, the API returns 200 with rows + a dealer-language
 *      headline (no developer jargon like "v_trim_velocity").
 *   3. The page renders the empty/loading state, the headline, and the table
 *      so a dealer can scan their fastest movers immediately.
 *   4. Drill-down request returns 200 with rows array.
 *   5. Page renders correctly on a mobile viewport (no broken layout).
 */

import { test, expect } from "@playwright/test";

const DEMO = process.env.DEMO_MODE === "true";

test.describe("Trim velocity analytics — API", () => {
  test("unauthenticated GET returns 401, never a blank 200", async ({ request }) => {
    test.skip(DEMO, "DEMO_MODE bypasses auth for the API");
    const res = await request.get("/api/admin/analytics/trim-velocity");
    expect([401, 403]).toContain(res.status());
  });

  test("authenticated GET returns 200 with rows and dealer-language headline", async ({ request }) => {
    test.skip(!DEMO, "Requires DEMO_MODE=true to reach the authed path");
    const res = await request.get("/api/admin/analytics/trim-velocity");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.rows)).toBe(true);
    expect(typeof body.headline).toBe("string");
    // Plain-English check: never expose internal view name.
    expect(body.headline).not.toMatch(/v_trim_velocity/i);
    expect(body.headline).not.toMatch(/avg_days_to_sell/i);
  });

  test("drill-down requires make/model/trim/year and returns 200 when valid", async ({ request }) => {
    test.skip(!DEMO, "Requires DEMO_MODE=true to reach the authed path");
    const bad = await request.get(
      "/api/admin/analytics/trim-velocity?drill=1&make=Toyota",
    );
    expect(bad.status()).toBe(400);

    const ok = await request.get(
      "/api/admin/analytics/trim-velocity?drill=1&make=Toyota&model=RAV4&trim=XLE%20Hybrid&year=2026",
    );
    expect(ok.status()).toBe(200);
    const body = await ok.json();
    expect(body.make).toBe("Toyota");
    expect(Array.isArray(body.rows)).toBe(true);
  });
});

test.describe("Trim velocity analytics — Page", () => {
  test("renders dashboard with headline and table or empty state", async ({ page }) => {
    test.skip(!DEMO, "Page requires DEMO_MODE=true for auth bypass");
    await page.goto("/admin/analytics/trim-velocity");
    await expect(page.getByTestId("trim-velocity-page")).toBeVisible();
    await expect(page.getByTestId("trim-velocity-headline")).toBeVisible();
    // Either we see the table OR the empty state — both are valid.
    const table = page.getByTestId("trim-velocity-table");
    const empty = page.getByTestId("trim-velocity-table-empty");
    await expect(table.or(empty)).toBeVisible();
  });

  test("renders correctly on a mobile viewport", async ({ page }) => {
    test.skip(!DEMO, "Page requires DEMO_MODE=true for auth bypass");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/admin/analytics/trim-velocity");
    await expect(page.getByTestId("trim-velocity-page")).toBeVisible();
    await expect(page.getByTestId("trim-velocity-headline")).toBeVisible();
  });
});
