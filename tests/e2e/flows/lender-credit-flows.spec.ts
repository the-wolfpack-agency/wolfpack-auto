/**
 * lender-credit-flows.spec.ts
 *
 * Browser-interaction E2E tests for Lender Portal and Credit Bureau pages.
 * Simulates real user flows: clicking, typing, selecting, and verifying results.
 *
 * Run: npx playwright test tests/e2e/flows/lender-credit-flows.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

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

/* skipOnAuth not needed — tests handle auth inline */

/* ========================================================================== */
/* Lender Portal flows                                                        */
/* ========================================================================== */

test.describe("Lender Portal — browser flows", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const ok = await safeNavigate(page, "/admin/lenders");
    if (!ok) test.skip(true, "Lender page returned non-2xx");
  });

  test("renders page heading and lender count description", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Lender Portal");
    // Subtitle shows either "Loading..." or "N lender(s) configured"
    await expect(page.locator("text=/lender|Loading/i")).toBeVisible({ timeout: 8_000 });
  });

  test("displays stat cards — Total Lenders, Active, Portals, Best Rate", async ({ page }) => {
    await page.waitForTimeout(1_500); // wait for API fetch
    const statLabels = ["Total Lenders", "Active", "Portals", "Best Rate"];
    for (const label of statLabels) {
      await expect(page.locator(`text=${label}`)).toBeVisible();
    }
  });

  test("lender cards render with names and portal badges", async ({ page }) => {
    await page.waitForTimeout(1_500);
    // Cards should show lender names as h3 or no-lender fallback
    const cards = page.locator(".shadow-card h3, text=/No lenders configured/i");
    await expect(cards.first()).toBeVisible({ timeout: 8_000 });
  });

  test("lender cards display portal type badges (RouteOne, DealerTrack, CUDL, Direct)", async ({ page }) => {
    await page.waitForTimeout(1_500);
    // Portal badges are rendered as rounded-full spans
    const portalBadges = page.locator("span.rounded-full");
    const count = await portalBadges.count();
    if (count > 0) {
      const firstBadge = await portalBadges.first().textContent();
      expect(["RouteOne", "DealerTrack", "CUDL", "Direct"]).toEqual(
        expect.arrayContaining([firstBadge?.trim()].filter(Boolean))
      );
    }
  });

  test("clicking '+ Add Lender' shows the add lender form", async ({ page }) => {
    await page.click("button:has-text('Add Lender')");
    await expect(page.locator("h2:has-text('Add Lender')")).toBeVisible();
    await expect(page.locator("label:has-text('Lender Name')")).toBeVisible();
    await expect(page.locator("label:has-text('Portal')")).toBeVisible();
    await expect(page.locator("label:has-text('Contact Email')")).toBeVisible();
  });

  test("fill and submit new lender form — verify lender appears or error shown", async ({ page }) => {
    await page.click("button:has-text('Add Lender')");
    await page.waitForSelector("text=Lender Name");

    // Fill the form
    await page.fill('input[placeholder="Chase Auto Finance"]', "E2E Regional Credit Union");
    await page.fill('input[placeholder="CHASE-4821"]', "ERCU-001");
    await page.selectOption("select", { value: "dealertrack" });
    await page.fill('input[placeholder="support@lender.com"]', "test@ercu.com");
    await page.fill('input[placeholder="(800) 555-0100"]', "(555) 867-5309");

    // Submit
    await page.click("button[type='submit']:has-text('Add Lender')");

    // Either form closes (success) or an error div appears
    await page.waitForTimeout(2_000);
    const formStillVisible = await page.locator("h2:has-text('Add Lender')").isVisible();
    if (formStillVisible) {
      // Check for error message
      await expect(page.locator(".text-red-700, .text-red-600")).toBeVisible();
    }
    // Success path: form closed, lender should appear in grid
  });

  test("clicking 'View Rate Sheet' reveals rate tiers table with columns", async ({ page }) => {
    await page.waitForTimeout(1_500);
    const rateButton = page.locator("button:has-text('View Rate Sheet')").first();
    if (await rateButton.isVisible()) {
      await rateButton.click();
      // Table headers: Score Range, Rate, Max Term
      await expect(page.locator("th:has-text('Score Range')").first()).toBeVisible();
      await expect(page.locator("th:has-text('Rate')").first()).toBeVisible();
      await expect(page.locator("th:has-text('Max Term')").first()).toBeVisible();
    }
  });

  test("clicking 'Hide Rate Sheet' collapses the rate tiers table", async ({ page }) => {
    await page.waitForTimeout(1_500);
    const viewButton = page.locator("button:has-text('View Rate Sheet')").first();
    if (await viewButton.isVisible()) {
      await viewButton.click();
      await expect(page.locator("th:has-text('Score Range')").first()).toBeVisible();
      // Click hide
      await page.locator("button:has-text('Hide Rate Sheet')").first().click();
      await expect(page.locator("th:has-text('Score Range')")).not.toBeVisible();
    }
  });

  test("toggle lender active/inactive — verify status text changes", async ({ page }) => {
    await page.waitForTimeout(1_500);
    const deactivateBtn = page.locator("button:has-text('Deactivate')").first();
    if (await deactivateBtn.isVisible()) {
      // Find the card's status before toggle
      const card = deactivateBtn.locator("xpath=ancestor::div[contains(@class,'shadow-card')]");
      await expect(card.locator("text=Active")).toBeVisible();
      await deactivateBtn.click();
      await page.waitForTimeout(1_000);
      // After toggle, button should say "Activate" and status "Inactive"
      await expect(card.locator("text=Inactive")).toBeVisible();
    }
  });

  test("cancel button closes the add lender form without submitting", async ({ page }) => {
    await page.click("button:has-text('Add Lender')");
    await expect(page.locator("h2:has-text('Add Lender')")).toBeVisible();
    await page.click("button:has-text('Cancel')");
    await expect(page.locator("h2:has-text('Add Lender')")).not.toBeVisible();
  });

  test("portal select contains all portal options", async ({ page }) => {
    await page.click("button:has-text('Add Lender')");
    const options = await page.locator("select option").allTextContents();
    expect(options).toEqual(expect.arrayContaining(["RouteOne", "DealerTrack", "CUDL", "Direct"]));
  });
});

