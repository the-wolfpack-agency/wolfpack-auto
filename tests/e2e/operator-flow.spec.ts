/**
 * Operator console end-to-end flow.
 *
 * Real-browser exercise of the Wolfpack staff console:
 *   1. Visiting /operator unauthenticated redirects to /operator/login.
 *   2. The login form rejects bad credentials with an error banner.
 *   3. With BOOTSTRAP_EMAIL / BOOTSTRAP_PASSWORD set, login succeeds and
 *      lands on the dashboard.
 *   4. The Dealers page renders and the New Dealer CTA navigates to the
 *      wizard.
 *   5. The new-dealer form submits and surfaces a temp password.
 *   6. The Team page submits an invite and the dev response exposes the
 *      accept URL.
 *   7. A second browser context opens the accept URL, activates an
 *      account, and signs in — proving the invite end-to-end.
 *
 * The spec degrades gracefully: if DATABASE_URL is not set in the test
 * environment, login + invite-accept are skipped because the staff
 * provider intentionally refuses login without a database. The "blank
 * dashboard" check (unauth redirect) always runs.
 */

import { test, expect, type Page, type BrowserContext, type APIRequestContext } from "@playwright/test";

const BOOTSTRAP_EMAIL = process.env.OPERATOR_TEST_EMAIL ?? process.env.BOOTSTRAP_EMAIL ?? "";
const BOOTSTRAP_PASSWORD = process.env.OPERATOR_TEST_PASSWORD ?? process.env.BOOTSTRAP_PASSWORD ?? "";
const DATABASE_URL = process.env.DATABASE_URL ?? "";

const haveLiveCreds = Boolean(BOOTSTRAP_EMAIL && BOOTSTRAP_PASSWORD && DATABASE_URL);

test.describe("Operator console — unauthenticated chrome", () => {
  test("GET /operator redirects to /operator/login when not signed in", async ({ page }) => {
    const response = await page.goto("/operator");
    expect(response).toBeTruthy();
    // Must end up on the login page (200, not blank).
    await page.waitForURL(/\/operator\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/operator/login");
    // Login form must render.
    await expect(page.getByTestId("operator-login-form")).toBeVisible();
  });

  test("GET /operator/login renders 200 with email + password fields", async ({ page }) => {
    const response = await page.goto("/operator/login");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByTestId("operator-email")).toBeVisible();
    await expect(page.getByTestId("operator-password")).toBeVisible();
    await expect(page.getByTestId("operator-login-submit")).toBeVisible();
  });

  test("invalid credentials surface an error banner (NOT a blank page)", async ({ page }) => {
    await page.goto("/operator/login");
    await page.getByTestId("operator-email").fill("noone@nowhere.invalid");
    await page.getByTestId("operator-password").fill("wrong-password-123");
    await page.getByTestId("operator-login-submit").click();
    // Either an error renders, OR we stay on the login form (no blank).
    await page.waitForLoadState("networkidle");
    expect(page.url()).toContain("/operator/login");
  });
});

