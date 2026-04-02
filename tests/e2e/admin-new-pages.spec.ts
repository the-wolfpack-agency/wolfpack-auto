/**
 * E2E Tests — New Admin Pages
 *
 * Validates that all new admin pages:
 *  1. Load without errors (200, not 500/blank)
 *  2. Render expected content and data-testid markers
 *  3. Have working interactive elements (tabs, forms, buttons)
 *  4. Don't show "Internal Server Error" or blank pages
 */
import { test, expect } from "@playwright/test";

// Helper: navigate to admin page and verify basic render
async function verifyAdminPage(
  page: any,
  path: string,
  testId: string,
  expectedTexts: string[],
) {
  const response = await page.goto(path, { waitUntil: "load" });

  // Should not be a server error
  expect(response?.status()).not.toBe(500);

  // Should render the page container
  const container = page.locator(`[data-testid="${testId}"]`);
  await expect(container).toBeVisible({ timeout: 10000 });

  // Body should have content (not blank)
  const body = await page.textContent("body");
  expect((body ?? "").length).toBeGreaterThan(100);
  expect(body).not.toContain("Internal Server Error");

  // Expected text content should be present
  for (const text of expectedTexts) {
    expect(body).toContain(text);
  }
}

test.describe("F&I Desking Page", () => {
  test("renders desking workspace", async ({ page }) => {
    await verifyAdminPage(page, "/admin/desking", "desking-page", [
      "Desking",
    ]);
  });

  test("has deal calculator inputs", async ({ page }) => {
    await page.goto("/admin/desking", { waitUntil: "load" });
    // Should have price-related inputs
    const body = await page.textContent("body") ?? "";
    const hasInputs = body.includes("Price") || body.includes("price") ||
      body.includes("Payment") || body.includes("payment") ||
      body.includes("Term") || body.includes("APR");
    expect(hasInputs).toBeTruthy();
  });

  test("has save deal button", async ({ page }) => {
    await page.goto("/admin/desking", { waitUntil: "load" });
    const saveBtn = page.locator('button:has-text("Save")');
    const count = await saveBtn.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe("Accounting Page", () => {
  test("renders accounting dashboard", async ({ page }) => {
    await verifyAdminPage(page, "/admin/accounting", "accounting-page", [
      "Account",
    ]);
  });

  test("has tab navigation", async ({ page }) => {
    await page.goto("/admin/accounting", { waitUntil: "load" });
    const body = await page.textContent("body") ?? "";
    const hasTabs = body.includes("Chart") || body.includes("Journal") || body.includes("Statement");
    expect(hasTabs).toBeTruthy();
  });
});

test.describe("Payments Page", () => {
  test("renders payments dashboard", async ({ page }) => {
    await verifyAdminPage(page, "/admin/payments", "payments-page", [
      "Payment",
    ]);
  });

  test("shows Stripe status", async ({ page }) => {
    await page.goto("/admin/payments", { waitUntil: "load" });
    const body = await page.textContent("body") ?? "";
    // Should show some payment-related content
    const hasPaymentContent = body.includes("Stripe") || body.includes("Payment") ||
      body.includes("Transaction") || body.includes("payment");
    expect(hasPaymentContent).toBeTruthy();
  });
});

test.describe("Payroll Page", () => {
  test("renders payroll dashboard", async ({ page }) => {
    await verifyAdminPage(page, "/admin/payroll", "payroll-page", [
      "Payroll",
    ]);
  });

  test("has tab navigation", async ({ page }) => {
    await page.goto("/admin/payroll", { waitUntil: "load" });
    const body = await page.textContent("body") ?? "";
    const hasTabs = body.includes("Employee") || body.includes("Time") ||
      body.includes("Commission") || body.includes("commission");
    expect(hasTabs).toBeTruthy();
  });
});

test.describe("Background Studio Page", () => {
  test("renders background studio", async ({ page }) => {
    await verifyAdminPage(page, "/admin/inventory/backgrounds", "backgrounds-page", [
      "Background",
    ]);
  });

  test("has tab navigation", async ({ page }) => {
    await page.goto("/admin/inventory/backgrounds", { waitUntil: "load" });
    const body = await page.textContent("body") ?? "";
    const hasTabs = body.includes("Manage") || body.includes("Custom") ||
      body.includes("AI Studio") || body.includes("Performance");
    expect(hasTabs).toBeTruthy();
  });
});

test.describe("Sidebar Navigation", () => {
  test("sidebar shows new page links", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "load" });
    const html = await page.content();

    // These links should exist somewhere in the page
    expect(html).toContain("/admin/desking");
    expect(html).toContain("/admin/payments");
    expect(html).toContain("/admin/payroll");
    expect(html).toContain("/admin/inventory/backgrounds");
  });
});
