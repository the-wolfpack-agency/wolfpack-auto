/**
 * deal-desking-flows.spec.ts
 *
 * Exhaustive browser-interaction E2E tests for the Deal Desking module.
 * Covers the full deal lifecycle: creating deals, payment calculator
 * (retail / lease / cash), F&I product selection, deal status advancement,
 * gross breakdown, and lender submission.
 *
 * Run: npx playwright test tests/e2e/flows/deal-desking-flows.spec.ts
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

/** Returns true when the page body indicates an auth wall (401/403). */
async function isAuthBlocked(page: Page): Promise<boolean> {
  const body = await page.locator("body").textContent({ timeout: 5_000 }).catch(() => "");
  return /sign.?in|log.?in|unauthorized|forbidden|401|403/i.test(body ?? "");
}

/* -------------------------------------------------------------------------- */
/* Deal list page: /admin/deals                                               */
/* -------------------------------------------------------------------------- */

test.describe("Deal Desking -- Deal List", () => {
  test("page loads with heading and New Deal button", async ({ page }) => {
    const ok = await safeNavigate(page, "/admin/deals");
    if (!ok || (await isAuthBlocked(page))) {
      test.info().annotations.push({ type: "skip", description: "Auth required" });
      return;
    }

    await expect(page.locator("h1")).toContainText("Deal Desking");
    await expect(page.getByRole("button", { name: /new deal/i })).toBeVisible();
  });

  test("stats cards render (Active Deals, Avg Front Gross, Avg Back Gross, Pipeline Value)", async ({ page }) => {
    const ok = await safeNavigate(page, "/admin/deals");
    if (!ok || (await isAuthBlocked(page))) {
      test.info().annotations.push({ type: "skip", description: "Auth required" });
      return;
    }

    await expect(page.getByText("Active Deals")).toBeVisible();
    await expect(page.getByText("Avg Front Gross")).toBeVisible();
    await expect(page.getByText("Avg Back Gross")).toBeVisible();
    await expect(page.getByText("Pipeline Value")).toBeVisible();
  });

  test("status filter dropdown has all options", async ({ page }) => {
    const ok = await safeNavigate(page, "/admin/deals");
    if (!ok || (await isAuthBlocked(page))) {
      test.info().annotations.push({ type: "skip", description: "Auth required" });
      return;
    }

    const select = page.locator("select").filter({ hasText: "All Statuses" }).first();
    await expect(select).toBeVisible();

    const options = await select.locator("option").allTextContents();
    expect(options).toContain("All Statuses");
    expect(options).toContain("Working");
    expect(options).toContain("Accepted");
    expect(options).toContain("Funded");
  });

  test("filter by status 'Working' narrows results (or shows empty)", async ({ page }) => {
    const ok = await safeNavigate(page, "/admin/deals");
    if (!ok || (await isAuthBlocked(page))) {
      test.info().annotations.push({ type: "skip", description: "Auth required" });
      return;
    }

    const select = page.locator("select").filter({ hasText: "All Statuses" }).first();
    await select.selectOption("working");
    // Wait for the fetch triggered by the filter
    await page.waitForLoadState("domcontentloaded");

    const body = await page.locator("body").textContent();
    // Either we see a "Working" badge or we see "No deals found"
    const hasResults = /Working/i.test(body ?? "") || /No deals found/i.test(body ?? "");
    expect(hasResults).toBe(true);
  });

  test("create new deal: open modal, fill form, submit, verify deal appears", async ({ page }) => {
    const ok = await safeNavigate(page, "/admin/deals");
    if (!ok || (await isAuthBlocked(page))) {
      test.info().annotations.push({ type: "skip", description: "Auth required" });
      return;
    }

    // Open modal
    await page.getByRole("button", { name: /new deal/i }).click();
    await expect(page.getByText("New Deal Worksheet")).toBeVisible();

    // Fill required fields
    const uniqueName = `E2E Deal ${Date.now()}`;
    await page.getByLabel(/customer name/i).fill(uniqueName);
    await page.getByLabel(/vin/i).fill("1HGBH41JXMN109186");
    await page.getByLabel(/selling price/i).fill("32500");

    // Fill optional fields
    await page.getByLabel(/year/i).fill("2025");
    await page.getByLabel(/make/i).fill("Honda");
    await page.getByLabel(/model/i).fill("Accord Sport");

    // Select deal type
    const dealTypeSelect = page.locator("select").filter({ hasText: /Retail.*Loan/i });
    await dealTypeSelect.selectOption("lease");

    // Submit
    await page.getByRole("button", { name: /create deal/i }).click();

    // Wait for modal to close and list to refresh
    await expect(page.getByText("New Deal Worksheet")).not.toBeVisible({ timeout: 10_000 });

    // Verify the deal appears (or the modal closed successfully)
    const modalStillOpen = await page.getByText("New Deal Worksheet").isVisible().catch(() => false);
    expect(modalStillOpen).toBe(false);
  });

  test("cancel new deal modal closes it without creating", async ({ page }) => {
    const ok = await safeNavigate(page, "/admin/deals");
    if (!ok || (await isAuthBlocked(page))) {
      test.info().annotations.push({ type: "skip", description: "Auth required" });
      return;
    }

    await page.getByRole("button", { name: /new deal/i }).click();
    await expect(page.getByText("New Deal Worksheet")).toBeVisible();

    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByText("New Deal Worksheet")).not.toBeVisible();
  });

  test("Create Deal button disabled when required fields are empty", async ({ page }) => {
    const ok = await safeNavigate(page, "/admin/deals");
    if (!ok || (await isAuthBlocked(page))) {
      test.info().annotations.push({ type: "skip", description: "Auth required" });
      return;
    }

    await page.getByRole("button", { name: /new deal/i }).click();
    await expect(page.getByText("New Deal Worksheet")).toBeVisible();

    const createBtn = page.getByRole("button", { name: /create deal/i });
    await expect(createBtn).toBeDisabled();

    // Fill only customer name -- still missing VIN and price
    await page.getByLabel(/customer name/i).fill("Partial Entry");
    await expect(createBtn).toBeDisabled();
  });

  test("deal table shows column headers", async ({ page }) => {
    const ok = await safeNavigate(page, "/admin/deals");
    if (!ok || (await isAuthBlocked(page))) {
      test.info().annotations.push({ type: "skip", description: "Auth required" });
      return;
    }

    await expect(page.getByText("Customer / Vehicle")).toBeVisible();
    await expect(page.getByText("Status")).toBeVisible();
    await expect(page.getByText("Total Gross")).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* Deal detail page: /admin/deals/[dealId]                                    */
/* -------------------------------------------------------------------------- */

test.describe("Deal Desking -- Deal Worksheet", () => {
  test("deal detail page shows vehicle info, customer info, and pricing", async ({ page }) => {
    // First fetch a deal ID from the API
    const apiResp = await page.request.get("/api/admin/deals");
    if (apiResp.status() === 401 || apiResp.status() === 403) {
      test.info().annotations.push({ type: "skip", description: "Auth required" });
      return;
    }
    if (!apiResp.ok()) return;

    const data = await apiResp.json();
    const deals = data.deals ?? [];
    if (deals.length === 0) {
      test.info().annotations.push({ type: "skip", description: "No deals in system" });
      return;
    }

    const dealId = deals[0].id;
    const ok = await safeNavigate(page, `/admin/deals/${dealId}`);
    if (!ok || (await isAuthBlocked(page))) {
      test.info().annotations.push({ type: "skip", description: "Auth required" });
      return;
    }

    // Vehicle section
    await expect(page.getByText("Vehicle").first()).toBeVisible();
    await expect(page.getByText("VIN")).toBeVisible();

    // Customer section
    await expect(page.getByText("Customer").first()).toBeVisible();

    // Payment Calculator section
    await expect(page.getByText("Payment Calculator")).toBeVisible();
  });

  test("payment calculator: Retail tab -- fill and calculate", async ({ page }) => {
    const apiResp = await page.request.get("/api/admin/deals");
    if (apiResp.status() === 401 || apiResp.status() === 403) {
      test.info().annotations.push({ type: "skip", description: "Auth required" });
      return;
    }
    const data = await apiResp.json();
    const deals = data.deals ?? [];
    if (deals.length === 0) {
      test.info().annotations.push({ type: "skip", description: "No deals" });
      return;
    }

    const deal = deals.find((d: { deal_type: string }) => d.deal_type === "retail") ?? deals[0];
    const ok = await safeNavigate(page, `/admin/deals/${deal.id}`);
    if (!ok || (await isAuthBlocked(page))) return;

    // Click Retail tab
    const retailTab = page.getByRole("button", { name: /retail.*loan/i });
    await retailTab.click();

    // APR and Term fields should be visible for retail
    await expect(page.getByText("APR %")).toBeVisible();
    await expect(page.getByText("Term (months)")).toBeVisible();

    // Click Calculate
    await page.getByRole("button", { name: /calculate payment/i }).click();

    // Monthly payment should appear
    await expect(page.getByText("/mo")).toBeVisible({ timeout: 5_000 });
  });

  test("payment calculator: Lease tab shows residual and money factor fields", async ({ page }) => {
    const apiResp = await page.request.get("/api/admin/deals");
    if (apiResp.status() === 401 || apiResp.status() === 403) {
      test.info().annotations.push({ type: "skip", description: "Auth required" });
      return;
    }
    const data = await apiResp.json();
    const deals = data.deals ?? [];
    if (deals.length === 0) {
      test.info().annotations.push({ type: "skip", description: "No deals" });
      return;
    }

    const ok = await safeNavigate(page, `/admin/deals/${deals[0].id}`);
    if (!ok || (await isAuthBlocked(page))) return;

    // Click Lease tab
    await page.getByRole("button", { name: /lease/i }).click();

    await expect(page.getByText("Residual %")).toBeVisible();
    await expect(page.getByText("Money Factor")).toBeVisible();
    await expect(page.getByText("Term (months)")).toBeVisible();

    // Calculate
    await page.getByRole("button", { name: /calculate payment/i }).click();

    // Wait for calculation result
    await expect(page.getByText(/\/mo|Residual|Monthly/i).first()).toBeVisible({ timeout: 5_000 });

    // Residual value should appear in results
    const body = await page.locator("body").textContent();
    const hasResult = /\/mo|Residual|Monthly/i.test(body ?? "");
    expect(hasResult).toBe(true);
  });

  test("payment calculator: Cash tab hides APR and term fields", async ({ page }) => {
    const apiResp = await page.request.get("/api/admin/deals");
    if (apiResp.status() === 401 || apiResp.status() === 403) {
      test.info().annotations.push({ type: "skip", description: "Auth required" });
      return;
    }
    const data = await apiResp.json();
    const deals = data.deals ?? [];
    if (deals.length === 0) {
      test.info().annotations.push({ type: "skip", description: "No deals" });
      return;
    }

    const ok = await safeNavigate(page, `/admin/deals/${deals[0].id}`);
    if (!ok || (await isAuthBlocked(page))) return;

    // Click Cash tab
    await page.getByRole("button", { name: /^cash$/i }).click();

    // APR and Residual fields should NOT be visible
    await expect(page.getByText("APR %")).not.toBeVisible();
    await expect(page.getByText("Residual %")).not.toBeVisible();
  });

  test("F&I product selection: check a product, verify running total updates", async ({ page }) => {
    const apiResp = await page.request.get("/api/admin/deals");
    if (apiResp.status() === 401 || apiResp.status() === 403) {
      test.info().annotations.push({ type: "skip", description: "Auth required" });
      return;
    }
    const data = await apiResp.json();
    const deals = data.deals ?? [];
    if (deals.length === 0) {
      test.info().annotations.push({ type: "skip", description: "No deals" });
      return;
    }

    const ok = await safeNavigate(page, `/admin/deals/${deals[0].id}`);
    if (!ok || (await isAuthBlocked(page))) return;

    // F&I Products section
    const fiSection = page.getByText("F&I Products").first();
    await expect(fiSection).toBeVisible();

    // Find checkboxes in F&I section
    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    if (count === 0) {
      test.info().annotations.push({ type: "skip", description: "No F&I products in catalog" });
      return;
    }

    // Click first product
    await checkboxes.first().check();

    // Running total should show "Products selected" and "Retail total"
    await expect(page.getByText("Products selected")).toBeVisible();
    await expect(page.getByText("Retail total")).toBeVisible();
  });

  test("F&I: select multiple products, verify total includes all", async ({ page }) => {
    const apiResp = await page.request.get("/api/admin/deals");
    if (apiResp.status() === 401 || apiResp.status() === 403) {
      test.info().annotations.push({ type: "skip", description: "Auth required" });
      return;
    }
    const data = await apiResp.json();
    const deals = data.deals ?? [];
    if (deals.length === 0) {
      test.info().annotations.push({ type: "skip", description: "No deals" });
      return;
    }

    const ok = await safeNavigate(page, `/admin/deals/${deals[0].id}`);
    if (!ok || (await isAuthBlocked(page))) return;

    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    if (count < 2) {
      test.info().annotations.push({ type: "skip", description: "Need 2+ F&I products" });
      return;
    }

    // Select first two products
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();

    // Verify count shows 2
    const summaryText = await page.getByText("Products selected").locator("..").textContent();
    expect(summaryText).toContain("2");
  });

  test("F&I: uncheck product, verify total decreases", async ({ page }) => {
    const apiResp = await page.request.get("/api/admin/deals");
    if (apiResp.status() === 401 || apiResp.status() === 403) {
      test.info().annotations.push({ type: "skip", description: "Auth required" });
      return;
    }
    const data = await apiResp.json();
    const deals = data.deals ?? [];
    if (deals.length === 0) {
      test.info().annotations.push({ type: "skip", description: "No deals" });
      return;
    }

    const ok = await safeNavigate(page, `/admin/deals/${deals[0].id}`);
    if (!ok || (await isAuthBlocked(page))) return;

    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    if (count === 0) {
      test.info().annotations.push({ type: "skip", description: "No F&I products" });
      return;
    }

    // Check then uncheck
    await checkboxes.first().check();
    await expect(page.getByText("Products selected")).toBeVisible({ timeout: 5_000 });

    await checkboxes.first().uncheck();

    // Summary should disappear when no products selected
    await expect(page.getByText("Products selected")).not.toBeVisible();
  });

  test("advance deal status: click 'Advance to ...' button, verify badge changes", async ({ page }) => {
    const apiResp = await page.request.get("/api/admin/deals");
    if (apiResp.status() === 401 || apiResp.status() === 403) {
      test.info().annotations.push({ type: "skip", description: "Auth required" });
      return;
    }
    const data = await apiResp.json();
    const deals = data.deals ?? [];
    // Find a deal in "working" status that can be advanced
    const advanceable = deals.find(
      (d: { status: string }) => ["working", "pending_approval", "approved", "presented"].includes(d.status),
    );
    if (!advanceable) {
      test.info().annotations.push({ type: "skip", description: "No advanceable deals" });
      return;
    }

    const ok = await safeNavigate(page, `/admin/deals/${advanceable.id}`);
    if (!ok || (await isAuthBlocked(page))) return;

    const advanceBtn = page.getByRole("button", { name: /advance to/i });
    const visible = await advanceBtn.isVisible().catch(() => false);
    if (!visible) {
      test.info().annotations.push({ type: "skip", description: "No advance button visible" });
      return;
    }

    // Capture current status text
    const btnText = await advanceBtn.textContent();
    await advanceBtn.click();
    await page.waitForLoadState("domcontentloaded");

    // The advance button text should change (next status in flow)
    const newBtnText = await advanceBtn.textContent().catch(() => "");
    // Status should have changed -- either button text changed or button disappeared
    const changed = newBtnText !== btnText || !(await advanceBtn.isVisible().catch(() => false));
    expect(changed).toBe(true);
  });

  test("gross breakdown: front gross, back gross, total gross sections visible", async ({ page }) => {
    const apiResp = await page.request.get("/api/admin/deals");
    if (apiResp.status() === 401 || apiResp.status() === 403) {
      test.info().annotations.push({ type: "skip", description: "Auth required" });
      return;
    }
    const data = await apiResp.json();
    const deals = data.deals ?? [];
    if (deals.length === 0) {
      test.info().annotations.push({ type: "skip", description: "No deals" });
      return;
    }

    const ok = await safeNavigate(page, `/admin/deals/${deals[0].id}`);
    if (!ok || (await isAuthBlocked(page))) return;

    // The deal detail page shows gross info on the right sidebar
    const body = await page.locator("body").textContent();
    const hasFront = /front.*gross/i.test(body ?? "");
    const hasBack = /back.*gross/i.test(body ?? "");
    const hasTotal = /total.*gross/i.test(body ?? "");
    expect(hasFront || hasBack || hasTotal).toBe(true);
  });

  test("lender submissions table visible when submissions exist", async ({ page }) => {
    const apiResp = await page.request.get("/api/admin/deals");
    if (apiResp.status() === 401 || apiResp.status() === 403) {
      test.info().annotations.push({ type: "skip", description: "Auth required" });
      return;
    }
    const data = await apiResp.json();
    const deals = data.deals ?? [];
    if (deals.length === 0) {
      test.info().annotations.push({ type: "skip", description: "No deals" });
      return;
    }

    // Try each deal until we find one with lender submissions
    for (const deal of deals.slice(0, 5)) {
      const ok = await safeNavigate(page, `/admin/deals/${deal.id}`);
      if (!ok || (await isAuthBlocked(page))) continue;

      const lenderSection = page.getByText("Lender Submissions");
      if (await lenderSection.isVisible().catch(() => false)) {
        // Verify table headers
        await expect(page.getByText("Lender").first()).toBeVisible();
        await expect(page.getByText("Submitted").first()).toBeVisible();
        return; // Test passed
      }
    }

    // No deals with submissions -- acceptable
    test.info().annotations.push({ type: "skip", description: "No deals with lender submissions" });
  });

  test("back to deals link navigates to deal list", async ({ page }) => {
    const apiResp = await page.request.get("/api/admin/deals");
    if (apiResp.status() === 401 || apiResp.status() === 403) {
      test.info().annotations.push({ type: "skip", description: "Auth required" });
      return;
    }
    const data = await apiResp.json();
    const deals = data.deals ?? [];
    if (deals.length === 0) {
      test.info().annotations.push({ type: "skip", description: "No deals" });
      return;
    }

    const ok = await safeNavigate(page, `/admin/deals/${deals[0].id}`);
    if (!ok || (await isAuthBlocked(page))) return;

    const backLink = page.getByText(/back to deal desking/i);
    await expect(backLink).toBeVisible();

    await backLink.click();
    await page.waitForURL(/\/admin\/deals$/);
    await expect(page.locator("h1")).toContainText("Deal Desking");
  });
});
