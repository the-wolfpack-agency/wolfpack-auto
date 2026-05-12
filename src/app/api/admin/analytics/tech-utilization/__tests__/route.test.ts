/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contract tests for GET /api/admin/analytics/tech-utilization.
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
  return new NextRequest(`https://x.test/api/admin/analytics/tech-utilization${qs}`);
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

  test("returns 200 with demo cells, headline, hoursAvailableFromConstant flag", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shadow).toBe(true);
    expect(body.cells.length).toBeGreaterThan(0);
    expect(body.hoursAvailableFromConstant).toBe(true);
    expect(typeof body.headline).toBe("string");
  });

  test("drilled=true emits drilled event in addition to viewed", async () => {
    await GET(req("?drilled=true"));
    const events = mockTrackAnalyticsView.mock.calls.map((c) => c[0]);
    expect(events).toContain("analytics.tech_utilization_viewed");
    expect(events).toContain("analytics.tech_utilization_drilled");
  });
});

describe("real-data path", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://test";
  });

  test("empty rows -> empty cells + 'No repair orders' headline", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.cells).toEqual([]);
    expect(body.headline).toMatch(/no repair orders/i);
  });

  test("week + bay filters pass through to the SQL values", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await GET(req("?weekFrom=2026-05-04&weekTo=2026-05-11&bayId=A1"));
    const [, values] = mockQuery.mock.calls[0];
    expect(values).toContain("dealer-1");
    expect(values).toContain("2026-05-04");
    expect(values).toContain("2026-05-11");
    expect(values).toContain("A1");
  });

  test("shapes rows into cells + headline + dealerId", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          tech_id: "11111111-1111-4111-a111-111111111111",
          tech_name: "Sam",
          bay_id: "A1",
          week_start: "2026-05-04",
          hours_billed: 36,
          hours_available: 40,
          utilization: 0.9,
          ro_count: 12,
          labor_revenue: 5200,
        },
      ],
    });
    const res = await GET(req());
    const body = await res.json();
    expect(body.cells).toHaveLength(1);
    expect(body.cells[0].tech_name).toBe("Sam");
    expect(body.headline).toContain("Sam");
    expect(body.headline).toContain("90%");
    expect(body.dealerId).toBe("dealer-1");
  });

  test("never echoes a user-supplied dealerId from the query string", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await GET(req("?dealerId=ATTACKER_DEALER"));
    const body = await res.json();
    expect(body.dealerId).toBe("dealer-1");
    const [, values] = mockQuery.mock.calls[0];
    expect(values).not.toContain("ATTACKER_DEALER");
  });
});
