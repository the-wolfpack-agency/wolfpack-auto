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

test.describe("Inventory Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/inventory", { waitUntil: "domcontentloaded" });
  });

  // -- Shared tests --
  test("loads successfully", async ({ page }) => {
    await testPageLoads(page, "/inventory", "Inventory");
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

  // -- Inventory-specific tests --

  test("page header with breadcrumb", async ({ page }) => {
    const breadcrumb = page.locator("nav[aria-label='Breadcrumb']");
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb.getByText("Home")).toBeVisible();
    await expect(breadcrumb.getByText("Inventory")).toBeVisible();

    await expect(page.locator("h1")).toHaveText("Vehicle Inventory");
  });

  test("vehicle grid: at least 1 vehicle card renders", async ({ page }) => {
    const vehicleCards = page.locator("a[href^='/inventory/']");
    const count = await vehicleCards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("vehicle card has required elements", async ({ page }) => {
    const firstCard = page.locator("a[href^='/inventory/']").first();
    await expect(firstCard).toBeVisible();

    // Title (h2 with year make model)
    const title = firstCard.locator("h2");
    await expect(title).toBeVisible();
    const titleText = await title.textContent();
    expect(titleText?.length).toBeGreaterThan(0);

    // Price
    await expect(firstCard.locator("text=$")).toBeVisible();

    // Mileage
    await expect(firstCard.getByText(/mi$/)).toBeVisible();

    // View Details
    await expect(firstCard.getByText("View Details")).toBeVisible();

    // Condition badge
    const badge = firstCard.locator(
      "span:has-text('New'), span:has-text('Used'), span:has-text('Certified')",
    );
    await expect(badge.first()).toBeVisible();
  });

  test("filter sidebar visible on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });

    const sidebar = page.locator("aside[aria-label='Inventory filters']");
    await expect(sidebar).toBeVisible();

    // Filters heading
    await expect(sidebar.getByText("Filters")).toBeVisible();

    // Make select
    await expect(sidebar.locator("#filter-make")).toBeVisible();

    // Apply Filters button
    await expect(
      sidebar.locator("button[type='submit']:has-text('Apply Filters')"),
    ).toBeVisible();

    // Clear All button
    await expect(
      sidebar.locator("button:has-text('Clear All')"),
    ).toBeVisible();
  });

  test("sort dropdown works", async ({ page }) => {
    const sortSelect = page.locator("#sort-by");
    await expect(sortSelect).toBeVisible();

    // Change sort
    await sortSelect.selectOption("price_asc");

    // URL should update
    await page.waitForURL(/sort=price_asc/);
    expect(page.url()).toContain("sort=price_asc");
  });

  test("pagination is visible", async ({ page }) => {
    const pagination = page.locator("nav[aria-label='Pagination']");
    await expect(pagination).toBeVisible();

    // Should have page number buttons
    const pageButtons = pagination.locator("button");
    const count = await pageButtons.count();
    expect(count).toBeGreaterThanOrEqual(3); // prev, 1, next at minimum
  });

  test("showing count text visible", async ({ page }) => {
    const showingText = page.getByText(/Showing \d+ vehicles/);
    await expect(showingText).toBeVisible();
  });

  test("click vehicle card navigates to VDP", async ({ page }) => {
    const firstCard = page.locator("a[href^='/inventory/']").first();
    const href = await firstCard.getAttribute("href");
    expect(href).toBeTruthy();

    await firstCard.click();
    await page.waitForURL(/\/inventory\//);
    expect(page.url()).toContain("/inventory/");
  });
});
