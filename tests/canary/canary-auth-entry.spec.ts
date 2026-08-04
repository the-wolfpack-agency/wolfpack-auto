import { test, expect } from "@playwright/test";

/**
 * The pages somebody signs in through must be usable, on production, after
 * every deploy.
 *
 * WHY THIS EXISTS
 *
 * On 2026-08-03 /admin/login redirected to itself without end. A session guard
 * sends anyone receiving a 401 from an admin API to the login page; the login
 * page has no session, so its own API calls answered 401, and it redirected to
 * itself. Each hop encoded the previous URL into `next`, so the address doubled
 * every pass. The browser refreshed continuously while a client was using the
 * platform.
 *
 * Nothing caught it. The post-deploy canary was commented out "until May 1
 * (Actions minutes budget)" and never re-enabled, so for about three months no
 * check ran against production after a deploy. Unit tests passed throughout:
 * the loop only exists once a real page issues a real request and takes a real
 * redirect.
 *
 * These run against the deployed URL, which is the only place this class of
 * fault is visible.
 */

/** Every route somebody can reach without a session. */
const ENTRY_ROUTES = [
  "/admin/login",
  "/admin/accept-invite",
  "/admin/reset-password",
  "/admin/forgot-password",
];

test.describe("unauthenticated entry points", () => {
  for (const route of ENTRY_ROUTES) {
    test(`${route} settles without a redirect loop`, async ({ page }) => {
      const redirects: string[] = [];
      page.on("framenavigated", (f) => {
        if (f === page.mainFrame()) redirects.push(f.url());
      });

      const res = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(res, `${route} did not respond`).not.toBeNull();
      expect(res!.status(), `${route} must render, not error`).toBeLessThan(400);

      // Give any client-side redirect a chance to fire before judging.
      await page.waitForTimeout(3000);

      const finalUrl = new URL(page.url());

      /* The signature of the incident: the login path repeated inside its own
         query string, because `next` carried a login URL that itself carried
         one. Decode twice, since each hop encodes the last. */
      const decodedOnce = decodeURIComponent(finalUrl.search);
      const decodedTwice = decodeURIComponent(decodedOnce);
      const loginMentions = (decodedTwice.match(/\/admin\/login/g) ?? []).length;
      expect(
        loginMentions,
        `${route} ended at a URL whose query contains the login path ${loginMentions} times: ${page.url().slice(0, 200)}`,
      ).toBeLessThanOrEqual(1);

      // A URL that grows on every hop is the other tell.
      expect(
        page.url().length,
        `${route} produced a ${page.url().length}-character URL, which means it is nesting`,
      ).toBeLessThan(500);

      /* Navigations settle. A handful is normal (middleware, client router);
         a loop produces far more within three seconds. */
      expect(
        redirects.length,
        `${route} navigated ${redirects.length} times in 3s: ${redirects.slice(-3).join(" -> ").slice(0, 200)}`,
      ).toBeLessThan(6);
    });
  }

  test("/admin/login shows a usable sign-in form", async ({ page }) => {
    // A page that loads but cannot be signed in through is still an outage.
    await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('button[type="submit"]').first()).toBeVisible({ timeout: 15_000 });
  });
});

/**
 * The other half of the contract: gated surfaces must turn a stranger away.
 *
 * WHY THIS IS SEPARATE
 *
 * Until 2026-08-04 the canary had no session at all, so its 30 admin-page
 * checks were really asserting that a signed-out visitor COULD read the dealer
 * dashboard. When `DEMO_MODE` stopped waving anonymous traffic past the
 * middleware gate — the right change — those checks went red, and the red was
 * easy to misread as "the admin pages are broken".
 *
 * Now the admin checks carry a real session, and the signed-out behaviour is
 * asserted here, deliberately, in a block that never gets one. A future change
 * that re-opens the gate turns this red instead of quietly turning the rest of
 * the suite green.
 *
 * This block must never use `storageState`.
 */
const GATED_ROUTES = [
  "/admin",
  "/admin/leads",
  "/admin/deals",
  "/admin/settings",
  "/admin/agency",
];

test.describe("gated surfaces refuse a signed-out visitor", () => {
  for (const route of GATED_ROUTES) {
    test(`${route} sends a signed-out visitor to the sign-in page`, async ({
      page,
    }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });

      expect(
        page.url(),
        `${route} rendered for a visitor with no session. The admin auth gate ` +
          `is open — this is a data exposure, not a test failure.`,
      ).toContain("/admin/login");
    });
  }

  test("an admin API answers a signed-out caller with 401, not data", async ({
    request,
  }) => {
    /* A page redirect is not enough on its own. The April incident was a page
       that looked gated while its APIs answered anyway. */
    const res = await request.get("/api/admin/dealers");
    expect(
      [401, 403],
      `/api/admin/dealers answered ${res.status()} to a caller with no session`,
    ).toContain(res.status());
  });
});
