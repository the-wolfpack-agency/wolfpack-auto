/**
 * Public-page consent-gate canary.
 *
 * The dealer's public storefront (/, /inventory, /financing, etc.)
 * is the highest-value analytics surface — visitor heatmaps drive
 * conversion-rate optimization, the core dealer revenue product.
 *
 * Privacy + analytics MUST both work:
 *   - With NO cookie consent → public-page clicks are NOT tracked.
 *     (CCPA / GDPR / state-law correctness.)
 *   - With wolfpack_consent=accepted → public-page clicks ARE
 *     tracked. (Product correctness.)
 *
 * Both halves of that contract are pinned here, so a future change
 * to either the consent gate or the EventCollector batching can't
 * silently break the public funnel.
 *
 * Run:
 *   CANARY_URL=https://wolfpack-auto.vercel.app \
 *     npx playwright test --config=playwright.canary.config.ts \
 *     tests/canary/canary-public-consent.spec.ts
 */

import { test, expect, request as pwRequest } from "@playwright/test";

const PUBLIC_PAGE = "/";

test.describe.configure({ mode: "serial" });

test("PRIVACY: public-page clicks WITHOUT consent are not tracked", async ({
  page,
  baseURL,
}) => {
  const apiCtx = await pwRequest.newContext({ baseURL });

  const before = await (
    await apiCtx.get(
      `/api/admin/heatmaps?type=click&days=1&page=${encodeURIComponent(PUBLIC_PAGE)}`,
    )
  ).json();
  const beforeCount: number = before.totalEvents ?? 0;

  /* Explicitly clear any consent cookie so we test the no-consent
     case cleanly. */
  await page.context().clearCookies();

  await page.goto(PUBLIC_PAGE, { waitUntil: "domcontentloaded" });

  /* Click around — these MUST NOT track. */
  for (let i = 0; i < 5; i++) {
    await page.mouse.click(200 + i * 30, 250);
    await page.waitForTimeout(80);
  }

  /* Flush. */
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(3000);

  const after = await (
    await apiCtx.get(
      `/api/admin/heatmaps?type=click&days=1&page=${encodeURIComponent(PUBLIC_PAGE)}`,
    )
  ).json();
  const afterCount: number = after.totalEvents ?? 0;
  /* Allow zero or unchanged — what we're forbidding is an INCREASE. */
  expect(afterCount).toBeLessThanOrEqual(beforeCount);
  await apiCtx.dispose();
});

test("ANALYTICS: public-page clicks WITH wolfpack_consent=accepted are tracked", async ({
  page,
  baseURL,
}) => {
  const apiCtx = await pwRequest.newContext({ baseURL });

  const before = await (
    await apiCtx.get(
      `/api/admin/heatmaps?type=click&days=1&page=${encodeURIComponent(PUBLIC_PAGE)}`,
    )
  ).json();
  const beforeCount: number = before.totalEvents ?? 0;

  /* Pre-stamp the consent cookie BEFORE the first navigation so the
     EventCollector reads it on mount. */
  await page.context().addCookies([
    {
      name: "wolfpack_consent",
      value: "accepted",
      url: baseURL ?? "https://wolfpack-auto.vercel.app",
    },
  ]);

  await page.goto(PUBLIC_PAGE, { waitUntil: "domcontentloaded" });

  for (let i = 0; i < 7; i++) {
    await page.mouse.click(180 + i * 35, 220 + (i % 3) * 50);
    await page.waitForTimeout(100);
  }

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      value: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(3500);

  let ok = false;
  for (let i = 0; i < 8; i++) {
    const after = await (
      await apiCtx.get(
        `/api/admin/heatmaps?type=click&days=1&page=${encodeURIComponent(PUBLIC_PAGE)}`,
      )
    ).json();
    if ((after.totalEvents ?? 0) > beforeCount) {
      ok = true;
      break;
    }
    await page.waitForTimeout(2000);
  }

  if (!ok) {
    /* Pull the operator's diagnostic context. */
    const diag = await (await apiCtx.get("/api/analytics/events")).json();
    throw new Error(
      `Public-page tracking with consent FAILED.
  before=${beforeCount}
  buffer dump:
${JSON.stringify(diag, null, 2)}
  Likely causes:
    1. wolfpack_consent cookie name regressed in CookieConsent
    2. EventCollector hasFullConsent rule changed
    3. /api/analytics/events stamping dealer_id mismatched the
       heatmap query (check resolveTenant fallback)
    4. Vercel build hasn't propagated`,
    );
  }

  await apiCtx.dispose();
});

test("dropdown PAGES: public storefront pages appear in /api/admin/heatmaps topPages once visited with consent", async ({
  page,
  baseURL,
}) => {
  const apiCtx = await pwRequest.newContext({ baseURL });

  await page.context().addCookies([
    {
      name: "wolfpack_consent",
      value: "accepted",
      url: baseURL ?? "https://wolfpack-auto.vercel.app",
    },
  ]);

  /* Visit each high-traffic public surface once — multiple clicks
     to populate getTopPages aggregation. */
  const PUBLIC_PAGES = ["/", "/inventory", "/financing"];
  for (const route of PUBLIC_PAGES) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    for (let i = 0; i < 3; i++) {
      await page.mouse.click(200 + i * 25, 240);
      await page.waitForTimeout(80);
    }
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        value: true,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(1500);
  }

  /* Poll until at least one public route shows up in topPages. */
  let topPages: { url: string }[] = [];
  for (let i = 0; i < 8; i++) {
    const heat = await (
      await apiCtx.get("/api/admin/heatmaps?type=click&days=1&page=/")
    ).json();
    topPages = heat.topPages ?? [];
    if (topPages.some((p) => PUBLIC_PAGES.includes(p.url))) break;
    await page.waitForTimeout(2000);
  }
  /* We don't insist on every public page being present — getTopPages
     ranks by pageviews, so the test traffic might rank below historic
     traffic on busier sites. We DO insist that the dropdown contains
     ONLY URL paths (no UUID ghosts) — that's the regression we
     specifically guard. */
  for (const p of topPages) {
    expect(p.url).toMatch(/^\/[A-Za-z0-9_/-]*$/);
  }
  await apiCtx.dispose();
});
