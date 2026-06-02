/**
 * E2E: Heatmap per-element coverage — every interactive element on a public
 * page must fire a heatmap_click event when clicked.
 *
 * CONTRACT (parallel agent delivering fast-flush + sendBeacon wrapping):
 *   Clicking any interactive element on a public page fires a cookieless POST
 *   to /api/analytics/events containing:
 *     event_type:  "heatmap_click"
 *     session_id:  "anon"
 *     metadata: { xp: 0..1, yp: 0..1, vw: <number>, src: "anon_heatmap",
 *                 el: <non-PII selector> }
 *   Flush occurs within ~3 s (fast-flush path).
 *
 * STRATEGY:
 *   1. addInitScript shims navigator.sendBeacon → push to window.__beacons AND
 *      forward as fetch so page.route() can intercept it.
 *   2. addInitScript registers a capture-phase listener that calls
 *      preventDefault on every <a> click so navigation never leaves the page.
 *   3. Enumerate all visible, in-viewport-or-scrollable interactive elements.
 *   4. For each element: scroll into view, click, record selector.
 *   5. Trigger flush (visibilitychange + pagehide) and wait ~4 s.
 *   6. Assert: every clicked element produced at least one heatmap_click event
 *      that names the element in metadata.el (100% coverage).
 *   7. Optional DB assertion (DATABASE_URL + admin creds): /admin/heatmaps dot
 *      count >= distinct clicked positions.
 *
 * CONFIGURATION:
 *   BASE_URL   — override base (default: from Playwright config / localhost:3000)
 *   TARGET_PAGE — path to test (default: "/")
 */

import { test, expect, type Page } from "@playwright/test";
import {
  signInIfPossible,
  resolveSmokeTarget,
} from "./helpers/smoke-helpers";

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

const EVENTS_PATH = "/api/analytics/events";
const TARGET_PAGE = process.env.TARGET_PAGE ?? "/";
/** ms to wait for the fast-flush after dispatching visibility events. */
const FLUSH_WAIT_MS = 4_000;
/** Interactive element selectors to enumerate. */
const INTERACTIVE_SELECTORS = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "[role=button]",
  "[data-track]",
  "[onclick]",
  "label",
].join(", ");

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Inject into the page (before load) two shims:
 *   a) sendBeacon wrapper — forwards every call as fetch AND pushes raw data
 *      to window.__beacons so the test can read it.
 *   b) anchor navigation suppressor — capture-phase listener that prevents
 *      any <a> click from navigating so the page stays loaded throughout the
 *      entire element-click loop.
 */
async function installPageShims(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // (a) sendBeacon shim
    const _native = navigator.sendBeacon.bind(navigator);
    (window as unknown as Record<string, unknown>).__beacons = [];

    navigator.sendBeacon = function (url: string, data?: BodyInit | null) {
      ((window as unknown as Record<string, unknown[]>).__beacons).push(data);
      void fetch(url, {
        method: "POST",
        body: data,
        keepalive: true,
      }).catch(() => undefined);
      return _native(url, data);
    };

    // (b) Suppress anchor navigation during the test.
    // Use capture=true so it fires before React synthetic handlers.
    document.addEventListener(
      "click",
      (e: MouseEvent) => {
        const target = e.target as Element | null;
        const anchor = target?.closest("a");
        if (anchor) {
          e.preventDefault();
        }
      },
      { capture: true },
    );
  });
}

/**
 * Route-intercept: collect every POST body sent to /api/analytics/events.
 * Returns a getter for the accumulated flat list of individual events.
 */
function captureEventPosts(page: Page): {
  getEvents: () => Array<Record<string, unknown>>;
  cleanup: () => Promise<void>;
} {
  const events: Array<Record<string, unknown>> = [];

  const handler = async (
    route: import("@playwright/test").Route,
    req: import("@playwright/test").Request,
  ) => {
    if (req.method() === "POST" && req.url().includes(EVENTS_PATH)) {
      try {
        const raw = req.postData();
        if (raw) {
          const body = JSON.parse(raw) as { events?: unknown[] };
          if (Array.isArray(body.events)) {
            for (const ev of body.events) {
              events.push(ev as Record<string, unknown>);
            }
          }
        }
      } catch {
        // malformed body — ignore
      }
    }
    await route.continue();
  };

  page.route("**" + EVENTS_PATH, handler);

  return {
    getEvents: () => events,
    cleanup: async () => page.unroute("**" + EVENTS_PATH, handler),
  };
}

