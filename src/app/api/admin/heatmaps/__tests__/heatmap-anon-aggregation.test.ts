/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for anonymous heatmap aggregation in GET /api/admin/heatmaps.
 *
 * Covers:
 *  - heatmap_click rows → normalized points with correct xp/yp bucketing and intensity.
 *  - heatmap_move rows → movementPoints layer populated.
 *  - noData=false when events present; noData=true when truly empty.
 *  - Legacy click fallback when no heatmap_click rows exist.
 */

const mockRequireAuth = jest.fn();
const mockGetDealerId = jest.fn();
const mockTrackHeatmap = jest.fn();
const mockQuery = jest.fn();
const mockGetTopPages = jest.fn();
const mockResolveTenant = jest.fn().mockResolvedValue(null);

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
jest.mock("@/lib/tenant-resolver", () => ({
  resolveTenant: (...a: any[]) => mockResolveTenant(...a),
}));

import { NextRequest } from "next/server";
import { GET } from "../route";

const ORIGINAL_DB_URL = process.env.DATABASE_URL;
afterAll(() => {
  if (ORIGINAL_DB_URL === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = ORIGINAL_DB_URL;
  }
});

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://test";
  mockRequireAuth.mockReset();
  mockGetDealerId.mockReset();
  mockTrackHeatmap.mockReset();
  mockQuery.mockReset();
  mockGetTopPages.mockReset();
  mockRequireAuth.mockResolvedValue({ user: { id: "u1" } });
  mockGetDealerId.mockReturnValue("dealer-anon-test");
  mockGetTopPages.mockResolvedValue([]);
});

function req(qs = ""): NextRequest {
  return new NextRequest(`https://x.test/api/admin/heatmaps${qs}`);
}

