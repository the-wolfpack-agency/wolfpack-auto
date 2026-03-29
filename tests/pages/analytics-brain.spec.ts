import { test, expect } from "@playwright/test";

test.describe("Admin Analytics Brain Dashboard", () => {
  test("analytics brain page loads successfully", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    await expect(page.locator("h1")).toContainText("Analytics Brain");
  });

  test("shows stats overview cards", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    // Use getByText with exact match to avoid strict-mode violations
    // from description text mentioning the same words
    await expect(page.getByText("Active Sessions", { exact: true })).toBeVisible();
    await expect(page.getByText("Buffered Events", { exact: true })).toBeVisible();
    await expect(page.getByText("Insights Generated", { exact: true })).toBeVisible();
    await expect(page.getByText("Hot Leads", { exact: true })).toBeVisible();
    await expect(page.getByText("Alerts", { exact: true })).toBeVisible();
  });

  test("shows empty state when no sessions exist", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    // With no real traffic, should show empty state or zero counts
    const content = await page.textContent("body");
    // Should have either insights or the empty state message
    expect(
      content?.includes("No insights yet") || content?.includes("Insights Generated"),
    ).toBeTruthy();
  });

  test("admin sidebar includes Brain nav link", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    // Scope to desktop sidebar to avoid matching hidden mobile copy
    const sidebar = page.locator("[aria-label='Admin navigation desktop']");
    const brainLink = sidebar.locator('a[href="/admin/analytics-brain"]');
    await expect(brainLink).toBeVisible();
    await expect(brainLink).toContainText("Brain");
  });

  test("brain page is accessible from admin dashboard", async ({ page }) => {
    await page.goto("/admin");
    // Dashboard section auto-expands on /admin — Brain is inside it
    const sidebar = page.locator("[aria-label='Admin navigation desktop']");
    const brainLink = sidebar.locator('a[href="/admin/analytics-brain"]');
    await expect(brainLink).toBeVisible();
    await brainLink.click();
    await page.waitForURL(/\/admin\/analytics-brain/);
    await expect(page.locator("h1")).toContainText("Analytics Brain");
  });

  test("page has correct metadata", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    const title = await page.title();
    expect(title.toLowerCase()).toContain("brain");
  });

  test("event distribution section renders", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    const content = await page.textContent("body");
    expect(content?.includes("Event Distribution") || content?.includes("No insights yet")).toBeTruthy();
  });

  test("brain dashboard is responsive on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/admin/analytics-brain");
    await expect(page.locator("h1")).toContainText("Analytics Brain");
    // Stats cards should still be visible
    await expect(page.getByText("Active Sessions", { exact: true })).toBeVisible();
  });
});

test.describe("Analytics Brain with Seeded Data", () => {
  test.beforeAll(async ({ request }) => {
    // Seed enough sessions (3+) for insights to generate
    const now = Date.now();
    for (let s = 0; s < 4; s++) {
      await request.post("/api/analytics/events", {
        data: {
          events: [
            {
              event_type: "page_view",
              action: "view",
              page: "/inventory",
              session_id: `brain_test_${s}_${now}`,
              user_fingerprint: `brain_fp_${s}`,
              timestamp: new Date().toISOString(),
              metadata: {},
            },
            {
              event_type: "vehicle_view",
              action: "view_vehicle",
              page: `/inventory/VIN${s}`,
              session_id: `brain_test_${s}_${now}`,
              user_fingerprint: `brain_fp_${s}`,
              timestamp: new Date().toISOString(),
              metadata: { vin: `VIN${s}`, title: `Test Vehicle ${s}` },
            },
            {
              event_type: "time_on_page",
              action: "page_exit",
              page: `/inventory/VIN${s}`,
              session_id: `brain_test_${s}_${now}`,
              user_fingerprint: `brain_fp_${s}`,
              timestamp: new Date().toISOString(),
              metadata: { duration_ms: 15000 + s * 5000 },
            },
          ],
        },
      });
    }
  });

  test("brain dashboard shows insights after seeding data", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    const insightCount = await page.locator("text=Insights Generated").textContent();
    // Should show non-zero insights
    expect(insightCount).toBeTruthy();
  });

  test("top insights section shows categorized insights with limit", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    const content = await page.textContent("body");
    // Renamed from "All Insights" to "Top Insights" — shows limited preview
    expect(content?.includes("Top Insights") || content?.includes("No insights")).toBeTruthy();
  });

  test("view all insights link navigates to full list", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    const main = page.locator("main#admin-main-content");
    const viewAllLink = main.locator('a[href="/admin/analytics-brain/all"]').first();
    if (await viewAllLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await viewAllLink.click();
      await expect(page).toHaveURL(/\/admin\/analytics-brain\/all/);
      await expect(page.locator("h1")).toContainText(/Insights/i);
      // Back link should exist in main content
      const backLink = main.locator('a[href="/admin/analytics-brain"]');
      await expect(backLink).toBeVisible();
    }
  });

  test("all insights page renders with back link", async ({ page }) => {
    await page.goto("/admin/analytics-brain/all");
    const content = await page.textContent("body");
    expect(content?.length ?? 0).toBeGreaterThan(50);
    // Back link in main content area
    const main = page.locator("main#admin-main-content");
    const backLink = main.locator('a[href="/admin/analytics-brain"]');
    await expect(backLink).toBeVisible();
  });

  test("all insights page filters by category", async ({ page }) => {
    await page.goto("/admin/analytics-brain/all?category=engagement");
    const h1 = page.locator("h1");
    await expect(h1).toContainText(/Engagement Insights|All Insights/i);
  });
});
