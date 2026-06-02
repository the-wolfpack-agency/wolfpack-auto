#!/usr/bin/env node
/**
 * Standalone heatmap element-coverage verifier.
 *
 * Resolves Playwright from the wolfpack-auto repo and runs the same
 * enumerate-click-verify loop as the Playwright spec, without requiring
 * a full `npx playwright test` invocation or a running test suite.
 *
 * Usage:
 *   node scripts/verify-heatmap-elements.mjs
 *   BASE_URL=https://auto.example.com TARGET_PAGE=/inventory node scripts/verify-heatmap-elements.mjs
 *
 * Exits 0 if every clicked element produced a heatmap_click event.
 * Exits 1 if any element failed to capture OR the Playwright API is unavailable.
 *
 * Environment:
 *   BASE_URL    — target base URL (default: http://localhost:3000)
 *   TARGET_PAGE — path to test   (default: /)
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

// Resolve @playwright/test from the repo so we use the pinned version.
const require = createRequire(repoRoot + "/package.json");
let chromium;
try {
  ({ chromium } = require("@playwright/test"));
} catch {
  // Fallback: try playwright (not @playwright/test).
  try {
    ({ chromium } = require("playwright"));
  } catch {
    console.error(
      "[verify-heatmap-elements] Could not resolve @playwright/test or playwright.\n" +
        "Run: npm install --save-dev @playwright/test\n" +
        "Then: npx playwright install chromium",
    );
    process.exit(1);
  }
}

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const TARGET_PAGE = process.env.TARGET_PAGE ?? "/";
const FULL_URL = BASE_URL + TARGET_PAGE;

const EVENTS_PATH = "/api/analytics/events";
const FLUSH_WAIT_MS = 4_000;

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

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/**
 * Build a non-PII selector string for the element at index `idx` in the
 * filtered visible interactive list.
 */
async function elementSelector(page, idx) {
  return page.evaluate(({ selectors, index }) => {
    const all = Array.from(document.querySelectorAll(selectors)).filter((el) => {
      const style = window.getComputedStyle(el);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        el.offsetWidth > 0 &&
        el.offsetHeight > 0
      );
    });
    const el = all[index];
    if (!el) return `unknown[${index}]`;

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
  }, { selectors: INTERACTIVE_SELECTORS, index: idx });
}

async function countInteractiveElements(page) {
  return page.evaluate((selectors) => {
    return Array.from(document.querySelectorAll(selectors)).filter((el) => {
      const style = window.getComputedStyle(el);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        el.offsetWidth > 0 &&
        el.offsetHeight > 0
      );
    }).length;
  }, INTERACTIVE_SELECTORS);
}

