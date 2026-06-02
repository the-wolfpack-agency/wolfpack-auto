/**
 * @jest-environment jsdom
 *
 * HeatmapsPage — real-page background + overlay render tests.
 *
 * Strategy: the component starts with page="/". The auto-select logic switches
 * to a different page only when noData=true and topPages contains a better URL.
 * We exploit that to drive the page state:
 *   - For "/" tests: noData=false, topPages=[{url:"/"}] → stays on "/".
 *   - For other-page tests: noData=true, topPages=[{url:"/about"}] → auto-switches.
 *   - For admin-page tests: noData=true, topPages=[{url:"/admin/x"}] → auto-switches to admin URL.
 *
 * Separately, isSafeToFrame() and HeatmapWireframe are tested via source-level
 * structural assertions (matching the security-posture test style in this repo)
 * to validate the guard logic directly without needing full render.
 *
 * Uses jsdom + react-dom/client; mocks global.fetch. Matches MarketIntelCard
 * and security-posture test style/patterns in this repo.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import HeatmapsPage from "../page";

declare const global: any;

/* -------------------------------------------------------------------------- */
/* Source-level guard (no render needed)                                       */
/* -------------------------------------------------------------------------- */

const PAGE_SRC_PATH = resolve(__dirname, "../page.tsx");
const PAGE_SOURCE = readFileSync(PAGE_SRC_PATH, "utf-8");

describe("HeatmapsPage — isSafeToFrame guard (source-level)", () => {
  it("page file exists", () => {
    expect(existsSync(PAGE_SRC_PATH)).toBe(true);
  });

  it("isSafeToFrame is defined and guards /admin/* paths", () => {
    // Guard must be present in source.
    expect(PAGE_SOURCE).toContain("isSafeToFrame");
    // Must check for /admin prefix.
    expect(PAGE_SOURCE).toMatch(/admin.*DENY|\/admin.*false|admin.*Frame/i);
  });

  it("iframe has sandbox=allow-scripts allow-same-origin in source", () => {
    expect(PAGE_SOURCE).toContain('sandbox="allow-scripts allow-same-origin"');
  });

  it("iframe has pointerEvents none in source", () => {
    expect(PAGE_SOURCE).toContain('pointerEvents: "none"');
  });

  it("iframe src uses __heatmap_bg=1 param in source", () => {
    expect(PAGE_SOURCE).toContain("__heatmap_bg=1");
  });

  it("wireframe fallback component exists with data-testid", () => {
    expect(PAGE_SOURCE).toContain('data-testid="heatmap-wireframe-fallback"');
  });

  it("heatmap canvas has data-testid", () => {
    expect(PAGE_SOURCE).toContain('data-testid="heatmap-canvas"');
  });

  it("iframe has data-testid for E2E targeting", () => {
    expect(PAGE_SOURCE).toContain('data-testid="heatmap-real-page-iframe"');
  });

  it("iframeError state controls fallback path", () => {
    expect(PAGE_SOURCE).toContain("iframeError");
    expect(PAGE_SOURCE).toContain("setIframeError");
  });

  it("iframe loading state is tracked", () => {
    expect(PAGE_SOURCE).toContain("iframeLoading");
    expect(PAGE_SOURCE).toContain("setIframeLoading");
  });

  it("hottest-elements list has data-testid", () => {
    expect(PAGE_SOURCE).toContain('data-testid="hottest-elements-list"');
  });

  it("dot titles include el selector in source", () => {
    expect(PAGE_SOURCE).toContain("dotTitle");
    expect(PAGE_SOURCE).toContain("point.el");
  });

  it("new Live view caption contains no em dashes", () => {
    // Only assert the caption string we added — pre-existing strings are out of scope.
    expect(PAGE_SOURCE).toContain("Live view of");
    // The caption string itself must not have an em dash.
    const captionMatch = PAGE_SOURCE.match(/Live view of[^"']*/);
    expect(captionMatch?.[0] ?? "").not.toContain("—");
  });
});

/* -------------------------------------------------------------------------- */
/* Render helpers                                                               */
/* -------------------------------------------------------------------------- */

/** Minimal HeatmapPoint with normalized coords and el label. */
const SAMPLE_POINTS = [
  { x: 0, y: 0, xp: 0.25, yp: 0.4, intensity: 0.9, count: 12, el: "button#search-cta" },
  { x: 0, y: 0, xp: 0.6, yp: 0.7, intensity: 0.5, count: 4, el: "a.nav-link:nth-of-type(2)" },
];

const SAMPLE_MOVEMENT = [
  { xp: 0.3, yp: 0.5, count: 8, intensity: 0.6 },
];

const SAMPLE_HOTTEST_ELEMENTS = [
  { el: "button#search-cta", count: 12 },
  { el: "a.nav-link:nth-of-type(2)", count: 4 },
];

/**
 * Build a fetch mock that returns controlled heatmap data.
 * When noData=true and topPages has a different URL, the component
 * auto-switches to that URL.
 */
function mockFetch(overrides: Record<string, unknown> = {}): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      points: SAMPLE_POINTS,
      movementPoints: SAMPLE_MOVEMENT,
      scrollBands: [],
      attentionZones: [],
      topPages: [{ url: "/", pageviews: 100, uniqueVisitors: 80 }],
      stats: { totalClicks: 16, avgScrollDepth: 62, hottestElement: "button#search-cta" },
      hottestElements: SAMPLE_HOTTEST_ELEMENTS,
      noData: false,
      noDataReason: null,
      ...overrides,
    }),
  });
}