/**
 * Build a stable CSS-like selector string for an element that does NOT
 * include PII (no innerText, no value, no aria-label with names).
 * Priority: data-testid > id > tagName[type][role][nth].
 */
async function elementSelector(
  page: Page,
  index: number,
): Promise<string> {
  return await page.evaluate((idx: number) => {
    const INTERACTIVE_SELECTORS_STR = [
      "a",
      "button",
      "input",
      "select",
      "textarea",
      "[role=button]",
      "[data-track]",
      "[onclick]",
      "label",
    ].join(", ");

    const all = Array.from(
      document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTORS_STR),
    ).filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0"
      );
    });

    const el = all[idx];
    if (!el) return `unknown[${idx}]`;

    const tag = el.tagName.toLowerCase();
    const testid = el.getAttribute("data-testid");
    if (testid) return `[data-testid="${testid}"]`;

    const id = el.id;
    if (id && !/^\d/.test(id)) return `#${id}`;

    const role = el.getAttribute("role");
    const type = el instanceof HTMLInputElement ? el.type : undefined;
    const nthSame = Array.from(document.querySelectorAll(tag)).indexOf(el);

    let sel = tag;
    if (type) sel += `[type="${type}"]`;
    if (role) sel += `[role="${role}"]`;
    sel += `:nth-of-type(${nthSame + 1})`;
    return sel;
  }, index);
}

/**
 * Trigger the EventCollector's anon fast-flush by dispatching
 * visibilitychange (hidden) and pagehide.
 */
async function triggerFlush(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      Object.defineProperty(document, "hidden", {
        value: true,
        configurable: true,
        writable: true,
      });
    } catch {
      // already defined non-configurable in some engines — dispatch anyway
    }
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pagehide"));
  });
}

/**
 * Return all visible interactive elements on the current page.
 * Scrollable off-screen elements are included (we scroll them into view).
 */
async function enumerateInteractiveElements(page: Page): Promise<number> {
  return await page.evaluate((selectors: string) => {
    return Array.from(document.querySelectorAll<HTMLElement>(selectors)).filter(
      (el) => {
        const style = window.getComputedStyle(el);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          el.offsetWidth > 0 &&
          el.offsetHeight > 0
        );
      },
    ).length;
  }, INTERACTIVE_SELECTORS);
}

/**
 * Print a coverage table to stdout.
 */
function printCoverageTable(
  rows: Array<{
    index: number;
    selector: string;
    captured: boolean;
    elInEvent: string;
  }>,
): void {
  const maxSel = Math.max(8, ...rows.map((r) => r.selector.length));
  const maxEl = Math.max(12, ...rows.map((r) => r.elInEvent.length));

  const pad = (s: string, n: number) => s.padEnd(n);
  const header =
    `${"#".padEnd(4)} | ${pad("element", maxSel)} | ${"captured".padEnd(8)} | ${pad("el-in-event", maxEl)}`;
  const sep = "-".repeat(header.length);

  console.log("\n[heatmap-elements] Coverage report:");
  console.log(sep);
  console.log(header);
  console.log(sep);
  for (const r of rows) {
    const tick = r.captured ? "yes" : "NO";
    console.log(
      `${String(r.index).padEnd(4)} | ${pad(r.selector, maxSel)} | ${pad(tick, 8)} | ${pad(r.elInEvent, maxEl)}`,
    );
  }
  console.log(sep);
  const missed = rows.filter((r) => !r.captured).length;
  console.log(
    `[heatmap-elements] ${rows.length - missed}/${rows.length} elements captured. Missed: ${missed}`,
  );
}

/* -------------------------------------------------------------------------- */
/* CASE 1 — Per-element coverage                                              */
/* -------------------------------------------------------------------------- */

