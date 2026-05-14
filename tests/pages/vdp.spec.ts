import { test, expect } from "@playwright/test";
import {
  testPageLoads,
  testNavigation,
  testFooter,
  testAccessibility,
  testSEO,
  testNoConsoleErrors,
  testResponsive,
} from "../shared/page-checks";

test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set.",
);

// Known VIN from placeholder data
const TEST_VIN = "1HGCV1F34PA000001";
const VDP_PATH = `/inventory/${TEST_VIN}`;

test.describe("Vehicle Detail Page (VDP)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(VDP_PATH, { waitUntil: "domcontentloaded" });
  });

  // -- Shared tests --
  test("loads successfully", async ({ page }) => {
    await testPageLoads(page, VDP_PATH, "Honda");
  });

  test("navigation renders correctly", async ({ page }) => {
    await testNavigation(page);
  });

  test("footer renders correctly", async ({ page }) => {
    await testFooter(page);
  });

  test("accessibility basics pass", async ({ page }) => {
    await testAccessibility(page);
  });

  test("SEO meta tags present", async ({ page }) => {
    await testSEO(page);
  });

  test("no critical console errors", async ({ page }) => {
    await testNoConsoleErrors(page);
  });

  test("responsive - no horizontal overflow", async ({ page }) => {
    await testResponsive(page);
  });

  // -- VDP-specific tests --

  test("vehicle title renders with year, make, model", async ({ page }) => {
    const title = page.locator("h1");
    await expect(title).toBeVisible();
    const text = await title.textContent();
    expect(text).toContain("2024");
    expect(text).toContain("Honda");
    expect(text).toContain("CR-V");
  });

  test("price displayed prominently", async ({ page }) => {
    // Price card with large price text
    const priceText = page.getByText("$34,250");
    await expect(priceText).toBeVisible();
  });

  test("breadcrumb navigation works", async ({ page }) => {
    const breadcrumb = page.locator("nav[aria-label='Breadcrumb']");
    await expect(breadcrumb).toBeVisible();

    // Has Home, Inventory, and current vehicle
    await expect(breadcrumb.locator("a[href='/']")).toBeVisible();
    await expect(breadcrumb.locator("a[href='/inventory']")).toBeVisible();

    // Current page shown
    const currentPage = breadcrumb.locator("[aria-current='page']");
    await expect(currentPage).toBeVisible();

    // Click Inventory link navigates back
    await breadcrumb.locator("a[href='/inventory']").click();
    await page.waitForURL(/\/inventory$/);
  });

  test("specifications table has entries", async ({ page }) => {
    const specsSection = page.locator(
      "section[aria-labelledby='specs-heading']",
    );
    await expect(specsSection).toBeVisible();
    await expect(specsSection.getByText("Vehicle Specifications")).toBeVisible();

    // Should have spec rows (dl > div pairs)
    const specRows = specsSection.locator("dl > div");
    const count = await specRows.count();
    expect(count).toBeGreaterThanOrEqual(10);

    // Verify specific specs
    await expect(specsSection.getByText("Year")).toBeVisible();
    await expect(specsSection.getByText("Make")).toBeVisible();
    await expect(specsSection.getByText("Mileage")).toBeVisible();
    await expect(specsSection.getByText("Transmission")).toBeVisible();
    await expect(specsSection.getByText("VIN")).toBeVisible();
  });

  test("features list visible", async ({ page }) => {
    const featuresSection = page.locator(
      "section[aria-labelledby='features-heading']",
    );
    await expect(featuresSection).toBeVisible();
    await expect(featuresSection.getByText("Key Features")).toBeVisible();

    const features = featuresSection.locator("ul > li");
    const count = await features.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("Schedule Test Drive CTA visible", async ({ page }) => {
    const testDriveBtn = page.locator(
      "button:has-text('Schedule Test Drive')",
    );
    await expect(testDriveBtn).toBeVisible();
  });

  test("Request Price CTA visible", async ({ page }) => {
    const requestPriceBtn = page.locator("button:has-text('Request Price')");
    await expect(requestPriceBtn).toBeVisible();
  });

  test("payment calculator card visible", async ({ page }) => {
    await expect(page.getByText("Payment Calculator")).toBeVisible();
    await expect(page.locator("#calc-down")).toBeVisible();
    await expect(page.locator("#calc-term")).toBeVisible();
    await expect(
      page.locator("button:has-text('Calculate Payment')"),
    ).toBeVisible();
  });

  test("similar vehicles section at bottom", async ({ page }) => {
    const similarSection = page.locator(
      "section[aria-labelledby='similar-heading']",
    );
    await expect(similarSection).toBeVisible();
    await expect(similarSection.getByText("Similar Vehicles")).toBeVisible();

    const similarCards = similarSection.locator("a[href^='/inventory/']");
    const count = await similarCards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("dealer info card visible", async ({ page }) => {
    await expect(page.getByText("Wolfpack Motors").first()).toBeVisible();
    await expect(page.getByText("Denver, CO").first()).toBeVisible();
    await expect(page.getByText("(303) 555-1234").first()).toBeVisible();
  });

  test("trust badges visible", async ({ page }) => {
    await expect(page.getByText("CARFAX Clean")).toBeVisible();
    await expect(page.getByText("150-Point Inspection")).toBeVisible();
    await expect(page.getByText("7-Day Return")).toBeVisible();
  });

  test("Get Pre-Approved link goes to financing", async ({ page }) => {
    const preApprovedLink = page.locator("a[href='/financing']").filter({
      hasText: /Pre-Approved/i,
    });
    await expect(preApprovedLink).toBeVisible();
  });
});
