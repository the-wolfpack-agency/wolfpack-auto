/**
 * Form validation tests — verify client-side validation, submission
 * behavior, and success feedback on the contact form.
 *
 * ContactForm uses:
 *  - Fields: first_name, last_name, email, phone, subject, message
 *  - IDs:   contact-first-name, contact-last-name, contact-email,
 *           contact-phone, contact-subject, contact-message
 *  - Attribute `noValidate` on the <form> — validation is JS-driven
 *  - Required: first_name, last_name, email, message
 *  - POSTs to /api/contact
 *  - Success: shows "Message Sent!" heading
 */
import { test, expect } from "@playwright/test";

test.describe("Form validation: /contact", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/contact", { waitUntil: "domcontentloaded" });
  });

  test("submitting empty form shows validation errors (JS-driven)", async ({
    page,
  }) => {
    // The form uses noValidate, so HTML5 validation does NOT fire.
    // Instead the component renders <p role="alert"> error messages.

    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();

    // Track whether a POST request fires (it should not for an empty form)
    let formPosted = false;
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/contact")) {
        formPosted = true;
      }
    });

    await submitButton.click();
    await page.waitForTimeout(500);

    // JS validation should block submission and show role="alert" error paragraphs
    const errorAlerts = page.locator('p[role="alert"]');
    const alertCount = await errorAlerts.count();

    expect(
      !formPosted,
      "Empty form should be blocked from submission by JS validation"
    ).toBe(true);

    expect(
      alertCount,
      "Expected validation error messages (role=alert) for required fields"
    ).toBeGreaterThanOrEqual(1);
  });

  test("filling valid data and submitting fires a POST request", async ({
    page,
  }) => {
    // Intercept the contact API call
    let capturedRequest: { url: string; body: string } | null = null;

    await page.route("**/api/contact**", async (route) => {
      capturedRequest = {
        url: route.request().url(),
        body: route.request().postData() || "",
      };
      // Respond with success so the app can show feedback
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    // Fill in the form fields using the actual element IDs
    await page.locator("#contact-first-name").fill("Test");
    await page.locator("#contact-last-name").fill("User");
    await page.locator("#contact-email").fill("test@example.com");
    await page.locator("#contact-phone").fill("555-1234");
    await page.locator("#contact-message").fill(
      "This is a test message for form validation."
    );

    // Submit the form
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();
    await page.waitForTimeout(1500);

    expect(
      capturedRequest,
      "Expected a POST request to /api/contact after submitting valid data"
    ).not.toBeNull();

    // Verify the payload contains the expected fields
    if (capturedRequest) {
      const payload = JSON.parse((capturedRequest as { body: string }).body);
      expect(payload.first_name).toBe("Test");
      expect(payload.last_name).toBe("User");
      expect(payload.email).toBe("test@example.com");
    }
  });

  test("success feedback appears after valid submission", async ({ page }) => {
    // Mock the contact API to return success
    await page.route("**/api/contact**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    // Fill form with valid data using actual IDs
    await page.locator("#contact-first-name").fill("Test");
    await page.locator("#contact-last-name").fill("User");
    await page.locator("#contact-email").fill("test@example.com");
    await page.locator("#contact-message").fill("Testing success feedback.");

    // Submit
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // The component renders an h3 "Message Sent!" on success
    const successHeading = page.locator('h3:has-text("Message Sent!")');
    await expect(successHeading).toBeVisible({ timeout: 5000 });

    // Also verify the "Send Another Message" button appears
    const sendAnother = page.locator('button:has-text("Send Another Message")');
    await expect(sendAnother).toBeVisible();
  });
});
