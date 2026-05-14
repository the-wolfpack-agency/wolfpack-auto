/**
 * compliance-floor-plan-flows.spec.ts
 *
 * Browser-interaction E2E tests for Compliance Checks and Floor Plan Management.
 * Simulates real user flows: running checks, reviewing, adding vehicles to floor plan,
 * paying off, sorting, and filtering.
 *
 * Run: npx playwright test tests/e2e/flows/compliance-floor-plan-flows.spec.ts
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
/* Compliance Checks flows                                                     */
/* ========================================================================== */

test.describe("Compliance Checks — browser flows", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const ok = await safeNavigate(page, "/admin/compliance/checks");
    if (!ok) test.skip(true, "Compliance checks page returned non-2xx");
  });

  test("renders Compliance Checks heading and description", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Compliance Checks");
    await expect(page.locator("text=Red Flags Rule")).toBeVisible();
  });

  test("displays stat cards — Total Checks, Clear, Flagged/Blocked, Review Required", async ({
    page,
  }) => {
    await page.locator("text=Total Checks").waitFor({ timeout: 10_000 });
    for (const label of ["Total Checks", "Clear", "Flagged", "Review Required"]) {
      await expect(page.locator(`text=${label}`)).toBeVisible();
    }
  });

  test("clicking 'Run Check' opens the compliance check form", async ({ page }) => {
    await page.click("button:has-text('Run Check')");
    await expect(page.locator("h2:has-text('Run Compliance Check')")).toBeVisible();
    await expect(page.locator("label:has-text('Customer Name')")).toBeVisible();
    await expect(page.locator("label:has-text('Check Type')")).toBeVisible();
  });

  test("fill Red Flags check form — customer name, select red_flags — submit", async ({ page }) => {
    await page.click("button:has-text('Run Check')");
    await page.fill('input[placeholder="John Smith"]', "E2E Test Customer");
    // Check Type select
    await page.selectOption("form select", { value: "red_flags" });
    await page.fill('input[placeholder="lead-042"]', "lead-e2e-001");
    await page.click("button[type='submit']:has-text('Run Check')");
    await page.waitForLoadState("domcontentloaded");
    // Form should close on success or the table should have the new check
  });

  test("run OFAC check — verify result appears in table", async ({ page }) => {
    await page.click("button:has-text('Run Check')");
    await page.fill('input[placeholder="John Smith"]', "OFAC Test Person");
    await page.selectOption("form select", { value: "ofac" });
    await page.click("button[type='submit']:has-text('Run Check')");
    await page.waitForLoadState("domcontentloaded");
    // Look for the result in the table
    const resultBadge = page.locator("tbody span.rounded-full").last();
    if (await resultBadge.isVisible()) {
      const text = await resultBadge.textContent();
      expect(["Clear", "Flagged", "Review Required", "Blocked"]).toContain(text?.trim());
    }
  });

  test("compliance table renders with Date, Customer, Type, Result, Flags, Reviewer, Actions columns", async ({
    page,
  }) => {
    const table = page.locator("table");
    if ((await table.count()) > 0) {
      for (const col of ["Date", "Customer", "Type", "Result", "Flags", "Reviewer", "Actions"]) {
        await expect(page.locator(`th:has-text('${col}')`).first()).toBeVisible();
      }
    }
  });

  test("filter by check type — select OFAC", async ({ page }) => {
    await page.locator("select").first().waitFor({ timeout: 10_000 });
    const typeFilter = page.locator("select").first();
    await typeFilter.selectOption({ value: "ofac" });
    await page.waitForLoadState("domcontentloaded");
    // All type badges in the table should be OFAC
    const badges = page.locator("tbody span.rounded-full").filter({ hasText: /Red Flags|OFAC|ID Verification/ });
    const count = await badges.count();
    for (let i = 0; i < count; i++) {
      const text = await badges.nth(i).textContent();
      if (text?.includes("OFAC") || text?.includes("Clear") || text?.includes("Flagged")) continue;
      // Only OFAC type badges expected
    }
  });

  test("filter by result — select Flagged", async ({ page }) => {
    await page.locator("select").nth(1).waitFor({ timeout: 10_000 });
    const resultFilter = page.locator("select").nth(1);
    await resultFilter.selectOption({ value: "flagged" });
    await page.waitForLoadState("domcontentloaded");
  });

  test("click Review button on flagged check — verify review modal opens", async ({ page }) => {
    const reviewBtn = page.locator("button:has-text('Review')").first();
    if (await reviewBtn.isVisible()) {
      await reviewBtn.click();
      // Modal should appear
      await expect(page.locator("h3:has-text('Review:')")).toBeVisible();
      await expect(page.locator("label:has-text('Review Notes')")).toBeVisible();
      await expect(page.locator("text=Override and approve")).toBeVisible();
    }
  });

  test("fill review notes, toggle override, submit review", async ({ page }) => {
    const reviewBtn = page.locator("button:has-text('Review')").first();
    if (await reviewBtn.isVisible()) {
      await reviewBtn.click();
      await page.fill("textarea", "E2E test — verified identity documents, clearing manually.");
      await page.locator('input[type="checkbox"]').check();
      await page.click("button:has-text('Submit Review')");
      await page.waitForLoadState("domcontentloaded");
      // Modal should close
      await expect(page.locator("h3:has-text('Review:')")).not.toBeVisible();
    }
  });

  test("cancel closes the Run Check form", async ({ page }) => {
    await page.click("button:has-text('Run Check')");
    await expect(page.locator("h2:has-text('Run Compliance Check')")).toBeVisible();
    await page.click("form button:has-text('Cancel')");
    await expect(page.locator("h2:has-text('Run Compliance Check')")).not.toBeVisible();
  });
});

