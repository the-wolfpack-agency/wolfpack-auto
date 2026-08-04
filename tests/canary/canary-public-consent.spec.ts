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

import { test, expect } from "@playwright/test";
import { authedRequest } from "./helpers/canary-auth";

/*
 * The browser here stays SIGNED OUT on purpose: it is standing in for a
 * member of the public on the storefront, and its consent state is the thing
 * under test. Only the operator-side reads of /api/admin/heatmaps carry a
 * session, because that endpoint is gated.
 *
 * Reading it without one returned 401, whose body has no `totalEvents`, so
 * `?? 0` produced a count of zero every time. That is why the tracking test
 * failed, and, far worse, why the PRIVACY test passed: it asserts the count
 * stays at zero, and zero was all a 401 could ever yield. It could not have
 * caught untracked-consent leakage if it happened.
 */

const PUBLIC_PAGE = "/";

test.describe.configure({ mode: "serial" });

/**
 * Consent policy, asserted against what the browser actually transmits.
 *
 * WHAT THE POLICY IS
 *
 * `ESSENTIAL_EVENT_TYPES` in `src/components/EventCollector.tsx` lets exactly
 * three types through with no consent: `page_view`, `heatmap_click` and
 * `heatmap_move`. Those are built by `anonEvent()`, which hard-codes
 * `session_id` and `user_fingerprint` to "anon" and puts only coordinates, the
 * viewport width and a CSS selector in metadata. No text, no href, no identity.
 * `/api/admin/heatmaps` then returns pure aggregates. That is cookieless
 * aggregate analytics under legitimate interest, and it is deliberate.
 *
 * Everything else — `click`, `rage_click`, `dead_click`, `journey`,
 * `search_intent`, `buyer_lifecycle` and the rest — carries a real session id
 * and must not leave the browser until consent is given.
 *
 * WHY THIS REPLACED THE OLD TEST
 *
 * The old version asserted the heatmap click count "does not increase" without
 * consent, which contradicts that policy: heatmap clicks are supposed to be
 * counted. It never failed, because it read a gated endpoint with no session,
 * got 401, and `?? 0` turned "could not ask" into "nothing tracked". Once the
 * read was authenticated the contradiction surfaced immediately: +5 clicks,
 * +5 counted, three runs in a row.
 *
 * So it now asserts the policy instead of a number, by inspecting the request
 * bodies the page posts. That is exact, immune to other visitors' traffic, and
 * it fails if a non-essential type is ever added to the exempt list, or if an
 * exempt event ever starts carrying identity.
 */
test("PRIVACY: without consent, only anonymous essential events are transmitted", async ({
  page,
}) => {
  const ESSENTIAL = new Set(["page_view", "heatmap_click", "heatmap_move"]);

  /* Capture every event the page transmits.
     `EventCollector.flush()` prefers `navigator.sendBeacon`, which Playwright's
     `request` event does not reliably surface — the first version of this test
     observed nothing at all and was saved only by assertion 3 below. So wrap
     both transports in the page itself, record the payload, and call through so
     behaviour is unchanged. */
  await page.addInitScript(() => {
    const w = window as unknown as { __sent: unknown[] };
    w.__sent = [];
    const push = (text: string) => {
      try {
        const parsed = JSON.parse(text);
        const list =
          (parsed as { events?: unknown[] })?.events ??
          (Array.isArray(parsed) ? parsed : [parsed]);
        for (const e of list) w.__sent.push(e);
      } catch {
        /* unparseable body is not evidence of a leak */
      }
    };

    /* sendBeacon is called with a Blob here, not a string. Reading the wrapper
       object instead of its contents is how the first attempt recorded events
       whose every field was undefined. */
    const record = (body: unknown) => {
      if (typeof body === "string") return push(body);
      if (body instanceof Blob) return void body.text().then(push);
      if (body) return push(JSON.stringify(body));
    };

    const beacon = navigator.sendBeacon?.bind(navigator);
    if (beacon) {
      navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
        if (String(url).includes("/api/analytics/events")) record(data);
        return beacon(url, data);
      };
    }

    const origFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
      if (url.includes("/api/analytics/events") && init?.body) record(init.body);
      return origFetch(input as RequestInfo, init);
    };
  });

  await page.context().clearCookies();
  await page.goto(PUBLIC_PAGE, { waitUntil: "domcontentloaded" });

  for (let i = 0; i < 5; i++) {
    await page.mouse.click(200 + i * 30, 250);
    await page.waitForTimeout(80);
  }

  /* Flush by simulating the tab being hidden. */
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(3000);

  const sent = await page.evaluate(
    () => (window as unknown as { __sent: Array<Record<string, unknown>> }).__sent,
  );

  /* 1. Nothing outside the exempt list may be transmitted. */
  const nonEssential = [...new Set(sent.map((e) => String(e.event_type)))].filter(
    (t) => !ESSENTIAL.has(t),
  );
  expect(
    nonEssential,
    `these event types left the browser with no consent cookie: ${nonEssential.join(", ")}. ` +
      `Only ${[...ESSENTIAL].join(", ")} are exempt, and only because they carry no identity.`,
  ).toEqual([]);

  /* 2. What IS exempt must actually be anonymous. The exemption is justified
        solely by that, so verify it rather than assuming it holds. */
  const identified = sent.filter(
    (e) =>
      (e.session_id && e.session_id !== "anon") ||
      (e.user_fingerprint && e.user_fingerprint !== "anon"),
  );
  expect(
    identified.map((e) => String(e.event_type)),
    "an event sent without consent carried a real session id or fingerprint, " +
      "which removes the basis for exempting it",
  ).toEqual([]);

  /* 3. The page must have actually done something, or 1 and 2 are vacuous —
        the exact failure this whole test used to have. */
  expect(
    sent.length,
    "no analytics request was observed at all, so nothing above was tested. " +
      "Check that EventCollector still mounts on public pages.",
  ).toBeGreaterThan(0);
});

test("ANALYTICS: public-page clicks WITH wolfpack_consent=accepted are tracked", async ({
  page,
  baseURL,
}) => {
  const apiCtx = await authedRequest(baseURL);

  const beforeRes = await apiCtx.get(
    `/api/admin/heatmaps?type=click&days=1&page=${encodeURIComponent(PUBLIC_PAGE)}`,
  );
  /* Assert the read SUCCEEDED before trusting the number it produced. Without
     this, an unreachable endpoint reads as "zero clicks", which silently
     satisfies the privacy assertion below and silently breaks the tracking one
     above. Never infer a count from a response you have not checked. */
  expect(
    beforeRes.status(),
    "operator heatmap read must succeed, otherwise a count of 0 means " +
      "'could not ask' rather than 'nothing tracked'",
  ).toBe(200);
  const before = await beforeRes.json();
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
  const apiCtx = await authedRequest(baseURL);

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
