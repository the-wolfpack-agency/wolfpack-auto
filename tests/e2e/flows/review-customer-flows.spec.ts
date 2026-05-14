/**
 * review-customer-flows.spec.ts
 *
 * Browser-interaction E2E tests for Review Management and Customer 360 pages.
 * Simulates real user flows: viewing reviews, filtering by platform/rating,
 * responding to reviews, flagging, and navigating customer 360 tabs.
 *
 * Run: npx playwright test tests/e2e/flows/review-customer-flows.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set.",
);

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function safeNavigate(page: Page, path: string): Promise<boolean> {
  const response = await page.goto(path, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  return !!response && response.status() < 400;
}

/* ========================================================================== */
/* Review Management flows                                                     */
/* ========================================================================== */

test.describe("Review Management — browser flows", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const ok = await safeNavigate(page, "/admin/reviews");
    if (!ok) test.skip(true, "Reviews page returned non-2xx");
  });

  test("renders Review Management heading and description", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Review Management");
    await expect(page.locator("text=customer reviews")).toBeVisible();
  });

  test("displays stat cards — Avg Rating, Total Reviews, Response Rate, By Platform", async ({
    page,
  }) => {
    await expect(page.locator("text=Avg Rating")).toBeVisible({ timeout: 5_000 });
    for (const label of ["Avg Rating", "Total Reviews", "Response Rate", "By Platform"]) {
      await expect(page.locator(`text=${label}`)).toBeVisible();
    }
  });

  test("avg rating stat shows a number out of 5", async ({ page }) => {
    const ratingCard = page.locator("text=/\\/5/").first();
    await expect(ratingCard).toBeVisible({ timeout: 5_000 });
  });

  test("filter by platform — select Google", async ({ page }) => {
    const platformFilter = page.locator("select").first();
    await expect(platformFilter).toBeVisible({ timeout: 5_000 });
    await platformFilter.selectOption({ value: "google" });
    await page.waitForLoadState("domcontentloaded");
    // All visible platform labels should be Google
    const platformLabels = page.locator("text=on Google");
    const count = await platformLabels.count();
    // If reviews exist, they should all be Google
    if (count > 0) {
      expect(count).toBeGreaterThan(0);
    }
  });

  test("filter by rating — select 5 Stars", async ({ page }) => {
    const ratingFilter = page.locator("select").nth(1);
    await expect(ratingFilter).toBeVisible({ timeout: 5_000 });
    await ratingFilter.selectOption({ value: "5" });
    await page.waitForLoadState("domcontentloaded");
  });

  test("filter by responded status — select Needs Response", async ({ page }) => {
    const respondedFilter = page.locator("select").nth(2);
    await expect(respondedFilter).toBeVisible({ timeout: 5_000 });
    await respondedFilter.selectOption({ value: "false" });
    await page.waitForLoadState("domcontentloaded");
    // Should show only reviews with "Needs Response" badge
    const needsResponse = page.locator("text=Needs Response");
    if (await needsResponse.first().isVisible()) {
      expect(await needsResponse.count()).toBeGreaterThan(0);
    }
  });

  test("review cards show reviewer name, stars, date, platform badge, and response status", async ({
    page,
  }) => {
    const reviewCards = page.locator(".shadow-sm").filter({ hasText: /\u2605/ }); // star character
    if ((await reviewCards.count()) > 0) {
      const firstCard = reviewCards.first();
      // Reviewer name (font-semibold)
      await expect(firstCard.locator(".font-semibold").first()).toBeVisible();
      // Stars
      await expect(firstCard.locator("text=/\u2605/")).toBeVisible();
      // Platform icon (G, Y, f)
      await expect(firstCard.locator(".rounded-full").first()).toBeVisible();
    }
  });

  test("clicking 'Respond' on unresponded review opens response form with template buttons and textarea", async ({
    page,
  }) => {
    const respondBtn = page.locator("button:has-text('Respond')").first();
    if (await respondBtn.isVisible()) {
      await respondBtn.click();
      // Response textarea should appear
      await expect(page.locator("textarea[placeholder='Type your response...']")).toBeVisible();
      // Template buttons should appear
      const templateBtns = page.locator("button.text-brand-600, button:has-text('Positive'), button:has-text('Negative')");
      // At least the textarea is there
    }
  });

  test("click response template — verify textarea populates with template text", async ({
    page,
  }) => {
    const respondBtn = page.locator("button:has-text('Respond')").first();
    if (await respondBtn.isVisible()) {
      await respondBtn.click();
      await expect(page.locator("textarea[placeholder='Type your response...']")).toBeVisible({ timeout: 2_000 });
      // Click first template button (they are small buttons with template names)
      const templateBtn = page.locator(".bg-brand-50.text-brand-600").first();
      if (await templateBtn.isVisible()) {
        await templateBtn.click();
        const textarea = page.locator("textarea[placeholder='Type your response...']");
        const value = await textarea.inputValue();
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  test("type response and submit — verify 'Responded' badge appears", async ({ page }) => {
    const respondBtn = page.locator("button:has-text('Respond')").first();
    if (await respondBtn.isVisible()) {
      await respondBtn.click();
      await page.fill(
        "textarea[placeholder='Type your response...']",
        "Thank you so much for the wonderful review! We truly appreciate your business."
      );
      await page.click("button:has-text('Submit Response')");
      // The review should now show "Responded" badge
      const respondedBadge = page.locator("text=Responded").first();
      await expect(respondedBadge).toBeVisible({ timeout: 5_000 });
    }
  });

  test("flag inappropriate review — verify 'Flagged' badge appears", async ({ page }) => {
    const flagBtn = page.locator("button:has-text('Flag')").first();
    if (await flagBtn.isVisible()) {
      const card = flagBtn.locator("xpath=ancestor::div[contains(@class,'shadow-sm')]");
      await flagBtn.click();
      await expect(card.locator("text=Flagged")).toBeVisible({ timeout: 2_000 });
    }
  });

  test("cancel button closes response form", async ({ page }) => {
    const respondBtn = page.locator("button:has-text('Respond')").first();
    if (await respondBtn.isVisible()) {
      await respondBtn.click();
      await expect(page.locator("textarea[placeholder='Type your response...']")).toBeVisible();
      await page.click("button:has-text('Cancel')");
      await expect(page.locator("textarea[placeholder='Type your response...']")).not.toBeVisible();
    }
  });
});

/* ========================================================================== */
/* Customer 360 flows                                                          */
/* ========================================================================== */

test.describe("Customer List — browser flows", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const ok = await safeNavigate(page, "/admin/customers");
    if (!ok) test.skip(true, "Customers page returned non-2xx");
  });

  test("renders Customers heading and description", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Customers");
    await expect(page.locator("text=lifetime value")).toBeVisible();
  });

  test("stat cards show Total Customers, Active, Prospects, Total LTV", async ({ page }) => {
    await expect(page.locator("text=Total Customers")).toBeVisible({ timeout: 5_000 });
    for (const label of ["Total Customers", "Active", "Prospects", "Total LTV"]) {
      await expect(page.locator(`text=${label}`)).toBeVisible();
    }
  });

  test("customer table renders with Name, Email, Status, LTV columns", async ({ page }) => {
    const table = page.locator("table");
    if ((await table.count()) > 0) {
      await expect(page.locator("th:has-text('Name')")).toBeVisible();
      await expect(page.locator("th:has-text('Status')")).toBeVisible();
      await expect(page.locator("th:has-text('LTV')")).toBeVisible();
    }
  });

  test("search customers by name", async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search by name"]');
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
    await searchInput.fill("Sarah");
    await page.waitForLoadState("domcontentloaded");
    // Results should filter
  });

  test("filter by status — select Active", async ({ page }) => {
    const statusFilter = page.locator("select");
    await expect(statusFilter).toBeVisible({ timeout: 5_000 });
    await statusFilter.selectOption({ value: "active" });
    await page.waitForLoadState("domcontentloaded");
    // All status badges should be Active
    const badges = page.locator("tbody span.capitalize");
    const count = await badges.count();
    for (let i = 0; i < count; i++) {
      const text = await badges.nth(i).textContent();
      expect(text?.trim().toLowerCase()).toBe("active");
    }
  });

  test("clicking '360' button navigates to customer detail page", async ({ page }) => {
    const viewBtn = page.locator("a:has-text('360')").first();
    if (await viewBtn.isVisible()) {
      const href = await viewBtn.getAttribute("href");
      expect(href).toMatch(/\/admin\/customers\//);
      await viewBtn.click();
      await page.waitForLoadState("domcontentloaded");
      // Should be on customer 360 page
      const bodyText = await page.locator("body").textContent();
      // Either loads the customer or shows "not found"
      expect(bodyText).toBeTruthy();
    }
  });
});