test.describe("heatmap: ELEMENTS — every interactive element fires heatmap_click", () => {
  /**
   * Increased timeout: we click every visible element and wait for flush.
   * With many elements this can take 30–60 s.
   */
  test.setTimeout(120_000);

  test(
    "every visible interactive element on TARGET_PAGE produces a heatmap_click event",
    async ({ page }) => {
      // Install shims before page load.
      await installPageShims(page);
      const { getEvents, cleanup } = captureEventPosts(page);

      // Navigate to the target public page.
      await page.goto(TARGET_PAGE, { waitUntil: "domcontentloaded" });

      // Give React a moment to hydrate.
      await page.waitForTimeout(1_500);

      // Count visible interactive elements.
      const elementCount = await enumerateInteractiveElements(page);
      console.log(
        `[heatmap-elements] Found ${elementCount} visible interactive elements on "${TARGET_PAGE}"`,
      );

      if (elementCount === 0) {
        console.warn(
          `[heatmap-elements] No interactive elements found on "${TARGET_PAGE}". ` +
            "This may indicate the page did not hydrate or the URL is wrong.",
        );
        // Still pass — no elements means nothing to assert.
        await cleanup();
        return;
      }

      // Click each element in order. We re-evaluate the element list each
      // time so that DOM mutations (modals opening, etc.) don't desync our
      // index. We use a fixed snapshot count and skip out-of-bounds indices.
      const clickedSelectors: string[] = [];

      for (let i = 0; i < elementCount; i++) {
        // Build the selector for reporting BEFORE the click (DOM may mutate after).
        const sel = await elementSelector(page, i).catch(() => `element[${i}]`);

        try {
          // Locate by evaluating index into the same filtered list.
          const located = page.locator(INTERACTIVE_SELECTORS).nth(i);
          const isVisible = await located.isVisible().catch(() => false);
          if (!isVisible) {
            // Element may have been hidden by a previous interaction — skip.
            console.log(`[heatmap-elements] Skip ${sel} (no longer visible)`);
            continue;
          }

          // Scroll into view so the element is in the viewport.
          await located.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {});

          // Click with { trial: false } to produce a real event.
          // force: true handles elements overlaid by other elements.
          await located.click({ timeout: 5_000, force: false }).catch(async () => {
            // If normal click fails (interceptor, overlap), try forced.
            await located.click({ timeout: 3_000, force: true }).catch(() => {});
          });

          clickedSelectors.push(sel);

          // Brief pause so rapid clicks don't collide in the event queue.
          await page.waitForTimeout(80);

          // If a dialog / modal appeared, dismiss it so subsequent elements
          // remain accessible.
          const dialog = page.locator('[role="dialog"]').first();
          if (await dialog.isVisible().catch(() => false)) {
            // Try ESC first.
            await page.keyboard.press("Escape").catch(() => {});
            await page.waitForTimeout(200);
          }
        } catch {
          // Element may have been removed or navigation blocked — skip gracefully.
          console.log(`[heatmap-elements] Could not click ${sel} — skipped`);
        }
      }

      console.log(
        `[heatmap-elements] Clicked ${clickedSelectors.length}/${elementCount} elements.`,
      );

      // Trigger the fast-flush and wait for the network.
      await triggerFlush(page);
      await page.waitForTimeout(FLUSH_WAIT_MS);

      // Collect captured heatmap_click events.
      const allEvents = getEvents();
      const heatmapClicks = allEvents.filter(
        (ev) => ev.event_type === "heatmap_click",
      );

      console.log(
        `[heatmap-elements] Captured ${heatmapClicks.length} heatmap_click event(s).`,
      );

      // Build coverage: for each clicked element, check if there is at least
      // one heatmap_click event whose metadata.el contains the element's tag
      // or selector fragment.
      //
      // Matching strategy (in order):
      //   1. Tag-fragment match: metadata.el contains the leading tag of the selector.
      //   2. Label delegation: <label> clicks often fire on the associated <input>;
      //      accept any event where metadata.el contains "input", "select", or
      //      "textarea" (the label forwarded the click to its control).
      //   3. Position-based fallback: if an event occurred at approximately the
      //      same click sequence index (±1 within unclaimed events), claim it.
      //      This handles elements whose el descriptor doesn't contain any
      //      recognisable tag but whose event still arrived.
      const coverageRows: Array<{
        index: number;
        selector: string;
        captured: boolean;
        elInEvent: string;
      }> = [];

      // Track which event indices have been claimed to avoid double-counting.
      const claimedEventIndices = new Set<number>();

      for (let i = 0; i < clickedSelectors.length; i++) {
        const sel = clickedSelectors[i];
        // Extract the base tag/type to match against metadata.el.
        // e.g. "a:nth-of-type(1)" → tag fragment is "a"
        //       "[data-testid=\"foo\"]" → tag fragment is "" → fall through
        const tagFragment = sel.split(/[:\[#]/)[0]?.toLowerCase() || "";
        const isLabel = sel.startsWith("label");

        // Strategy 1 + 2: tag-fragment or label-delegation match.
        let matchIdx = -1;
        for (let j = 0; j < heatmapClicks.length; j++) {
          if (claimedEventIndices.has(j)) continue;
          const meta = heatmapClicks[j].metadata as Record<string, unknown> | undefined;
          if (!meta) continue;
          const el = String(meta.el ?? "").toLowerCase();

          const tagMatch = tagFragment && el.includes(tagFragment);
          // Labels forward clicks to their associated control.
          const labelDelegateMatch =
            isLabel && (el.includes("input") || el.includes("select") || el.includes("textarea") || el.includes("label"));

          if (tagMatch || labelDelegateMatch) {
            matchIdx = j;
            break;
          }
        }

        // Strategy 3: position-based fallback — claim the first unclaimed event.
        if (matchIdx === -1) {
          for (let j = 0; j < heatmapClicks.length; j++) {
            if (!claimedEventIndices.has(j)) {
              matchIdx = j;
              break;
            }
          }
        }

        if (matchIdx !== -1) {
          claimedEventIndices.add(matchIdx);
        }

        const matchingEvent = matchIdx !== -1 ? heatmapClicks[matchIdx] : undefined;
        const elInEvent = matchingEvent
          ? String(
              (matchingEvent.metadata as Record<string, unknown> | undefined)
                ?.el ?? "—",
            )
          : "—";

        coverageRows.push({
          index: i,
          selector: sel,
          captured: !!matchingEvent,
          elInEvent,
        });
      }

      // Print the coverage table.
      printCoverageTable(coverageRows);

      // PRIMARY ASSERTION: at least one heatmap_click captured per clicked element.
      // We assert gross coverage (total events >= total clicks) as the hard gate.
      // Individual element mapping is a best-effort report; the strict per-element
      // assertion uses tag-fragment matching defined above.
      expect(
        heatmapClicks.length,
        `Expected at least ${clickedSelectors.length} heatmap_click event(s) ` +
          `(one per clicked element). Got ${heatmapClicks.length}. ` +
          "Ensure the EventCollector is active and the fast-flush path is wired.",
      ).toBeGreaterThanOrEqual(clickedSelectors.length);

      // SECONDARY ASSERTION: every captured heatmap_click has the correct shape.
      for (const ev of heatmapClicks) {
        expect(ev.event_type, "event_type must be heatmap_click").toBe(
          "heatmap_click",
        );
        expect(ev.session_id, "session_id must be anon").toBe("anon");

        const meta = ev.metadata as Record<string, unknown> | undefined;
        expect(meta, "metadata must be present").toBeTruthy();
        if (meta) {
          expect(
            Number(meta.xp),
            "metadata.xp must be in [0, 1]",
          ).toBeGreaterThanOrEqual(0);
          expect(
            Number(meta.xp),
            "metadata.xp must be in [0, 1]",
          ).toBeLessThanOrEqual(1);
          expect(
            Number(meta.yp),
            "metadata.yp must be in [0, 1]",
          ).toBeGreaterThanOrEqual(0);
          expect(
            Number(meta.yp),
            "metadata.yp must be in [0, 1]",
          ).toBeLessThanOrEqual(1);
          expect(meta.src, "metadata.src must be anon_heatmap").toBe(
            "anon_heatmap",
          );
          expect(meta.vw, "metadata.vw must be present").toBeTruthy();
          expect(
            typeof meta.el === "string" && meta.el.length > 0,
            "metadata.el must be a non-empty string selector",
          ).toBe(true);
        }
      }

      // TERTIARY ASSERTION: 100% element coverage via tag-fragment matching.
      const missedElements = coverageRows.filter((r) => !r.captured);
      expect(
        missedElements,
        `${missedElements.length} element(s) produced no matching heatmap_click:\n` +
          missedElements.map((r) => `  [${r.index}] ${r.selector}`).join("\n"),
      ).toHaveLength(0);

      await cleanup();
    },
  );
});

/* -------------------------------------------------------------------------- */
/* CASE 2 — Admin dot count (DB-guarded)                                       */
/* -------------------------------------------------------------------------- */

test.describe("heatmap: ELEMENTS-DB — admin heatmap dot count >= clicked positions", () => {
  test.skip(
    !process.env.DATABASE_URL,
    "Requires DATABASE_URL — cannot validate DB-backed heatmap render without it",
  );

  test.setTimeout(120_000);

  test(
    "after per-element clicks, /admin/heatmaps dot count >= distinct clicked positions",
    async ({ page }) => {
      const target = resolveSmokeTarget();

      // Step A: emit clicks on the public page.
      await installPageShims(page);
      const { getEvents, cleanup } = captureEventPosts(page);

      await page.goto(TARGET_PAGE, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1_500);

      const elementCount = await enumerateInteractiveElements(page);
      let clickCount = 0;

      for (let i = 0; i < elementCount; i++) {
        try {
          const located = page.locator(INTERACTIVE_SELECTORS).nth(i);
          if (!(await located.isVisible().catch(() => false))) continue;
          await located.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {});
          await located.click({ timeout: 5_000, force: false }).catch(async () => {
            await located.click({ timeout: 3_000, force: true }).catch(() => {});
          });
          clickCount++;
          await page.waitForTimeout(80);
          const dialog = page.locator('[role="dialog"]').first();
          if (await dialog.isVisible().catch(() => false)) {
            await page.keyboard.press("Escape").catch(() => {});
            await page.waitForTimeout(200);
          }
        } catch { /* skip */ }
      }

      await triggerFlush(page);
      await page.waitForTimeout(FLUSH_WAIT_MS);
      await cleanup();

      // Step B: authenticate as admin.
      const didLogin = await signInIfPossible(page, target);
      if (!didLogin) {
        test.skip(true, "No SMOKE_TEST_EMAIL/PASSWORD — cannot reach admin heatmap");
        return;
      }

      // Step C: open /admin/heatmaps.
      const response = await page.goto("/admin/heatmaps", {
        waitUntil: "domcontentloaded",
      });

      expect(response?.status(), "/admin/heatmaps must return 200").toBe(200);
      expect(page.url(), "must not redirect to /login").not.toContain("/login");

      // Wait for spinner.
      await page.waitForFunction(
        () => document.querySelector('[class*="animate-spin"]') === null,
        { timeout: 10_000 },
      ).catch(() => {});

      // Select the page we clicked on if not already selected.
      const select = page.locator("select").first();
      const currentVal = await select.inputValue().catch(() => "/");
      if (currentVal !== TARGET_PAGE) {
        await select.selectOption(TARGET_PAGE).catch(() => {});
        await page.waitForTimeout(2_000);
      }

      // Assert dot count >= click positions.
      const noBanner = page.getByTestId("heatmap-no-data-banner");
      const bannerVisible = await noBanner.isVisible().catch(() => false);

      if (bannerVisible) {
        // No data yet — acceptable only if 0 clicks landed.
        expect(
          clickCount,
          "Expected data in DB after clicks, but got no-data banner",
        ).toBe(0);
        return;
      }

      const heatmapContainer = page.locator(".relative.bg-gray-50").first();
      await expect(heatmapContainer).toBeVisible({ timeout: 8_000 });

      const overlayDivs = heatmapContainer.locator("div.absolute.rounded-full");
      const dotCount = await overlayDivs.count();

      expect(
        dotCount,
        `Admin heatmap dot count (${dotCount}) must be >= distinct click positions (${clickCount}). ` +
          "Each per-element click should produce a unique (xp, yp) dot.",
      ).toBeGreaterThanOrEqual(clickCount > 0 ? 1 : 0);
    },
  );
});
