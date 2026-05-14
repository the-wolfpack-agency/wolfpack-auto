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

// Add immediately after imports:
test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set."
);

test.describe("Financing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/financing", { waitUntil: "domcontentloaded" });
  });

  // -- Shared tests --
  test("loads successfully", async ({ page }) => {
    await testPageLoads(page, "/financing", "Financing");
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

  // -- Financing-specific tests --

  test("3 financing tier cards visible", async ({ page }) => {
    const tiersSection = page.locator(
      "section[aria-labelledby='tiers-heading']",
    );
    await expect(tiersSection).toBeVisible();

    await expect(tiersSection.getByText("Excellent Credit")).toBeVisible();
    await expect(tiersSection.getByText("Good Credit")).toBeVisible();
    await expect(tiersSection.getByText("Building Credit")).toBeVisible();

    // APR rates visible
    await expect(tiersSection.getByText("2.9%")).toBeVisible();
    await expect(tiersSection.getByText("4.9%")).toBeVisible();
    await expect(tiersSection.getByText("7.9%")).toBeVisible();

    // Apply Now buttons (one per tier)
    const applyButtons = tiersSection.locator("button:has-text('Apply Now')");
    await expect(applyButtons).toHaveCount(3);
  });

  test("Most Popular badge on first tier", async ({ page }) => {
    await expect(page.getByText("Most Popular")).toBeVisible();
  });

  test("payment calculator form has all inputs", async ({ page }) => {
    const calcSection = page.locator(
      "section[aria-labelledby='calc-heading']",
    );
    await expect(calcSection).toBeVisible();

    // Vehicle Price input
    await expect(calcSection.locator("#calc-price")).toBeVisible();

    // Down Payment input
    await expect(calcSection.locator("#calc-down")).toBeVisible();

    // Trade-In Value input
    await expect(calcSection.locator("#calc-trade")).toBeVisible();

    // APR input
    await expect(calcSection.locator("#calc-apr")).toBeVisible();

    // Loan term select
    await expect(calcSection.locator("#calc-term-select")).toBeVisible();

    // Estimated payment display
    await expect(calcSection.getByText(/Estimated Monthly Payment/i)).toBeVisible();

    // Pre-approval CTA
    await expect(
      calcSection.locator("button:has-text('Get Pre-Approved')"),
    ).toBeVisible();
  });

  test("FAQ accordion: click question expands answer", async ({ page }) => {
    const faqSection = page.locator("section[aria-labelledby='faq-heading']");
    await expect(faqSection).toBeVisible();

    const questions = faqSection.locator("details");
    const count = await questions.count();
    expect(count).toBe(4);

    // First FAQ is open by default
    const firstFaq = questions.first();
    await expect(firstFaq).toHaveAttribute("open", "");

    // Second FAQ should be closed, click to open
    const secondFaq = questions.nth(1);
    const secondSummary = secondFaq.locator("summary");
    await expect(secondSummary).toBeVisible();

    // Click to open
    await secondSummary.click();
    await expect(secondFaq).toHaveAttribute("open", "");

    // Answer content should be visible
    const answer = secondFaq.locator("div");
    await expect(answer).toBeVisible();
  });

  test("Get Pre-Approved Now hero CTA visible", async ({ page }) => {
    const heroCTA = page.locator("a[href='#apply']:has-text('Get Pre-Approved Now')");
    await expect(heroCTA).toBeVisible();
  });

  test("Ready to Get Started CTA section", async ({ page }) => {
    await expect(page.getByText("Ready to Get Started?")).toBeVisible();
    await expect(
      page.locator("a[href='/inventory']:has-text('Browse Inventory')").last(),
    ).toBeVisible();
    await expect(
      page.locator("a[href='/contact']:has-text('Talk to a Specialist')"),
    ).toBeVisible();
  });
});