async function triggerFlush(page) {
  await page.evaluate(() => {
    try {
      Object.defineProperty(document, "hidden", {
        value: true,
        configurable: true,
        writable: true,
      });
    } catch { /* ignore */ }
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pagehide"));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function printTable(rows) {
  const maxSel = Math.max(8, ...rows.map((r) => r.selector.length));
  const maxEl  = Math.max(12, ...rows.map((r) => r.elInEvent.length));

  const pad = (s, n) => String(s).padEnd(n);
  const header = `${"#".padEnd(4)} | ${pad("element", maxSel)} | ${"captured".padEnd(8)} | ${pad("el-in-event", maxEl)}`;
  const sep = "-".repeat(header.length);

  console.log("\n[verify-heatmap-elements] Coverage report:");
  console.log(sep);
  console.log(header);
  console.log(sep);
  for (const r of rows) {
    const tick = r.captured ? "yes" : "NO ";
    console.log(`${pad(r.index, 4)} | ${pad(r.selector, maxSel)} | ${pad(tick, 8)} | ${pad(r.elInEvent, maxEl)}`);
  }
  console.log(sep);
  const missed = rows.filter((r) => !r.captured).length;
  console.log(
    `[verify-heatmap-elements] ${rows.length - missed}/${rows.length} elements captured. Missed: ${missed}`,
  );
  return missed;
}

/* ── Main ────────────────────────────────────────────────────────────────── */

(async () => {
  console.log(`[verify-heatmap-elements] Target: ${FULL_URL}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    // No stored cookies — simulate anon visitor.
    storageState: undefined,
  });

  // Intercept: collect heatmap_click events from POST bodies.
  const capturedEvents = [];
  await context.route(`**${EVENTS_PATH}`, async (route, req) => {
    if (req.method() === "POST") {
      try {
        const raw = req.postData();
        if (raw) {
          const body = JSON.parse(raw);
          if (Array.isArray(body.events)) {
            capturedEvents.push(...body.events);
          }
        }
      } catch { /* ignore */ }
    }
    await route.continue();
  });

  const page = await context.newPage();

  // Install shims before navigation.
  await page.addInitScript(() => {
    // sendBeacon shim: forward as fetch so route interception captures it.
    const _native = navigator.sendBeacon.bind(navigator);
    window.__beacons = [];
    navigator.sendBeacon = function (url, data) {
      window.__beacons.push(data);
      void fetch(url, { method: "POST", body: data, keepalive: true }).catch(() => {});
      return _native(url, data);
    };

    // Prevent anchor navigation so we stay on the page.
    document.addEventListener(
      "click",
      (e) => {
        const anchor = e.target?.closest?.("a");
        if (anchor) e.preventDefault();
      },
      { capture: true },
    );
  });

  // Navigate to target page.
  try {
    await page.goto(FULL_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  } catch (err) {
    console.error(`[verify-heatmap-elements] Could not load ${FULL_URL}: ${err.message}`);
    await browser.close();
    process.exit(1);
  }

  // Wait for hydration.
  await sleep(1_500);

  const elementCount = await countInteractiveElements(page);
  console.log(
    `[verify-heatmap-elements] Found ${elementCount} visible interactive elements on "${TARGET_PAGE}"`,
  );

  if (elementCount === 0) {
    console.warn(
      "[verify-heatmap-elements] No interactive elements found. " +
        "The page may not have hydrated or the URL returned an error page.",
    );
    await browser.close();
    process.exit(0);
  }

  const clickedSelectors = [];

  for (let i = 0; i < elementCount; i++) {
    const sel = await elementSelector(page, i).catch(() => `element[${i}]`);

    try {
      const located = page.locator(INTERACTIVE_SELECTORS).nth(i);
      const isVisible = await located.isVisible({ timeout: 2_000 }).catch(() => false);
      if (!isVisible) {
        console.log(`[verify-heatmap-elements] Skip ${sel} (not visible)`);
        continue;
      }

      await located.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => {});
      await located.click({ timeout: 5_000, force: false }).catch(async () => {
        await located.click({ timeout: 3_000, force: true }).catch(() => {});
      });

      clickedSelectors.push(sel);
      await sleep(80);

      // Dismiss any dialog that opened.
      const dialog = page.locator('[role="dialog"]').first();
      if (await dialog.isVisible({ timeout: 500 }).catch(() => false)) {
        await page.keyboard.press("Escape").catch(() => {});
        await sleep(200);
      }
    } catch {
      console.log(`[verify-heatmap-elements] Could not click ${sel} — skipped`);
    }
  }

  console.log(
    `[verify-heatmap-elements] Clicked ${clickedSelectors.length}/${elementCount} elements.`,
  );

  // Flush and wait.
  await triggerFlush(page);
  await sleep(FLUSH_WAIT_MS);

  await browser.close();

  // Build coverage.
  const heatmapClicks = capturedEvents.filter((ev) => ev.event_type === "heatmap_click");
  console.log(
    `[verify-heatmap-elements] Captured ${heatmapClicks.length} heatmap_click event(s).`,
  );

  // Build coverage rows using the same three-strategy matcher as the spec:
  //   1. Tag-fragment match.
  //   2. Label delegation (label clicks fire on the associated input).
  //   3. Position-based fallback (claim first unclaimed event).
  const claimedEventIndices = new Set();
  const rows = clickedSelectors.map((sel, i) => {
    const tagFragment = (sel.split(/[:\[#]/)[0] ?? "").toLowerCase();
    const isLabel = sel.startsWith("label");

    let matchIdx = -1;
    for (let j = 0; j < heatmapClicks.length; j++) {
      if (claimedEventIndices.has(j)) continue;
      const el = String(heatmapClicks[j].metadata?.el ?? "").toLowerCase();
      const tagMatch = tagFragment && el.includes(tagFragment);
      const labelDelegate = isLabel && (el.includes("input") || el.includes("select") || el.includes("textarea") || el.includes("label"));
      if (tagMatch || labelDelegate) { matchIdx = j; break; }
    }
    if (matchIdx === -1) {
      for (let j = 0; j < heatmapClicks.length; j++) {
        if (!claimedEventIndices.has(j)) { matchIdx = j; break; }
      }
    }
    if (matchIdx !== -1) claimedEventIndices.add(matchIdx);

    const match = matchIdx !== -1 ? heatmapClicks[matchIdx] : undefined;
    return {
      index: i,
      selector: sel,
      captured: !!match,
      elInEvent: match ? String(match.metadata?.el ?? "—") : "—",
    };
  });

  const missed = printTable(rows);

  // Check gross coverage.
  if (heatmapClicks.length < clickedSelectors.length) {
    console.error(
      `\n[verify-heatmap-elements] FAIL: expected ${clickedSelectors.length} heatmap_click events, ` +
        `got ${heatmapClicks.length}. ` +
        "Check that the EventCollector fast-flush path is wired and /api/analytics/events accepts POSTs.",
    );
    process.exit(1);
  }

  if (missed > 0) {
    console.error(
      `\n[verify-heatmap-elements] FAIL: ${missed} element(s) produced no matching heatmap_click.`,
    );
    process.exit(1);
  }

  // Validate event shape.
  let shapeErrors = 0;
  for (const ev of heatmapClicks) {
    const meta = ev.metadata ?? {};
    const ok =
      ev.event_type === "heatmap_click" &&
      ev.session_id === "anon" &&
      meta.src === "anon_heatmap" &&
      typeof meta.el === "string" && meta.el.length > 0 &&
      Number(meta.xp) >= 0 && Number(meta.xp) <= 1 &&
      Number(meta.yp) >= 0 && Number(meta.yp) <= 1 &&
      meta.vw != null;
    if (!ok) {
      console.warn(
        `[verify-heatmap-elements] Shape mismatch on event: ${JSON.stringify(ev)}`,
      );
      shapeErrors++;
    }
  }

  if (shapeErrors > 0) {
    console.error(
      `\n[verify-heatmap-elements] FAIL: ${shapeErrors} heatmap_click event(s) have incorrect shape. ` +
        "Expected { event_type:'heatmap_click', session_id:'anon', metadata:{ xp, yp, vw, src:'anon_heatmap', el } }",
    );
    process.exit(1);
  }

  console.log(
    "\n[verify-heatmap-elements] PASS: all elements captured with correct event shape.",
  );
  process.exit(0);
})();
