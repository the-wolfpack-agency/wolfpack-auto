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
   * Query call order in GET (click type):
   *  1. getTopPages  — mocked via mockGetTopPages
   *  2. loadStats → 3 queries: total clicks, avg scroll, hottest element
   *  3. loadClickPoints → heatmap_click query (anonResult)
   *  4. loadMovementPoints → heatmap_move query
   */

  test("returns normalized xp/yp points bucketed at ~0.02, noData=false", async () => {
    mockGetTopPages.mockResolvedValueOnce([]);
    // loadStats: clicks, scroll, hottest
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: 30 }] })
      .mockResolvedValueOnce({ rows: [{ avg_depth: 50 }] })
      .mockResolvedValueOnce({ rows: [{ label: "CTA", clicks: 15 }] })
      // loadClickPoints: heatmap_click query returns 2 buckets
      .mockResolvedValueOnce({
        rows: [
          { xp_bucket: "0.500", yp_bucket: "0.300", count: 20 },
          { xp_bucket: "0.120", yp_bucket: "0.800", count: 10 },
        ],
      })
      // loadMovementPoints: heatmap_move query → empty
      .mockResolvedValueOnce({ rows: [] });

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
      .mockResolvedValueOnce({ rows: [{ total: 5 }] })
      .mockResolvedValueOnce({ rows: [{ avg_depth: 0 }] })
      .mockResolvedValueOnce({ rows: [] })
      // heatmap_click
      .mockResolvedValueOnce({
        rows: [{ xp_bucket: "0.400", yp_bucket: "0.400", count: 5 }],
      })
      // heatmap_move
      .mockResolvedValueOnce({
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

  test("noData=true and empty points/movementPoints when both queries return empty", async () => {
    mockGetTopPages.mockResolvedValueOnce([]);
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // total clicks
      .mockResolvedValueOnce({ rows: [] }) // avg scroll
      .mockResolvedValueOnce({ rows: [] }) // hottest
      .mockResolvedValueOnce({ rows: [] }) // heatmap_click → empty
      .mockResolvedValueOnce({ rows: [] }) // legacy click → empty
      .mockResolvedValueOnce({ rows: [] }); // heatmap_move → empty

    const res = await GET(req("?type=click&days=7&page=/"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.noData).toBe(true);
    expect(body.noDataReason).toBe("no_click_events_in_window");
    expect(body.points).toEqual([]);
    expect(body.movementPoints).toEqual([]);
  });

  test("falls back to legacy click events when no heatmap_click rows", async () => {
    /* Call order with Promise.all([loadClickPoints, loadMovementPoints]):
       1. loadStats queries (3): total, scroll, hottest
       2. loadClickPoints fires anon (heatmap_click) query — call 4
       3. loadMovementPoints fires movement query concurrently — call 5
       4. Anon resolves empty → loadClickPoints fires legacy query — call 6
       So movement fires before legacy fallback in the mock queue. */
    mockGetTopPages.mockResolvedValueOnce([]);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: 4 }] })    // loadStats: total clicks
      .mockResolvedValueOnce({ rows: [{ avg_depth: 30 }] }) // loadStats: avg scroll
      .mockResolvedValueOnce({ rows: [] })                 // loadStats: hottest
      .mockResolvedValueOnce({ rows: [] })                 // loadClickPoints: heatmap_click → empty
      .mockResolvedValueOnce({ rows: [] })                 // loadMovementPoints: heatmap_move → empty
      .mockResolvedValueOnce({                             // loadClickPoints: legacy click fallback
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
      .mockResolvedValueOnce({
        rows: [
          { xp_bucket: "0.100", yp_bucket: "0.100", count: 100 },
          { xp_bucket: "0.500", yp_bucket: "0.500", count: 50 },
          { xp_bucket: "0.900", yp_bucket: "0.900", count: 25 },
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
