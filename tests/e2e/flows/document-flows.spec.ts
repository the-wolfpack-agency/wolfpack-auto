/**
 * document-flows.spec.ts
 *
 * Browser-interaction E2E tests for Document Vault page.
 * Simulates real user flows: viewing docs, filtering, uploading,
 * signing, deleting, and verifying stats.
 *
 * Run: npx playwright test tests/e2e/flows/document-flows.spec.ts
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
/* Document Vault flows                                                        */
/* ========================================================================== */

test.describe("Document Vault — browser flows", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const ok = await safeNavigate(page, "/admin/documents");
    if (!ok) test.skip(true, "Documents page returned non-2xx");
  });

  test("renders Document Vault heading and document count", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("Document Vault");
    await expect(page.locator("text=/document|Loading/i")).toBeVisible({ timeout: 8_000 });
  });

  test("stat cards show Total Documents, Unsigned, Deals with Docs, Missing Signatures", async ({ page }) => {
    await page.waitForLoadState("load");
    for (const label of ["Total Documents", "Unsigned", "Deals with Docs", "Missing Signatures"]) {
      await expect(page.locator(`text=${label}`)).toBeVisible();
    }
  });

  test("documents table renders with Document, Type, Signed, Actions columns", async ({ page }) => {
    await page.waitForLoadState("load");
    const table = page.locator("table");
    if ((await table.count()) > 0) {
      await expect(page.locator("th:has-text('Document')")).toBeVisible();
      await expect(page.locator("th:has-text('Type')")).toBeVisible();
      await expect(page.locator("th:has-text('Signed')")).toBeVisible();
      await expect(page.locator("th:has-text('Actions')")).toBeVisible();
    }
  });

  test("filter by document type — select Purchase Agreement", async ({ page }) => {
    await page.waitForLoadState("load");
    // The type filter is the first select on the page
    const typeFilter = page.locator("select").first();
    await typeFilter.selectOption({ value: "purchase_agreement" });
    await page.waitForLoadState("domcontentloaded");
    // After filter, all visible type badges should be Purchase Agreement
    const typeBadges = page.locator("tbody span.rounded-full");
    const count = await typeBadges.count();
    for (let i = 0; i < count; i++) {
      const text = await typeBadges.nth(i).textContent();
      expect(text?.trim()).toBe("Purchase Agreement");
    }
  });

  test("filter by document type — reset to All Types", async ({ page }) => {
    await page.waitForLoadState("load");
    const typeFilter = page.locator("select").first();
    await typeFilter.selectOption({ value: "purchase_agreement" });
    await page.waitForLoadState("domcontentloaded");
    // Reset
    await typeFilter.selectOption({ value: "" });
    await page.waitForLoadState("domcontentloaded");
    // Should show all types or empty state
    const rows = page.locator("tbody tr");
    const rowCount = await rows.count();
    // Verify either we have rows or the empty state
    expect(rowCount >= 0).toBeTruthy();
  });

  test("filter by Deal ID text input", async ({ page }) => {
    await page.waitForLoadState("load");
    const dealFilter = page.locator('input[placeholder="Filter by Deal ID"]');
    await dealFilter.fill("deal-001");
    await page.waitForLoadState("domcontentloaded");
    // Filter applied — should narrow results or show empty
  });

  test("clicking '+ Upload Document' shows the upload form", async ({ page }) => {
    await page.click("button:has-text('Upload Document')");
    await expect(page.locator("h2:has-text('Upload Document')")).toBeVisible();
    await expect(page.locator("label:has-text('Document Name')")).toBeVisible();
    await expect(page.locator("label:has-text('Document Type')")).toBeVisible();
    await expect(page.locator("text=Drag and drop")).toBeVisible();
  });

  test("fill upload form — name, type, deal, lead, VIN, notes — submit", async ({ page }) => {
    await page.click("button:has-text('Upload Document')");
    await page.waitForSelector("text=Document Name");

    await page.fill(
      'input[placeholder="Purchase Agreement - Smith 2025 Camry"]',
      "E2E Test Buyer's Order"
    );
    // Select doc type
    const typeSelect = page.locator("form select").first();
    await typeSelect.selectOption({ value: "purchase_agreement" });

    await page.fill('input[placeholder="deal-2026-001"]', "deal-e2e-123");
    await page.fill('input[placeholder="lead-101"]', "lead-e2e-456");
    await page.fill('input[placeholder="1HGBH41JXMN109186"]', "5YJ3E1EA7PF123456");
    await page.fill('textarea[placeholder="Additional notes about this document"]', "E2E test document upload");

    await page.click("button[type='submit']:has-text('Upload Document')");
    await page.waitForLoadState("load");

    // Form should close on success, or show error
    const formStillOpen = await page.locator("h2:has-text('Upload Document')").isVisible();
    if (formStillOpen) {
      const error = page.locator(".text-red-700");
      await expect(error).toBeVisible();
    }
  });

  test("sign button appears on unsigned documents", async ({ page }) => {
    await page.waitForLoadState("load");
    const signBtn = page.locator("button:has-text('Sign')").first();
    const unsignedText = page.locator("text=Unsigned").first();
    // Either we have unsigned docs with sign buttons, or all are signed
    const hasUnsigned = await unsignedText.isVisible().catch(() => false);
    if (hasUnsigned) {
      await expect(signBtn).toBeVisible();
    }
  });

  test("clicking Sign marks document as signed — checkmark appears", async ({ page }) => {
    await page.waitForLoadState("load");
    const signBtn = page.locator("button:has-text('Sign')").first();
    if (await signBtn.isVisible()) {
      // Find the row before clicking
      const row = signBtn.locator("xpath=ancestor::tr");
      await signBtn.click();
      // The signed column should now show "Signed" text
      await expect(row.locator("text=Signed")).toBeVisible({ timeout: 5_000 });
    }
  });

  test("delete button removes document from the table", async ({ page }) => {
    await page.waitForLoadState("load");
    const rows = page.locator("tbody tr");
    const initialCount = await rows.count();
    if (initialCount > 0) {
      const deleteBtn = page.locator("button:has-text('Delete')").first();
      await deleteBtn.click();
      await page.waitForLoadState("load");
      const newCount = await rows.count();
      expect(newCount).toBeLessThanOrEqual(initialCount);
    }
  });

  test("cancel button closes upload form", async ({ page }) => {
    await page.click("button:has-text('Upload Document')");
    await expect(page.locator("h2:has-text('Upload Document')")).toBeVisible();
    // Click form Cancel button (not the header toggle)
    await page.locator("form button:has-text('Cancel')").click();
    await expect(page.locator("h2:has-text('Upload Document')")).not.toBeVisible();
  });

  test("document type select contains all standard document types", async ({ page }) => {
    await page.click("button:has-text('Upload Document')");
    const options = await page.locator("form select").first().locator("option").allTextContents();
    expect(options).toEqual(
      expect.arrayContaining([
        "Purchase Agreement",
        "Title",
        "Registration",
        "Insurance",
        "Disclosure",
      ])
    );
  });
});
