/**
 * E2E — per-dealer module gating (the pilot's limited dashboard).
 *
 * Drives the REAL operator flow through the browser: an agency admin opens
 * Settings, limits a dealer to selected modules, and saves. Also verifies the
 * sidebar filter did not break the nav for an agency session (agency roles bypass
 * gating and must still see every module).
 *
 * The e2e webServer runs DB-less (DATABASE_URL=), so the demo session is the
 * agency "admin" role and enabled_modules resolves to null (all). That is enough
 * to prove the manager UI + save contract + agency-bypass render. The dealer-side
 * LIMITED view (a sub_dealer seeing only enabled modules) requires a seeded
 * sub_dealer user + DB; it is covered deterministically by the admin-modules unit
 * tests (isModuleVisible) and the /api/admin/modules contract tests. TODO: add the
 * seeded-sub_dealer nav assertion once the e2e seed provisions one.
 */
import { test, expect, type Page } from "@playwright/test";

/** Log in through the real admin login form with the demo (agency-admin) credential. */
async function login(page: Page): Promise<void> {
  await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"], input[type="email"]').first().fill("demo@wolfpackauto.com");
  await page.locator('input[name="password"], input[type="password"]').first().fill("demo");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/admin(\/|$)/, { timeout: 20_000 }).catch(() => {});
}

test.describe("module gating", () => {
  test("agency admin can limit a dealer's modules from Settings", async ({ page }) => {
    await login(page);

    const res = await page.goto("/admin/settings", { waitUntil: "domcontentloaded" });
    expect(res?.status(), "GET /admin/settings").toBe(200);
    expect(page.url(), "must not bounce to login").not.toContain("/admin/login");

    // The Module Access manager renders for an agency role (editable).
    const manager = page.getByTestId("module-access-manager");
    await expect(manager).toBeVisible({ timeout: 20_000 });

    // Turn the limit ON, then uncheck a specific module (Leads).
    const limitToggle = page.getByTestId("modules-limit-toggle");
    await expect(limitToggle).toBeVisible();
    if (!(await limitToggle.isChecked())) await limitToggle.check();

    const leadsToggle = page.getByTestId("module-toggle-leads");
    await expect(leadsToggle).toBeVisible();
    await leadsToggle.uncheck();

    // Dashboard is CORE — always on and disabled.
    await expect(page.getByTestId("module-toggle-dashboard")).toBeDisabled();

    // Save → success (DB-less returns { updated: true }); no error surfaced.
    await page.getByTestId("modules-save").click();
    const message = page.getByTestId("modules-message");
    await expect(message).toBeVisible({ timeout: 15_000 });
    await expect(message).toHaveText(/Saved/i);
  });

  test("agency session still sees the full nav (gating bypass didn't break it)", async ({ page }) => {
    await login(page);
    const res = await page.goto("/admin", { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(200);
    expect(page.url()).not.toContain("/admin/login");

    // The desktop sidebar renders module links across sections — proves the filter
    // did not hide everything for an agency user. Check a spread of modules.
    const sidebar = page.locator('aside[aria-label="Admin navigation desktop"]');
    await expect(sidebar).toBeVisible({ timeout: 20_000 });
    for (const href of ["/admin/leads", "/admin/payroll", "/admin/accounting"]) {
      await expect(sidebar.locator(`a[href="${href}"]`)).toHaveCount(1);
    }
  });
});
