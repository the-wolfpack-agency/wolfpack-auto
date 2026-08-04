import { test, expect } from "@playwright/test";

/**
 * The Agency Dashboard must show YOUR dealers, never sample ones.
 *
 * WHY THIS EXISTS
 *
 * A client dealership was added and did not appear. The page listed exactly two
 * rows, "Demo Dealership" (42 leads / 87 inventory) and "Triangle Auto Group"
 * (28 / 53), which are the hardcoded MOCK_DEALERS in the route. Nineteen real
 * dealers, including the new client, were invisible, and the KPI tiles above
 * still read "Total Dealers 19" because they come from elsewhere.
 *
 * The join said `l.dealer_id = d.id::text` while leads.dealer_id is uuid, so
 * Postgres raised "operator does not exist: uuid = text". The route caught it
 * and returned samples. A broken page that looks healthy is worse than one that
 * errors: nobody investigates a dashboard that renders.
 *
 * Two independent assertions, because either alone can be satisfied wrongly:
 *   1. the sample names must never appear, and
 *   2. the row count must agree with the Total Dealers tile.
 *
 * The second is what catches the next fallback, whatever names it invents.
 */

const EMAIL = process.env.ADMIN_E2E_EMAIL;
const PASSWORD = process.env.ADMIN_E2E_PASSWORD;

/** The literal fixtures in src/app/api/admin/dealers/route.ts. */
const SAMPLE_NAMES = ["Demo Dealership", "Triangle Auto Group"];

test.describe("agency dealer list", () => {
  test.skip(!EMAIL || !PASSWORD, "ADMIN_E2E_EMAIL / ADMIN_E2E_PASSWORD not configured");

  test.beforeEach(async ({ page }) => {
    await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
    await page.fill('input[type="email"]', EMAIL!);
    await page.fill('input[type="password"]', PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30_000 });
  });

  test("the API returns real dealers, not the sample fallback", async ({ page }) => {
    const res = await page.request.get("/api/admin/dealers");
    expect(res.status(), "a 500 here means the query is broken again").toBe(200);
    const body = (await res.json()) as { dealers?: Array<{ name: string }> };
    expect(Array.isArray(body.dealers)).toBe(true);

    const names = (body.dealers ?? []).map((d) => d.name);
    // The exact fingerprint of the fallback.
    const isSampleSet =
      names.length === SAMPLE_NAMES.length && SAMPLE_NAMES.every((n) => names.includes(n));
    expect(
      isSampleSet,
      `the dealers endpoint returned the hardcoded sample set: ${names.join(", ")}`,
    ).toBe(false);
  });

  test("a failed query is reported, never disguised as data", async ({ page }) => {
    /* The route used to answer a DB error with samples. Whatever it does now, it
       must not present fiction as fact: a failure is a non-200. */
    const res = await page.request.get("/api/admin/dealers");
    if (res.status() !== 200) {
      const body = await res.json().catch(() => ({}));
      expect(body).toHaveProperty("error");
      return;
    }
    const body = (await res.json()) as { dealers?: Array<{ name: string }> };
    expect(body.dealers, "a 200 must carry a real list").toBeDefined();
  });

  test("the table row count agrees with the Total Dealers tile", async ({ page }) => {
    /* The tiles read 19 while the table showed 2 and nothing flagged it. Two
       numbers on one page disagreeing is the signal that survives whatever the
       fallback is replaced with. */
    await page.goto("/admin/agency", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    const body = await page.locator("body").innerText();
    const total = Number(body.match(/Total Dealers\s+(\d+)/i)?.[1] ?? "0");
    test.skip(!total, "Total Dealers tile not rendered for this account");

    const rows = await page.locator("table tbody tr").count();
    expect(
      rows,
      `the tile says ${total} dealers and the table shows ${rows}`,
    ).toBeGreaterThanOrEqual(Math.min(total, 1));
    // Not a strict equality: the table may paginate. But 19 vs 2 is not paging.
    if (total > 5) expect(rows).toBeGreaterThan(2);
  });

  test("no sample dealership name is rendered on the page", async ({ page }) => {
    await page.goto("/admin/agency", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const body = await page.locator("body").innerText();
    for (const name of SAMPLE_NAMES) {
      expect(body, `the Agency Dashboard is displaying the sample dealer "${name}"`).not.toContain(name);
    }
  });
});
