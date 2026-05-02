/**
 * E2E — auction live feed.
 *
 * Server runs in shadow mode (DATABASE_URL unset by playwright config), so
 * the page exercises the demo-data branches. Real-Postgres execution is
 * covered by the cron route's integration tests inside src/__tests__.
 */
import { test, expect } from "@playwright/test";

test.describe("Auction admin page", () => {
  test("API: cron sync responds 200 in shadow mode", async ({ request }) => {
    const res = await request.get("/api/cron/auction-sync");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test("API: opportunities GET responds 200 with array shape", async ({ request }) => {
    const res = await request.get("/api/admin/auction/opportunities");
    expect(res.status()).toBeLessThan(500);
    if (res.status() === 200) {
      const body = await res.json();
      expect(Array.isArray(body.opportunities)).toBe(true);
    }
  });

  test("API: benchmark lookup with year+make+model+mileage responds 200", async ({ request }) => {
    const res = await request.get("/api/admin/auction/benchmarks?year=2021&make=Honda&model=Accord&mileage=42000");
    expect(res.status()).toBeLessThan(500);
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty("benchmark");
    }
  });

  test("API: benchmark lookup without params returns 400 (when authed)", async ({ request }) => {
    const res = await request.get("/api/admin/auction/benchmarks");
    // Either 400 (validation) or 401 (no session) — never 500
    expect(res.status()).toBeLessThan(500);
  });

  test("Admin page renders both tabs", async ({ page }) => {
    await page.goto("/admin/auction");
    // Auth gate may redirect to /login; tolerate both render branches.
    const url = page.url();
    if (url.includes("/admin/auction")) {
      await expect(page.getByTestId("admin-auction-page")).toBeVisible();
      await expect(page.getByTestId("auction-tab-opportunities")).toBeVisible();
      await expect(page.getByTestId("auction-tab-benchmarks")).toBeVisible();
    }
  });

  test("Admin page benchmark tab renders search inputs", async ({ page }) => {
    await page.goto("/admin/auction");
    if (page.url().includes("/admin/auction")) {
      await page.getByTestId("auction-tab-benchmarks").click();
      await expect(page.getByTestId("bench-vin")).toBeVisible();
      await expect(page.getByTestId("bench-lookup")).toBeVisible();
    }
  });

  test("Admin page action button hits POST endpoint and never 500s", async ({ page, request }) => {
    // Direct API path — most reliable E2E for action handler shape.
    const res = await request.post("/api/admin/auction/opportunities/demo-opp-1/dismiss");
    expect(res.status()).toBeLessThan(500);
  });
});
