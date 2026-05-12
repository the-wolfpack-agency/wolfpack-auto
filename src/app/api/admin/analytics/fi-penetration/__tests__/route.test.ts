/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contract tests for GET /api/admin/analytics/fi-penetration.
 * 200/401 + filters honored + analytics tracked.
 */

const mockRequireAuth = jest.fn();
const mockGetDealerId = jest.fn();
const mockTrackAnalyticsView = jest.fn();
const mockQuery = jest.fn();

jest.mock("@/lib/auth-guard", () => ({
  requireAuth: (...a: any[]) => mockRequireAuth(...a),
}));
jest.mock("@/lib/get-dealer-id", () => ({
  getDealerId: (...a: any[]) => mockGetDealerId(...a),
}));
jest.mock("@/lib/analytics-hooks", () => ({
  trackAnalyticsView: (...a: any[]) => mockTrackAnalyticsView(...a),
}));
jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
}));

import { NextRequest, NextResponse } from "next/server";
import { GET } from "../route";

const ORIGINAL_DB_URL = process.env.DATABASE_URL;

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockGetDealerId.mockReset();
  mockTrackAnalyticsView.mockReset();
  mockQuery.mockReset();
  mockRequireAuth.mockResolvedValue({ user: { id: "u1", dealer_id: "dealer-1" } });
  mockGetDealerId.mockReturnValue("dealer-1");
});

afterAll(() => {
  if (ORIGINAL_DB_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DB_URL;
});

function req(qs = ""): NextRequest {
  return new NextRequest(`https://x.test/api/admin/analytics/fi-penetration${qs}`);
}

describe("auth contract", () => {
  test("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    );
    const res = await GET(req());
    expect(res.status).toBe(401);
  });
});

describe("shadow-mode (no DATABASE_URL)", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  test("returns 200 with demo cells and headline", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shadow).toBe(true);
    expect(Array.isArray(body.cells)).toBe(true);
    expect(body.cells.length).toBeGreaterThan(0);
    expect(typeof body.headline).toBe("string");
    expect(body.dealerId).toBe("dealer-1");
  });

  test("emits the viewed event; drilled flag emits both", async () => {
    await GET(req());
    expect(mockTrackAnalyticsView).toHaveBeenCalledWith(
      "analytics.fi_penetration_viewed",
      "dealer-1",
      expect.any(Object),
    );
    mockTrackAnalyticsView.mockClear();
    await GET(req("?drilled=true"));
    const events = mockTrackAnalyticsView.mock.calls.map((c) => c[0]);
    expect(events).toContain("analytics.fi_penetration_viewed");
    expect(events).toContain("analytics.fi_penetration_drilled");
  });
});

describe("real-data path", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://test";
  });

  test("200 with no rows yields empty cells + 'No F&I activity' headline", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cells).toEqual([]);
    expect(body.headline).toMatch(/No F&I activity/i);
    expect(body.dealerId).toBe("dealer-1");
  });

  test("honors monthFrom/monthTo/productType filters in the SQL", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await GET(req("?monthFrom=2026-01-01&monthTo=2026-12-01&productType=gap"));
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [, values] = mockQuery.mock.calls[0];
    expect(values).toContain("dealer-1");
    expect(values).toContain("2026-01-01");
    expect(values).toContain("2026-12-01");
    expect(values).toContain("gap");
  });

  test("invalid productType is silently ignored (no SQL injection avenue)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await GET(req("?productType=BOGUS"));
    const [, values] = mockQuery.mock.calls[0];
    expect(values).not.toContain("BOGUS");
  });

  test("shapes rows into the heatmap result and emits cell_count metadata", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          fi_manager_id: "m1",
          fi_manager_name: "Maria",
          product_type: "gap",
          month: "2026-03-01",
          attach_rate: 0.78,
          gross_total: 4200,
          deals_count: 20,
          accepted_items: 16,
        },
      ],
    });
    const res = await GET(req());
    const body = await res.json();
    expect(body.cells).toHaveLength(1);
    expect(body.cells[0].fi_manager_name).toBe("Maria");
    expect(body.headline).toContain("Maria");
    expect(mockTrackAnalyticsView).toHaveBeenCalledWith(
      "analytics.fi_penetration_viewed",
      "dealer-1",
      expect.objectContaining({ cell_count: 1 }),
    );
  });
});