function mount(container: HTMLElement): Root {
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<HeatmapsPage />);
  });
  return root;
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

/* -------------------------------------------------------------------------- */
/* Render tests                                                                 */
/* -------------------------------------------------------------------------- */

describe("HeatmapsPage — real-page iframe background (render)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    originalFetch = global.fetch;
  });

  afterEach(() => {
    // Unmount via the same root to avoid "already passed to createRoot" warning.
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    if (container.parentNode) {
      document.body.removeChild(container);
    }
    global.fetch = originalFetch;
  });

  /* ── 1. Safe non-admin page ("/") → iframe rendered ── */
  test("renders iframe with ?__heatmap_bg=1 for safe non-admin page /", async () => {
    global.fetch = mockFetch({
      topPages: [{ url: "/", pageviews: 100, uniqueVisitors: 80 }],
      noData: false,
    });
    root = mount(container);
    await settle();

    const iframe = container.querySelector(
      'iframe[data-testid="heatmap-real-page-iframe"]',
    ) as HTMLIFrameElement | null;

    expect(iframe).not.toBeNull();
    // jsdom sets src as an absolute URL; check for the path and param.
    expect(iframe?.src).toContain("__heatmap_bg=1");
    expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
    expect(iframe?.style.pointerEvents).toBe("none");
  });

  /* ── 2. Heatmap dots positioned by xp/yp ── */
  test("point dots are absolutely positioned using xp*100% / yp*100%", async () => {
    global.fetch = mockFetch({
      topPages: [{ url: "/", pageviews: 100, uniqueVisitors: 80 }],
      noData: false,
    });
    root = mount(container);
    await settle();

    const canvas = container.querySelector('[data-testid="heatmap-canvas"]');
    expect(canvas).not.toBeNull();

    const dots = canvas?.querySelectorAll("div.absolute.rounded-full");
    expect(dots?.length ?? 0).toBeGreaterThanOrEqual(SAMPLE_POINTS.length);

    const allDots = Array.from(dots ?? []) as HTMLElement[];
    // SAMPLE_POINTS[0]: xp=0.25→left:25%, yp=0.4→top:40%
    expect(allDots.some((d) => d.style.left === "25%")).toBe(true);
    expect(allDots.some((d) => d.style.top === "40%")).toBe(true);
  });

  /* ── 3. Admin page auto-selected → wireframe fallback, no iframe ── */
  test("falls back to wireframe (no iframe) when auto-switched to /admin/* page", async () => {
    // First call returns noData=true with /admin/dash as the best page.
    // The component auto-switches to /admin/dash.
    // Second call (for /admin/dash) returns data — but isSafeToFrame
    // returns false for /admin/*, so wireframe is shown.
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      const isFirstCall = callCount === 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          points: isFirstCall ? [] : SAMPLE_POINTS,
          movementPoints: [],
          scrollBands: [],
          attentionZones: [],
          topPages: [{ url: "/admin/dashboard", pageviews: 200, uniqueVisitors: 50 }],
          stats: null,
          noData: isFirstCall, // first call triggers auto-switch
          noDataReason: isFirstCall ? "no_click_events_in_window" : null,
        }),
      });
    });

    root = mount(container);
    // Need extra settle rounds to let the auto-switch fire and re-render.
    await settle();
    await settle();

    // iframe must NOT be present for /admin/* pages.
    const iframe = container.querySelector(
      'iframe[data-testid="heatmap-real-page-iframe"]',
    );
    expect(iframe).toBeNull();

    // Wireframe fallback must appear.
    const wireframe = container.querySelector(
      '[data-testid="heatmap-wireframe-fallback"]',
    );
    expect(wireframe).not.toBeNull();
  });

  /* ── 4. Auto-switched to safe non-admin page → iframe shown ── */
  test("shows iframe when auto-switched to a safe non-admin page (/about)", async () => {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      const isFirstCall = callCount === 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          points: isFirstCall ? [] : SAMPLE_POINTS,
          movementPoints: [],
          scrollBands: [],
          attentionZones: [],
          topPages: [{ url: "/about", pageviews: 200, uniqueVisitors: 50 }],
          stats: null,
          noData: isFirstCall,
          noDataReason: isFirstCall ? "no_click_events_in_window" : null,
        }),
      });
    });

    root = mount(container);
    await settle();
    await settle();

    const iframe = container.querySelector(
      'iframe[data-testid="heatmap-real-page-iframe"]',
    ) as HTMLIFrameElement | null;

    expect(iframe).not.toBeNull();
    expect(iframe?.src).toContain("__heatmap_bg=1");
    // src must reference /about.
    expect(iframe?.src).toMatch(/\/about/);
  });

  /* ── 5. No data state → banner visible ── */
  test("shows no-data banner when API returns noData:true and no auto-switch target", async () => {
    global.fetch = mockFetch({
      points: [],
      movementPoints: [],
      topPages: [{ url: "/", pageviews: 0, uniqueVisitors: 0 }],
      noData: true,
      noDataReason: "no_click_events_in_window",
    });
    root = mount(container);
    await settle();

    const banner = container.querySelector('[data-testid="heatmap-no-data-banner"]');
    expect(banner).not.toBeNull();
  });

  /* ── 6. Stats cards rendered with real values ── */
  test("renders three stat cards and Hottest Element card shows the el value", async () => {
    global.fetch = mockFetch({
      topPages: [{ url: "/", pageviews: 100, uniqueVisitors: 80 }],
      noData: false,
    });
    root = mount(container);
    await settle();

    const text = container.textContent ?? "";
    expect(text).toContain("Total Clicks");
    expect(text).toContain("Avg Scroll Depth");
    expect(text).toContain("Hottest Element");
    // Hottest Element card must display the actual element name, not blank.
    expect(text).toContain("button#search-cta");
    // Total Clicks card must show the real count, not 0.
    expect(text).toContain("16");
  });

  /* ── 7. Dot titles contain el + count ── */
  test("click dots have title containing el and count", async () => {
    global.fetch = mockFetch({
      topPages: [{ url: "/", pageviews: 100, uniqueVisitors: 80 }],
      noData: false,
    });
    root = mount(container);
    await settle();

    const canvas = container.querySelector('[data-testid="heatmap-canvas"]');
    const dots = Array.from(
      canvas?.querySelectorAll("div.absolute.rounded-full") ?? [],
    ) as HTMLElement[];

    // At least one dot must have a title with the el selector.
    const dotWithEl = dots.find((d) =>
      d.getAttribute("title")?.includes("button#search-cta"),
    );
    expect(dotWithEl).not.toBeUndefined();
    expect(dotWithEl?.getAttribute("title")).toContain("12 clicks");

    const dotWithEl2 = dots.find((d) =>
      d.getAttribute("title")?.includes("a.nav-link:nth-of-type(2)"),
    );
    expect(dotWithEl2).not.toBeUndefined();
    expect(dotWithEl2?.getAttribute("title")).toContain("4 clicks");
  });

  /* ── 8. Hottest elements ranked list renders ── */
  test("hottest-elements list renders with ranked el entries", async () => {
    global.fetch = mockFetch({
      topPages: [{ url: "/", pageviews: 100, uniqueVisitors: 80 }],
      noData: false,
    });
    root = mount(container);
    await settle();

    const list = container.querySelector('[data-testid="hottest-elements-list"]');
    expect(list).not.toBeNull();

    const text = list?.textContent ?? "";
    expect(text).toContain("button#search-cta");
    expect(text).toContain("a.nav-link:nth-of-type(2)");
    expect(text).toContain("12 clicks");
    expect(text).toContain("4 clicks");
  });

  /* ── 9. iframe has src with __heatmap_bg=1 for "/" ── */
  test("iframe src contains __heatmap_bg=1 when page is '/'", async () => {
    global.fetch = mockFetch({
      topPages: [{ url: "/", pageviews: 100, uniqueVisitors: 80 }],
      noData: false,
    });
    root = mount(container);
    await settle();

    const iframe = container.querySelector(
      'iframe[data-testid="heatmap-real-page-iframe"]',
    ) as HTMLIFrameElement | null;

    expect(iframe).not.toBeNull();
    expect(iframe?.src).toContain("__heatmap_bg=1");
  });
});