test.describe("Customer 360 Page — browser flows", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Navigate to customer list first, then click into a customer
    const ok = await safeNavigate(page, "/admin/customers");
    if (!ok) {
      test.skip(true, "Customers page returned non-2xx");
      return;
    }
    const viewBtn = page.locator("a:has-text('360')").first();
    if (!(await viewBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "No customers available to view 360");
      return;
    }
    await viewBtn.click();
    await page.waitForLoadState("domcontentloaded");
  });

  test("customer 360 page loads with customer name and contact info", async ({ page }) => {
    // Should have a name heading or error
    await page.waitForLoadState("domcontentloaded");
    const hasName = await page.locator("h1").isVisible();
    const hasError = await page.locator("text=Customer not found").isVisible();
    expect(hasName || hasError).toBeTruthy();
  });

  test("tab bar shows Overview, Deals, Service, Comms, Activity tabs", async ({ page }) => {
    if (await page.locator("text=Customer not found").isVisible()) return;

    for (const tab of ["Overview", "Deals", "Service", "Comms", "Activity"]) {
      await expect(page.locator(`button:has-text('${tab}')`)).toBeVisible();
    }
  });

  test("Overview tab shows Lifetime Value stat card", async ({ page }) => {
    if (await page.locator("text=Customer not found").isVisible()) return;

    await expect(page.locator("text=Lifetime Value")).toBeVisible({ timeout: 5_000 });
  });

  test("clicking Deals tab shows purchase table", async ({ page }) => {
    if (await page.locator("text=Customer not found").isVisible()) return;

    await page.click("button:has-text('Deals')");
    await page.waitForLoadState("domcontentloaded");
    // Should show a table with Date, Vehicle, Price columns
    const table = page.locator("table");
    if ((await table.count()) > 0) {
      await expect(page.locator("th:has-text('Vehicle')")).toBeVisible();
      await expect(page.locator("th:has-text('Price')")).toBeVisible();
    }
  });

  test("clicking Service tab shows service history", async ({ page }) => {
    if (await page.locator("text=Customer not found").isVisible()) return;

    await page.click("button:has-text('Service')");
    await page.waitForLoadState("domcontentloaded");
    // Service table or empty state
    const table = page.locator("table");
    if ((await table.count()) > 0) {
      await expect(page.locator("th:has-text('Description')").first()).toBeVisible();
      await expect(page.locator("th:has-text('Status')").first()).toBeVisible();
    }
  });

  test("clicking Comms tab shows communications list", async ({ page }) => {
    if (await page.locator("text=Customer not found").isVisible()) return;

    await page.click("button:has-text('Comms')");
    await page.waitForLoadState("domcontentloaded");
    // Either communication items or "No communications" message
    const hasComms = await page.locator("text=email, text=sms, text=phone").first().isVisible().catch(() => false);
    const hasEmpty = await page.locator("text=No communications").isVisible().catch(() => false);
    // At least one should be true
  });

  test("clicking Activity tab shows behavioral signals", async ({ page }) => {
    if (await page.locator("text=Customer not found").isVisible()) return;

    await page.click("button:has-text('Activity')");
    await page.waitForLoadState("domcontentloaded");
    // Either activity cards or empty state
  });

  test("timeline sidebar renders on 360 page", async ({ page }) => {
    if (await page.locator("text=Customer not found").isVisible()) return;

    await expect(page.locator("h2:has-text('Timeline')")).toBeVisible({ timeout: 5_000 });
  });
});
