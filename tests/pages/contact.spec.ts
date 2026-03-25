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

test.describe("Contact Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/contact", { waitUntil: "domcontentloaded" });
  });

  // -- Shared tests --
  test("loads successfully", async ({ page }) => {
    await testPageLoads(page, "/contact", "Contact");
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

  // -- Contact-specific tests --

  test("contact form: all fields render", async ({ page }) => {
    // First name
    await expect(page.locator("#contact-first-name")).toBeVisible();
    await expect(page.locator("label[for='contact-first-name']")).toHaveText(
      /First Name/,
    );

    // Last name
    await expect(page.locator("#contact-last-name")).toBeVisible();
    await expect(page.locator("label[for='contact-last-name']")).toHaveText(
      /Last Name/,
    );

    // Email
    await expect(page.locator("#contact-email")).toBeVisible();
    await expect(page.locator("label[for='contact-email']")).toHaveText(
      /Email/,
    );

    // Phone
    await expect(page.locator("#contact-phone")).toBeVisible();

    // Subject dropdown
    await expect(page.locator("#contact-subject")).toBeVisible();

    // Message textarea
    await expect(page.locator("#contact-message")).toBeVisible();

    // Submit button
    await expect(
      page.locator("button[type='submit']:has-text('Send Message')"),
    ).toBeVisible();
  });

  test("submit empty form: shows validation errors", async ({ page }) => {
    // Click submit without filling anything
    await page.locator("button[type='submit']:has-text('Send Message')").click();

    // Should show validation errors for required fields
    await expect(page.getByText("First name is required.")).toBeVisible();
    await expect(page.getByText("Last name is required.")).toBeVisible();
    await expect(page.getByText("Email address is required.")).toBeVisible();
    await expect(page.getByText("Message is required.")).toBeVisible();
  });

  test("submit with invalid email: shows email validation error", async ({
    page,
  }) => {
    await page.locator("#contact-first-name").fill("John");
    await page.locator("#contact-last-name").fill("Doe");
    await page.locator("#contact-email").fill("not-an-email");
    await page.locator("#contact-message").fill("Test message");

    await page.locator("button[type='submit']:has-text('Send Message')").click();

    await expect(
      page.getByText("Please enter a valid email address."),
    ).toBeVisible();
  });

  test("submit with valid data: shows success message", async ({ page }) => {
    await page.locator("#contact-first-name").fill("Jane");
    await page.locator("#contact-last-name").fill("Smith");
    await page.locator("#contact-email").fill("jane@example.com");
    await page.locator("#contact-phone").fill("(303) 555-0000");
    await page
      .locator("#contact-subject")
      .selectOption("Schedule Test Drive");
    await page
      .locator("#contact-message")
      .fill("I would like to schedule a test drive for the Honda CR-V.");

    await page.locator("button[type='submit']:has-text('Send Message')").click();

    // Should show success state
    await expect(page.getByText("Message Sent!")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText(/We will get back to you/i),
    ).toBeVisible();

    // Send Another Message button
    await expect(
      page.locator("button:has-text('Send Another Message')"),
    ).toBeVisible();
  });

  test("Google Maps iframe present", async ({ page }) => {
    const iframe = page.locator("iframe[title*='Wolfpack Motors']");
    await expect(iframe).toBeVisible();
    const src = await iframe.getAttribute("src");
    expect(src).toContain("google.com/maps");
  });

  test("dealer info card: address, phone, hours visible", async ({ page }) => {
    // Address
    await expect(page.getByText("1234 Auto Drive")).toBeVisible();
    await expect(page.getByText("Denver, CO 80202")).toBeVisible();

    // Phone
    await expect(page.getByText("(303) 555-1234").first()).toBeVisible();

    // Email
    await expect(
      page.getByText("hello@wolfpackmotors.com").first(),
    ).toBeVisible();

    // Business hours
    await expect(page.getByText("Business Hours")).toBeVisible();
    await expect(page.getByText("Monday - Friday")).toBeVisible();
    await expect(page.getByText("9:00 AM - 8:00 PM")).toBeVisible();
    await expect(page.getByText("Saturday")).toBeVisible();
    await expect(page.getByText("Sunday")).toBeVisible();
  });

  test("fast response badge visible", async ({ page }) => {
    await expect(page.getByText("Fast Response")).toBeVisible();
    await expect(
      page.getByText("We respond within 1 business hour"),
    ).toBeVisible();
  });

  test("subject dropdown has all options", async ({ page }) => {
    const select = page.locator("#contact-subject");
    const options = select.locator("option");
    const count = await options.count();
    expect(count).toBe(6);

    // Check specific subjects
    const texts = await options.allTextContents();
    expect(texts).toContain("General Inquiry");
    expect(texts).toContain("Vehicle Question");
    expect(texts).toContain("Schedule Test Drive");
    expect(texts).toContain("Financing Question");
    expect(texts).toContain("Trade-In Appraisal");
    expect(texts).toContain("Service Appointment");
  });
});