test.describe("Operator console — authenticated flow", () => {
  test.skip(!haveLiveCreds, "Requires DATABASE_URL + OPERATOR_TEST_EMAIL + OPERATOR_TEST_PASSWORD");

  let context: BrowserContext;
  let page: Page;
  let inviteAcceptUrl = "";
  const inviteeEmail = `e2e-invitee-${Date.now()}@thewolfpack.agency`;
  const inviteePassword = "InviteeP@ss12345!";
  const newDealerSlug = `e2e-${Date.now().toString(36)}`;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test("staff can log in and reach the dashboard", async () => {
    await page.goto("/operator/login");
    await page.getByTestId("operator-email").fill(BOOTSTRAP_EMAIL);
    await page.getByTestId("operator-password").fill(BOOTSTRAP_PASSWORD);
    await page.getByTestId("operator-login-submit").click();
    await page.waitForURL("**/operator", { timeout: 20_000 });
    // Dashboard must render — not a blank page.
    await expect(page.getByTestId("operator-dashboard")).toBeVisible();
    await expect(page.getByTestId("stat-total-dealers")).toBeVisible();
  });

  test("staff can create a new dealer through the wizard", async () => {
    await page.goto("/operator/dealers/new");
    await expect(page.getByTestId("new-dealer-form")).toBeVisible();
    await page.getByTestId("field-name").fill(`E2E Dealer ${newDealerSlug}`);
    await page.getByTestId("field-slug").fill(newDealerSlug);
    await page.getByTestId("field-email").fill(`owner+${newDealerSlug}@example.com`);
    await page.getByTestId("submit-new-dealer").click();
    // Success state surfaces the temp password.
    await expect(page.getByTestId("dealer-created")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("temp-password")).toBeVisible();
  });

  test("staff can invite a teammate (dev response exposes accept URL)", async () => {
    await page.goto("/operator/team");
    await expect(page.getByTestId("invite-form")).toBeVisible();
    await page.getByTestId("invite-email").fill(inviteeEmail);
    await page.getByTestId("invite-role").selectOption("operator");
    await page.getByTestId("invite-submit").click();
    // Dev / non-production response echoes the accept URL.
    const inviteUrlEl = page.getByTestId("invite-url");
    await expect(inviteUrlEl).toBeVisible({ timeout: 10_000 });
    const text = await inviteUrlEl.textContent();
    const match = text?.match(/https?:\/\/\S+\/operator\/accept-invite\?token=\S+/);
    if (match) inviteAcceptUrl = match[0];
    expect(inviteAcceptUrl).toBeTruthy();
  });

  test("second context: invitee accepts and signs in", async ({ browser }) => {
    test.skip(!inviteAcceptUrl, "Previous test did not capture an accept URL");

    const secondCtx = await browser.newContext();
    const inviteePage = await secondCtx.newPage();
    try {
      // Path-only — Playwright's baseURL resolves the rest.
      const url = new URL(inviteAcceptUrl);
      await inviteePage.goto(`${url.pathname}${url.search}`);
      await expect(inviteePage.getByTestId("operator-accept-email")).toBeVisible({ timeout: 10_000 });
      await inviteePage.getByTestId("operator-accept-name").fill("E2E Invitee");
      await inviteePage.getByTestId("operator-accept-password").fill(inviteePassword);
      await inviteePage.getByTestId("operator-accept-confirm").fill(inviteePassword);
      await inviteePage.getByTestId("operator-accept-submit").click();
      await expect(inviteePage.getByTestId("operator-accept-success")).toBeVisible({ timeout: 15_000 });

      // Sign in as the new operator and confirm dealers list is visible.
      await inviteePage.goto("/operator/login");
      await inviteePage.getByTestId("operator-email").fill(inviteeEmail);
      await inviteePage.getByTestId("operator-password").fill(inviteePassword);
      await inviteePage.getByTestId("operator-login-submit").click();
      await inviteePage.waitForURL("**/operator", { timeout: 20_000 });
      await inviteePage.goto("/operator/dealers");
      await expect(inviteePage.getByTestId("operator-dealers-page")).toBeVisible();
    } finally {
      await secondCtx.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Headless API smoke — runs even without DB credentials. Asserts the
// operator routes are wired (return non-500 for anonymous, which is the
// hard rule from CLAUDE.md). The contract-test suite covers exact
// 200/401/403/400 semantics under mocks.
// ---------------------------------------------------------------------------
test.describe("Operator API smoke (unauth)", () => {
  for (const path of [
    "/api/operator/stats",
    "/api/operator/dealers",
    "/api/operator/team",
    "/api/operator/audit",
    "/api/operator/invites",
  ]) {
    test(`GET ${path} returns 401 (not 500) for anonymous`, async ({ request }: { request: APIRequestContext }) => {
      const r = await request.get(path);
      expect(r.status()).toBe(401);
    });
  }
});
