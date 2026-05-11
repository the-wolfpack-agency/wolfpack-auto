/**
 * Pre-Qualification Wizard E2E -- happy-path through all 4 steps.
 *
 * Asserts:
 *   - Page loads with HTTP 200 (not just "not 500" -- 401s blank pages)
 *   - No CSP violations in browser console
 *   - All 4 step indicators render
 *   - Wizard transitions: identity -> credit -> income -> offers
 *   - Offers list renders with non-zero content
 *   - Continue-at-dealership token + copy button visible
 *
 * The API is stubbed via route.fulfill() so this E2E runs against the dev
 * server without requiring a real Postgres / credit bureau backend.
 */

import { test, expect, type Page } from "@playwright/test";

const FAKE_SESSION_ID = "11111111-2222-3333-4444-555555555555";

async function stubPrequalApis(page: Page) {
  // POST /api/prequal/start -> 201 with a session id
  await page.route("**/api/prequal/start", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        session_id: FAKE_SESSION_ID,
        started_at: new Date().toISOString(),
      }),
    });
  });

  // POST /api/prequal/[id]/credit -> 200
  await page.route(`**/api/prequal/${FAKE_SESSION_ID}/credit`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        tier: "prime",
        score_range_min: 700,
        score_range_max: 750,
        bureau_used: "mock",
        is_mock: true,
      }),
    });
  });

  // POST /api/prequal/[id]/income -> 200
  await page.route(`**/api/prequal/${FAKE_SESSION_ID}/income`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        income_monthly_cents: 700_000,
        confidence: "self_reported",
      }),
    });
  });

  // GET /api/prequal/[id]/offers -> 200 with 2 offers
  await page.route(`**/api/prequal/${FAKE_SESSION_ID}/offers`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        session_id: FAKE_SESSION_ID,
        offer_count: 2,
        offers: [
          {
            lender_id: "captive-oem-finance",
            lender_name: "Captive OEM Finance",
            max_amount_cents: 3_500_000,
            apr_bps: 449,
            term_months: 60,
            conditions: { min_credit_tier: "prime" },
            expires_at: new Date(Date.now() + 14 * 86400 * 1000).toISOString(),
            estimated_monthly_payment_cents: 65_000,
          },
          {
            lender_id: "prime-bank",
            lenderName: "Prime Bank Auto",
            lender_name: "Prime Bank Auto",
            max_amount_cents: 3_400_000,
            apr_bps: 699,
            term_months: 72,
            conditions: { min_credit_tier: "prime" },
            expires_at: new Date(Date.now() + 14 * 86400 * 1000).toISOString(),
            estimated_monthly_payment_cents: 58_000,
          },
        ],
        vehicle: {
          interest_text: "2023 Toyota Tacoma",
          estimated_price_cents: 5_500_000,
        },
      }),
    });
  });
}

test.describe("Pre-Qualification Wizard", () => {
  test("happy-path: identity -> credit -> income -> offers", async ({ page }) => {
    const cspViolations: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && /content security policy/i.test(msg.text())) {
        cspViolations.push(msg.text());
      }
    });

    await stubPrequalApis(page);

    // 200 not just "not 500" -- 401s blank the page.
    const resp = await page.goto("/pre-qual");
    expect(resp?.status()).toBe(200);

    // Wizard root + step 1 visible
    await expect(page.getByTestId("prequal-wizard")).toBeVisible();
    await expect(page.getByTestId("prequal-step-1")).toBeVisible();
    await expect(page.getByTestId("prequal-step-1-indicator")).toBeVisible();
    await expect(page.getByTestId("prequal-step-2-indicator")).toBeVisible();
    await expect(page.getByTestId("prequal-step-3-indicator")).toBeVisible();
    await expect(page.getByTestId("prequal-step-4-indicator")).toBeVisible();

    // Step 1: fill identity
    await page.getByTestId("prequal-input-name").fill("Alex Tester");
    await page.getByTestId("prequal-input-email").fill("alex@example.com");
    await page.getByTestId("prequal-input-phone").fill("+15555550100");
    await page.getByTestId("prequal-input-vehicle").fill("2023 Toyota Tacoma");
    await page.getByTestId("prequal-step-1-continue").click();

    // Step 2: consent + run soft credit
    await expect(page.getByTestId("prequal-step-2")).toBeVisible();
    await page.getByTestId("prequal-credit-consent").check();
    await page.getByTestId("prequal-step-2-continue").click();

    // Step 3: income
    await expect(page.getByTestId("prequal-step-3")).toBeVisible();
    await expect(page.getByTestId("prequal-credit-tier-banner")).toContainText(
      "Good credit",
    );
    await page.getByTestId("prequal-input-income-amount").fill("7000");
    await page.getByTestId("prequal-input-income-cadence").selectOption("monthly");
    await page.getByTestId("prequal-step-3-continue").click();

    // Step 4: offers
    await expect(page.getByTestId("prequal-step-4")).toBeVisible();
    await expect(page.getByTestId("prequal-offers-list")).toBeVisible();
    await expect(
      page.getByTestId("prequal-offer-captive-oem-finance"),
    ).toBeVisible();
    await expect(
      page.getByTestId("prequal-offer-prime-bank"),
    ).toBeVisible();
    await expect(
      page.getByTestId("prequal-offer-captive-oem-finance-apr"),
    ).toContainText("%");

    // Continue-token + copy button
    await expect(page.getByTestId("prequal-continue-token")).toBeVisible();
    await expect(page.getByTestId("prequal-continue-copy")).toBeVisible();

    // No CSP violations during the run.
    expect(cspViolations).toEqual([]);
  });

  test("client-side validation blocks step 1 continue when required fields are empty", async ({ page }) => {
    await stubPrequalApis(page);
    const resp = await page.goto("/pre-qual");
    expect(resp?.status()).toBe(200);

    await expect(page.getByTestId("prequal-step-1-continue")).toBeDisabled();
  });
});
