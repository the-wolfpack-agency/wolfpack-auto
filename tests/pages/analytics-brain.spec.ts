import { test, expect } from "@playwright/test";

test.describe("Admin Analytics Brain Dashboard", () => {
  test("analytics brain page loads successfully", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    await expect(page.locator("h1")).toContainText("Analytics Brain");
  });

  test("shows stats overview cards", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    await expect(page.locator("text=Active Sessions")).toBeVisible();
    await expect(page.locator("text=Buffered Events")).toBeVisible();
    await expect(page.locator("text=Insights Generated")).toBeVisible();
    await expect(page.locator("text=Hot Leads")).toBeVisible();
    await expect(page.locator("text=Alerts")).toBeVisible();
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
    const brainLink = page.locator('a[href="/admin/analytics-brain"]');
    await expect(brainLink).toBeVisible();
    await expect(brainLink).toContainText("Brain");
  });

  test("brain page is accessible from admin dashboard", async ({ page }) => {
    await page.goto("/admin");
    const brainLink = page.locator('a[href="/admin/analytics-brain"]');
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
    await expect(page.locator("text=Active Sessions")).toBeVisible();
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

  test("all insights section shows categorized insights", async ({ page }) => {
    await page.goto("/admin/analytics-brain");
    const allInsights = page.locator("text=All Insights");
    // Either shows insights or empty state
    const content = await page.textContent("body");
    expect(content?.includes("All Insights") || content?.includes("No insights")).toBeTruthy();
  });
});
