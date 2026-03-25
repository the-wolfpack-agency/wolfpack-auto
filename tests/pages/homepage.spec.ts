import { test, expect } from "@playwright/test";
import {
  testPageLoads,
  testNavigation,
  testFooter,
  testMobileMenu,
  testChatWidget,
  testAccessibility,
  testSEO,
  testNoConsoleErrors,
  testImagesLoad,
  testResponsive,
} from "../shared/page-checks";

test.describe("Homepage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
  });

  // -- Shared tests --
  test("loads successfully", async ({ page }) => {
    await testPageLoads(page, "/", "Wolfpack");
  });

  test("navigation renders correctly", async ({ page }) => {
    await testNavigation(page);
  });

  test("footer renders correctly", async ({ page }) => {
    await testFooter(page);
  });

  test("mobile menu works", async ({ page }) => {
    await testMobileMenu(page);
  });

  test("chat widget renders", async ({ page }) => {
    await testChatWidget(page);
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

  // -- Homepage-specific tests --

  test("hero section: search bar and CTA visible", async ({ page }) => {
    // Search form
    const searchForm = page.locator("form[role='search']");
    await expect(searchForm).toBeVisible();

    // Make dropdown
    await expect(page.locator("#hero-make")).toBeVisible();

    // Search input
    await expect(page.locator("#hero-model")).toBeVisible();

    // ZIP input
    await expect(page.locator("#hero-zip")).toBeVisible();

    // CTA button
    const ctaButton = searchForm.locator("button[type='submit']");
    await expect(ctaButton).toBeVisible();
    await expect(ctaButton).toHaveText(/Browse Inventory/i);
  });

  test("featured vehicles: cards render with details", async ({ page }) => {
    const section = page.locator("section[aria-labelledby='featured-heading']");
    await expect(section).toBeVisible();

    // Should have vehicle cards
    const cards = section.locator("a[href^='/inventory/']");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // First card has title, price, mileage
    const firstCard = cards.first();
    const title = await firstCard.locator("h3").textContent();
    expect(title?.length).toBeGreaterThan(0);

    // Price (contains $)
    await expect(firstCard.locator("text=$")).toBeVisible();

    // Mileage (contains "miles")
    await expect(firstCard.getByText(/miles/i)).toBeVisible();

    // View Details link text
    await expect(firstCard.getByText("View Details")).toBeVisible();
  });

  test("Why Choose Us section: 3 cards visible", async ({ page }) => {
    const section = page.locator("section[aria-labelledby='why-heading']");
    await expect(section).toBeVisible();

    await expect(section.getByText("Certified Vehicles")).toBeVisible();
    await expect(section.getByText("Easy Financing")).toBeVisible();
    await expect(section.getByText("Money-Back Guarantee")).toBeVisible();
  });

  test("testimonials: 3 quotes visible", async ({ page }) => {
    const section = page.locator(
      "section[aria-labelledby='testimonials-heading']",
    );
    await expect(section).toBeVisible();

    const quotes = section.locator("blockquote");
    await expect(quotes).toHaveCount(3);

    // Each quote has a name
    await expect(section.getByText("Sarah M.")).toBeVisible();
    await expect(section.getByText("James R.")).toBeVisible();
    await expect(section.getByText("Maria L.")).toBeVisible();
  });

  test("Browse by Type: category cards visible", async ({ page }) => {
    const section = page.locator("section[aria-labelledby='browse-heading']");
    await expect(section).toBeVisible();

    // Should have category cards with images
    const categories = section.locator("a[href^='/inventory?category=']");
    const count = await categories.count();
    expect(count).toBeGreaterThanOrEqual(4);

    // Check a few category labels
    await expect(section.getByText("Sedans")).toBeVisible();
    await expect(section.getByText("SUVs")).toBeVisible();
    await expect(section.getByText("Trucks")).toBeVisible();
  });

  test("financing banner: CTA links to financing page", async ({ page }) => {
    const financingLink = page.locator(
      "a[href='/financing']:has-text('Check Your Rate')",
    );
    await expect(financingLink).toBeVisible();
  });
});