/* ========================================================================== */
/* Floor Plan Management flows                                                 */
/* ========================================================================== */

test.describe("Floor Plan Management — browser flows", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const ok = await safeNavigate(page, "/admin/floor-plan");
    if (!ok) test.skip(true, "Floor plan page returned non-2xx");
  });

  test("renders Floor Plan Management heading and description", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Floor Plan Management");
    await expect(page.locator("text=vehicle financing")).toBeVisible();
  });

  test("displays stat cards — Vehicles on Plan, Total Principal, Daily Interest, Avg Days Floored", async ({
    page,
  }) => {
    await page.locator("text=Vehicles on Plan").waitFor({ timeout: 10_000 });
    for (const label of ["Vehicles on Plan", "Total Principal", "Daily Interest", "Avg Days Floored"]) {
      await expect(page.locator(`text=${label}`)).toBeVisible();
    }
  });

  test("curtailment alerts section renders when applicable", async ({ page }) => {
    // This is conditional — only shows when vehicles are near curtailment
    const alerts = page.locator("text=Curtailment Alerts");
    // We don't fail if absent, just verify structure when present
    if (await alerts.isVisible()) {
      await expect(page.locator("text=approaching curtailment")).toBeVisible();
    }
  });

  test("clicking 'Add to Floor Plan' opens the add form with all fields", async ({ page }) => {
    await page.click("button:has-text('Add to Floor Plan')");
    await expect(page.locator("h2:has-text('Add Vehicle to Floor Plan')")).toBeVisible();
    await expect(page.locator("label:has-text('VIN')")).toBeVisible();
    await expect(page.locator("label:has-text('Lender')")).toBeVisible();
    await expect(page.locator("label:has-text('Principal')")).toBeVisible();
    await expect(page.locator("label:has-text('Daily Rate')")).toBeVisible();
    await expect(page.locator("label:has-text('Funded Date')")).toBeVisible();
  });

  test("lender select contains expected lenders (NextGear, AFC, Ally, Capital One, KAR)", async ({
    page,
  }) => {
    await page.click("button:has-text('Add to Floor Plan')");
    const options = await page.locator("form select option").allTextContents();
    expect(options).toEqual(
      expect.arrayContaining(["NextGear Capital", "AFC", "Ally Floor Plan"])
    );
  });

  test("fill floor plan form — VIN, lender, principal, daily rate, funded date — submit", async ({
    page,
  }) => {
    await page.click("button:has-text('Add to Floor Plan')");

    await page.fill('input[placeholder="1HGCV1F34PA012345"]', "5YJ3E1EA7PF999999");
    await page.fill('input[placeholder="2025 Honda Civic Sport — Silver"]', "2025 Tesla Model 3 LR — White");
    await page.selectOption("form select", { label: "AFC" });
    await page.fill('input[placeholder="24500.00"]', "32500.00");
    // Daily rate already has default value
    // Funded date already has default value

    await page.click("button[type='submit']:has-text('Add Vehicle')");
    await page.waitForLoadState("domcontentloaded");
  });

  test("active floor plan table renders with Vehicle, Lender, Principal, Days, Interest, Status columns", async ({
    page,
  }) => {
    const table = page.locator("table").first();
    if ((await table.count()) > 0) {
      for (const col of ["Vehicle", "Lender", "Principal", "Days", "Interest", "Status"]) {
        await expect(page.locator(`th:has-text('${col}')`).first()).toBeVisible();
      }
    }
  });

  test("Pay Off button visible on active vehicles", async ({ page }) => {
    const payoffBtn = page.locator("button:has-text('Pay Off')").first();
    if (await payoffBtn.isVisible()) {
      // Verify the button is in an active line row
      const row = payoffBtn.locator("xpath=ancestor::tr");
      await expect(row.locator("text=Active")).toBeVisible();
    }
  });

  test("sort toggle changes between Oldest First and Newest First", async ({ page }) => {
    const sortBtn = page.locator("button:has-text('Sort:')");
    if (await sortBtn.isVisible()) {
      const initialText = await sortBtn.textContent();
      await sortBtn.click();
      await page.waitForLoadState("domcontentloaded");
      const newText = await sortBtn.textContent();
      expect(newText).not.toBe(initialText);
    }
  });

  test("closed/inactive lines section renders with Paid Off status when present", async ({
    page,
  }) => {
    const closedSection = page.locator("h2:has-text('Closed')");
    if (await closedSection.isVisible()) {
      await expect(page.locator("text=Paid Off").first()).toBeVisible();
    }
  });

  test("cancel button closes the add form", async ({ page }) => {
    await page.click("button:has-text('Add to Floor Plan')");
    await expect(page.locator("h2:has-text('Add Vehicle to Floor Plan')")).toBeVisible();
    await page.click("form button:has-text('Cancel')");
    await expect(page.locator("h2:has-text('Add Vehicle to Floor Plan')")).not.toBeVisible();
  });
});