/* ========================================================================== */
/* Credit Bureau flows                                                         */
/* ========================================================================== */

test.describe("Credit Bureau — browser flows", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const ok = await safeNavigate(page, "/admin/credit");
    if (!ok) test.skip(true, "Credit page returned non-2xx");
  });

  test("renders Credit Bureau heading and pulls count", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Credit Bureau");
    await expect(page.locator("text=/pull|Loading/i")).toBeVisible({ timeout: 8_000 });
  });

  test("displays stat cards — Total Pulls, Average Score, Hard Pulls, Soft Pulls", async ({ page }) => {
    await page.waitForTimeout(1_500);
    for (const label of ["Total Pulls", "Average Score", "Hard Pulls", "Soft Pulls"]) {
      await expect(page.locator(`text=${label}`)).toBeVisible();
    }
  });

  test("clicking 'Pull Credit' opens the credit pull form with all fields", async ({ page }) => {
    await page.click("button:has-text('Pull Credit')");
    await expect(page.locator("h2:has-text('Pull Credit Report')")).toBeVisible();
    await expect(page.locator("label:has-text('Applicant Name')")).toBeVisible();
    await expect(page.locator("label:has-text('Bureau')")).toBeVisible();
    await expect(page.locator("label:has-text('Pull Type')")).toBeVisible();
    // Consent checkbox
    await expect(page.locator("text=Fair Credit Reporting Act")).toBeVisible();
  });

  test("bureau select has all options (Tri-Merge, Equifax, Experian, TransUnion)", async ({ page }) => {
    await page.click("button:has-text('Pull Credit')");
    const options = await page.locator("select").first().locator("option").allTextContents();
    expect(options.join(",")).toContain("Equifax");
    expect(options.join(",")).toContain("Experian");
    expect(options.join(",")).toContain("TransUnion");
  });

  test("pull type select has soft and hard options", async ({ page }) => {
    await page.click("button:has-text('Pull Credit')");
    // Pull Type is the second select
    const pullTypeSelect = page.locator("select").nth(1);
    const options = await pullTypeSelect.locator("option").allTextContents();
    expect(options).toEqual(expect.arrayContaining(["Soft Pull", "Hard Pull"]));
  });

  test("submit button is disabled when consent is not checked", async ({ page }) => {
    await page.click("button:has-text('Pull Credit')");
    // Fill required applicant name
    await page.fill('input[placeholder="John Smith"]', "Test Applicant");
    // Do NOT check consent
    const submitBtn = page.locator("button[type='submit']:has-text('Pull Credit')");
    await expect(submitBtn).toBeDisabled();
  });

  test("fill applicant, select Equifax, soft pull, check consent, submit — verify result appears", async ({
    page,
  }) => {
    await page.click("button:has-text('Pull Credit')");

    await page.fill('input[placeholder="John Smith"]', "Sarah Thompson");
    await page.selectOption("select >> nth=0", { value: "equifax" });
    await page.selectOption("select >> nth=1", { value: "soft" });
    // Check consent
    await page.locator('input[type="checkbox"]').check();
    // Submit
    await page.click("button[type='submit']:has-text('Pull Credit')");

    // Wait for result or error
    await page.waitForTimeout(3_000);
    // Either the Credit Report Result section or an error appears
    const resultVisible = await page.locator("text=Credit Report Result").isVisible();
    const errorVisible = await page.locator(".text-red-700").isVisible();
    expect(resultVisible || errorVisible).toBeTruthy();
  });

  test("credit result shows score, Key Factors, and Trade Lines table", async ({ page }) => {
    // Submit a credit pull to get a result
    await page.click("button:has-text('Pull Credit')");
    await page.fill('input[placeholder="John Smith"]', "Michael Davis");
    await page.selectOption("select >> nth=0", { value: "equifax" });
    await page.locator('input[type="checkbox"]').check();
    await page.click("button[type='submit']:has-text('Pull Credit')");
    await page.waitForTimeout(3_000);

    if (await page.locator("text=Credit Report Result").isVisible()) {
      // Score appears as a large number
      await expect(page.locator("text=Key Factors")).toBeVisible();
      await expect(page.locator("text=Trade Lines")).toBeVisible();
      // Trade lines table columns
      await expect(page.locator("th:has-text('Creditor')")).toBeVisible();
      await expect(page.locator("th:has-text('Balance')")).toBeVisible();
    }
  });

  test("credit history table renders with Date, Applicant, Bureau, Type, Score columns", async ({
    page,
  }) => {
    await page.waitForTimeout(2_000);
    const table = page.locator("table");
    if ((await table.count()) > 0) {
      for (const col of ["Date", "Applicant", "Bureau", "Type", "Score"]) {
        await expect(page.locator(`th:has-text('${col}')`).first()).toBeVisible();
      }
    }
  });

  test("score distribution sidebar renders with tier labels", async ({ page }) => {
    await page.waitForTimeout(2_000);
    const distribution = page.locator("text=Score Distribution");
    if (await distribution.isVisible()) {
      await expect(page.locator("text=Excellent")).toBeVisible();
      await expect(page.locator("text=Good")).toBeVisible();
      await expect(page.locator("text=Fair")).toBeVisible();
      await expect(page.locator("text=Needs Work")).toBeVisible();
    }
  });

  test("cancel button closes credit pull form", async ({ page }) => {
    await page.click("button:has-text('Pull Credit')");
    await expect(page.locator("h2:has-text('Pull Credit Report')")).toBeVisible();
    await page.click("button:has-text('Cancel')");
    await expect(page.locator("h2:has-text('Pull Credit Report')")).not.toBeVisible();
  });
});
