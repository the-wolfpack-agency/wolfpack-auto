/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /api/admin/heatmaps — guards against the demo-data regression.
 *
 * Before 2026-05-02 this route returned hard-coded DEMO_CLICK_DATA /
 * DEMO_SCROLL_DATA / DEMO_ATTENTION_DATA when DATABASE_URL was unset
 * AND when the live query returned 0 rows. Both fallbacks are gone;
 * the route now returns the honest empty contract `{ noData: true,
 * noDataReason, points: [], scrollBands: [], attentionZones: [] }`.
 * These tests pin that behavior so a future change doesn't quietly
 * reintroduce synthetic visitor data.
 */

const mockRequireAuth = jest.fn();
const mockGetDealerId = jest.fn();
const mockTrackHeatmap = jest.fn();
const mockQuery = jest.fn();
const mockGetTopPages = jest.fn();

jest.mock("@/lib/auth-guard", () => ({
  requireAuth: (...a: any[]) => mockRequireAuth(...a),
}));
jest.mock("@/lib/get-dealer-id", () => ({
  getDealerId: (...a: any[]) => mockGetDealerId(...a),
}));
jest.mock("@/lib/analytics-hooks", () => ({
  trackHeatmap: (...a: any[]) => mockTrackHeatmap(...a),
}));
jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
}));
jest.mock("@/lib/heatmap", () => {
  const actual = jest.requireActual("@/lib/heatmap");
  return { ...actual, getTopPages: (...a: any[]) => mockGetTopPages(...a) };
});
/* Default tenant-resolver mock returns null — keeps the
   session-derived dealer fallback active. Individual tests that
   want host-resolution behavior re-mock per case. */
const mockResolveTenant = jest.fn().mockResolvedValue(null);
jest.mock("@/lib/tenant-resolver", () => ({
  resolveTenant: (...a: any[]) => mockResolveTenant(...a),
}));

import { NextRequest } from "next/server";
import { GET } from "../route";

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockGetDealerId.mockReset();
  mockTrackHeatmap.mockReset();
  mockQuery.mockReset();
  mockGetTopPages.mockReset();
  mockRequireAuth.mockResolvedValue({ user: { id: "u1" } });
  mockGetDealerId.mockReturnValue("dealer-1");
  mockGetTopPages.mockResolvedValue([]);
});

function req(qs = ""): NextRequest {
  return new NextRequest(`https://x.test/api/admin/heatmaps${qs}`);
}

const ORIGINAL_DB_URL = process.env.DATABASE_URL;
afterAll(() => {
  if (ORIGINAL_DB_URL === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = ORIGINAL_DB_URL;
  }
});

describe("GET /api/admin/heatmaps — empty contract", () => {
  test("returns noData=true when DATABASE_URL is missing (no synthetic clusters)", async () => {
    delete process.env.DATABASE_URL;
    const res = await GET(req("?type=click&days=7"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.noData).toBe(true);
    expect(body.noDataReason).toBe("database_unavailable");
    expect(body.points).toEqual([]);
    expect(body.scrollBands).toEqual([]);
    expect(body.attentionZones).toEqual([]);
    expect(body.topPages).toEqual([]);
    /* Stats must NOT carry a fake hottestElement string. */
    expect(body.stats.hottestElement).toBe("");
    expect(body.stats.totalClicks).toBe(0);
  });

  test("click: returns noData=true with empty points when query yields zero rows", async () => {
    process.env.DATABASE_URL = "postgres://test";
    /* loadStats fires three queries; loadClickPoints fires one.
       Make every query resolve to empty rows. */
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await GET(req("?type=click&days=7&page=/"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.noData).toBe(true);
    expect(body.noDataReason).toBe("no_click_events_in_window");
    expect(body.points).toEqual([]);
  });

  test("scroll: returns noData=true when no sessions reached any threshold", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await GET(req("?type=scroll&days=7&page=/"));
    const body = await res.json();
    expect(body.noData).toBe(true);
    expect(body.noDataReason).toBe("no_scroll_events_in_window");
    expect(body.scrollBands).toEqual([]);
  });

  test("attention: returns noData=true when no dwell events recorded", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await GET(req("?type=attention&days=7&page=/"));
    const body = await res.json();
    expect(body.noData).toBe(true);
    expect(body.noDataReason).toBe("no_attention_events_in_window");
    expect(body.attentionZones).toEqual([]);
  });
});