describe("heatmap_click normalized aggregation", () => {
  /**
   * Query call order in GET (click type) — Promise.all fires concurrently:
   *   Promise.all([getTopPages, loadStats, loadHottestElements]):
   *     loadStats[0]: anon heatmap_click count
   *     loadStats[1]: avg scroll depth
   *     loadStats[2]: anon hottest el query
   *     loadHottestElements[0]: top-N el query
   *   (if anon count=0: 2 more legacy fallback queries from loadStats)
   *   Promise.all([loadClickPoints, loadMovementPoints]):
   *     loadClickPoints[0]: anon bucket query
   *     loadMovementPoints[0]: heatmap_move query
   *   (if anon bucket empty: legacy click fallback fires sequentially)
   */

  test("returns normalized xp/yp points bucketed at ~0.02, noData=false", async () => {
    mockGetTopPages.mockResolvedValueOnce([]);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: 30 }] })                      // loadStats: anon count
      .mockResolvedValueOnce({ rows: [{ avg_depth: 50 }] })                  // loadStats: avg scroll
      .mockResolvedValueOnce({ rows: [{ label: "CTA", clicks: 15 }] })       // loadStats: anon hottest el
      .mockResolvedValueOnce({ rows: [] })                                    // loadHottestElements
      .mockResolvedValueOnce({                                                // loadClickPoints: anon buckets
        rows: [
          { xp_bucket: "0.500", yp_bucket: "0.300", count: 20, modal_el: null },
          { xp_bucket: "0.120", yp_bucket: "0.800", count: 10, modal_el: null },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });                                   // loadMovementPoints

    const res = await GET(req("?type=click&days=7&page=/inventory"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.noData).toBe(false);
    expect(body.points).toHaveLength(2);

    // First point has highest count → intensity = 1
    expect(body.points[0].xp).toBeCloseTo(0.5, 3);
    expect(body.points[0].yp).toBeCloseTo(0.3, 3);
    expect(body.points[0].intensity).toBe(1);
    expect(body.points[0].count).toBe(20);

    // Second point intensity = 10/20 = 0.5
    expect(body.points[1].xp).toBeCloseTo(0.12, 3);
    expect(body.points[1].yp).toBeCloseTo(0.8, 3);
    expect(body.points[1].intensity).toBe(0.5);

    // movementPoints should be empty
    expect(body.movementPoints).toEqual([]);
  });

  test("returns movementPoints when heatmap_move rows exist", async () => {
    mockGetTopPages.mockResolvedValueOnce([]);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: 5 }] })                        // loadStats: anon count
      .mockResolvedValueOnce({ rows: [{ avg_depth: 0 }] })                   // loadStats: avg scroll
      .mockResolvedValueOnce({ rows: [] })                                    // loadStats: anon hottest el
      .mockResolvedValueOnce({ rows: [] })                                    // loadHottestElements
      .mockResolvedValueOnce({                                                // loadClickPoints: heatmap_click
        rows: [{ xp_bucket: "0.400", yp_bucket: "0.400", count: 5, modal_el: null }],
      })
      .mockResolvedValueOnce({                                                // loadMovementPoints
        rows: [
          { xp_bucket: "0.200", yp_bucket: "0.100", count: 40 },
          { xp_bucket: "0.600", yp_bucket: "0.700", count: 20 },
        ],
      });

    const res = await GET(req("?type=click&days=7&page=/"));
    const body = await res.json();

    expect(body.noData).toBe(false);
    expect(body.movementPoints).toHaveLength(2);
    // Highest movement count → intensity 1
    expect(body.movementPoints[0].intensity).toBe(1);
    // Second movement → 20/40 = 0.5
    expect(body.movementPoints[1].intensity).toBe(0.5);
    expect(body.movementPoints[0].xp).toBeCloseTo(0.2, 3);
    expect(body.movementPoints[0].yp).toBeCloseTo(0.1, 3);
  });

  test("noData=true and empty points/movementPoints when all queries return empty", async () => {
    /* When anon count=0, loadStats fires 2 additional legacy fallback queries.
       Query order:
         loadStats[0]: anon count → 0 (triggers fallback)
         loadStats[1]: avg scroll → []
         loadStats[2]: anon hottest el → []
         loadStats[3]: legacy count → 0
         loadStats[4]: legacy hottest el → []
         loadHottestElements: → []
         loadClickPoints anon → []
         loadMovementPoints → []
         loadClickPoints legacy → [] */
    mockGetTopPages.mockResolvedValueOnce([]);
    mockQuery.mockResolvedValue({ rows: [] }); // all queries return empty

    const res = await GET(req("?type=click&days=7&page=/"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.noData).toBe(true);
    expect(body.noDataReason).toBe("no_click_events_in_window");
    expect(body.points).toEqual([]);
    expect(body.movementPoints).toEqual([]);
  });

  test("falls back to legacy click events when no heatmap_click rows", async () => {
    /* When anon count > 0 (from stats) but loadClickPoints anon bucket returns empty,
       the legacy click fallback fires after loadMovementPoints.
       Query order:
         loadStats[0]: anon count → {total:4} (non-zero, so no legacy stats fallback)
         loadStats[1]: avg scroll → {avg_depth:30}
         loadStats[2]: anon hottest el → []
         loadHottestElements: → []
         loadClickPoints[0]: anon bucket → empty
         loadMovementPoints[0]: heatmap_move → empty
         loadClickPoints[1]: legacy click fallback → 2 rows */
    mockGetTopPages.mockResolvedValueOnce([]);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: 4 }] })       // loadStats: anon count
      .mockResolvedValueOnce({ rows: [{ avg_depth: 30 }] })  // loadStats: avg scroll
      .mockResolvedValueOnce({ rows: [] })                    // loadStats: anon hottest el
      .mockResolvedValueOnce({ rows: [] })                    // loadHottestElements
      .mockResolvedValueOnce({ rows: [] })                    // loadClickPoints: anon bucket → empty
      .mockResolvedValueOnce({ rows: [] })                    // loadMovementPoints
      .mockResolvedValueOnce({                                // loadClickPoints: legacy fallback
        rows: [
          { x: "400", y: "600", count: 4 },
          { x: "100", y: "200", count: 2 },
        ],
      });

    const res = await GET(req("?type=click&days=7&page=/"));
    const body = await res.json();

    expect(body.noData).toBe(false);
    expect(body.points).toHaveLength(2);
    // Legacy points carry x/y, not xp/yp
    expect(body.points[0].x).toBe(400);
    expect(body.points[0].y).toBe(600);
    expect(body.points[0].xp).toBeUndefined();
    expect(body.points[0].intensity).toBe(1); // 4/4
    expect(body.points[1].intensity).toBe(0.5); // 2/4
  });

  test("intensity is correctly normalized: max bucket always has intensity=1", async () => {
    mockGetTopPages.mockResolvedValueOnce([]);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: 100 }] })
      .mockResolvedValueOnce({ rows: [{ avg_depth: 60 }] })
      .mockResolvedValueOnce({ rows: [{ label: "Nav", clicks: 50 }] })
      .mockResolvedValueOnce({ rows: [] })                                    // loadHottestElements
      .mockResolvedValueOnce({
        rows: [
          { xp_bucket: "0.100", yp_bucket: "0.100", count: 100, modal_el: null },
          { xp_bucket: "0.500", yp_bucket: "0.500", count: 50, modal_el: null },
          { xp_bucket: "0.900", yp_bucket: "0.900", count: 25, modal_el: null },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await GET(req("?type=click&days=7&page=/"));
    const body = await res.json();

    const intensities = body.points.map((p: any) => p.intensity);
    expect(Math.max(...intensities)).toBe(1);
    expect(intensities[0]).toBe(1);    // 100/100
    expect(intensities[1]).toBe(0.5);  // 50/100
    expect(intensities[2]).toBe(0.25); // 25/100
  });
});