describe("GET /api/admin/heatmaps — real-data path", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://test";
  });

  test("click: aggregates real click events and normalizes intensity", async () => {
    /* Order of mockQuery calls: getTopPages is mocked separately; then
       loadStats fires three queries (clicks, scroll, hottest), then
       loadClickPoints fires one. We answer them in that order. */
    mockGetTopPages.mockResolvedValueOnce([
      { url: "/", pageviews: 100, uniqueVisitors: 50 },
    ]);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: 12 }] }) // total clicks
      .mockResolvedValueOnce({ rows: [{ avg_depth: 55 }] }) // avg scroll
      .mockResolvedValueOnce({ rows: [{ label: "Add to cart", clicks: 8 }] }) // hottest
      .mockResolvedValueOnce({
        rows: [
          { x: "100", y: "200", count: 8 },
          { x: "300", y: "400", count: 4 },
        ],
      });
    const res = await GET(req("?type=click&days=7&page=/"));
    const body = await res.json();
    expect(body.noData).toBe(false);
    expect(body.points).toHaveLength(2);
    expect(body.points[0].intensity).toBe(1); // 8/8
    expect(body.points[1].intensity).toBe(0.5); // 4/8
    expect(body.totalEvents).toBe(12);
    expect(body.stats.hottestElement).toBe("Add to cart");
    expect(body.topPages).toHaveLength(1);
  });

  test("scroll: builds bands using at-least-this-deep semantics", async () => {
    mockGetTopPages.mockResolvedValueOnce([]);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: 10 }] })
      .mockResolvedValueOnce({ rows: [{ avg_depth: 60 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        /* 10 sessions: 4 hit 100, 3 hit 75, 2 hit 50, 1 hit 25 */
        rows: [
          { max_depth: 100, sessions: 4 },
          { max_depth: 75, sessions: 3 },
          { max_depth: 50, sessions: 2 },
          { max_depth: 25, sessions: 1 },
        ],
      });
    const res = await GET(req("?type=scroll&days=7&page=/"));
    const body = await res.json();
    expect(body.noData).toBe(false);
    expect(body.scrollBands).toHaveLength(4);
    /* "At-least-this-deep" semantics:
         0-25%   = everyone (10/10 = 100%)
         25-50%  = 4+3+2 = 9/10 = 90%
         50-75%  = 4+3 = 7/10 = 70%
         75-100% = 4+3 = 7/10 = 70%  (sessions with max_depth >= 75) */
    const band0 = body.scrollBands.find((b: any) => b.label === "0-25%");
    const band75 = body.scrollBands.find((b: any) => b.label === "75-100%");
    expect(band0.visitorPercent).toBe(100);
    expect(band75.visitorPercent).toBe(70);
  });
});

describe("GET /api/admin/heatmaps — dealer-id symmetry with ingest", () => {
  /* Regression 2026-05-02: ingest resolves dealer_id from hostname
     via resolveTenant; the query previously used getDealerId(auth)
     which falls back to a hardcoded UUID. Mismatched dealer_ids
     filtered out every ingested event. The route must now derive
     dealer_id from the request hostname when resolveTenant succeeds. */
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://test";
  });

  test("uses resolveTenant().dealer.id over the session UUID when host resolves", async () => {
    mockResolveTenant.mockResolvedValueOnce({
      dealer: { id: "host-resolved-dealer" },
      resolvedVia: "subdomain",
    });
    mockGetTopPages.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValue({ rows: [] });

    const r = new NextRequest(
      "https://wolfpack-auto.vercel.app/api/admin/heatmaps?type=click&days=7&page=/",
      { headers: { host: "wolfpack-auto.vercel.app" } },
    );
    const res = await GET(r);
    const body = await res.json();
    expect(res.status).toBe(200);
    const dealerArg = mockQuery.mock.calls
      .map((c: any[]) => c[1])
      .filter((arr: any) => Array.isArray(arr))
      .find((arr: any[]) => arr.includes("host-resolved-dealer"));
    expect(dealerArg).toBeTruthy();
    expect(body.noData).toBe(true);
  });
});

describe("GET /api/admin/heatmaps — anti-regression: no demo constants leak", () => {
  test("response NEVER contains the legacy 'Hero CTA Button' stub string", async () => {
    delete process.env.DATABASE_URL;
    const res1 = await GET(req("?type=click&days=7"));
    process.env.DATABASE_URL = "postgres://test";
    mockQuery.mockResolvedValue({ rows: [] });
    const res2 = await GET(req("?type=click&days=7"));
    const json1 = JSON.stringify(await res1.json());
    const json2 = JSON.stringify(await res2.json());
    expect(json1).not.toContain("Hero CTA Button");
    expect(json2).not.toContain("Hero CTA Button");
    /* And no fake pageview totals (12450 / 9870 / 8320 etc). */
    expect(json1).not.toContain("12450");
    expect(json1).not.toContain("8320");
  });

  test("response never includes 'demo: true' flag (legacy escape hatch removed)", async () => {
    delete process.env.DATABASE_URL;
    const res = await GET(req("?type=click&days=7"));
    const body = await res.json();
    expect(body.demo).toBeUndefined();
  });
});
