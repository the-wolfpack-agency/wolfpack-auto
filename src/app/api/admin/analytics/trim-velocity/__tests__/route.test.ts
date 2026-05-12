/**
 * Contract tests for GET /api/admin/analytics/trim-velocity.
 *
 * Covers 200 (list + drill), 400 (missing drill params, bad year), 401.
 * Uses shadow mode (no DATABASE_URL) so the lib returns demo rows.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockRequireAuth = jest.fn();

jest.mock("@/lib/auth-guard", () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
}));

jest.mock("@/lib/analytics-hooks", () => ({
  trackAnalyticsView: jest.fn(),
}));

import { NextRequest, NextResponse } from "next/server";
import { GET } from "@/app/api/admin/analytics/trim-velocity/route";

const DEALER = "00000000-0000-4000-a000-000000000001";

function authedUser() {
  return {
    user: { id: "u1", email: "u@x.com", name: "U", dealer_id: DEALER, role: "admin" },
  };
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  delete process.env.DATABASE_URL; // shadow mode → lib returns demo rows
});

describe("GET /api/admin/analytics/trim-velocity (list)", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    );
    const req = new NextRequest("http://localhost/api/admin/analytics/trim-velocity");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with rows and headline for an authed user", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest("http://localhost/api/admin/analytics/trim-velocity");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.rows)).toBe(true);
    expect(data.rows.length).toBeGreaterThan(0);
    expect(typeof data.headline).toBe("string");
    expect(data.headline.length).toBeGreaterThan(0);
  });

  it("respects ?sortBy=slowest", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest("http://localhost/api/admin/analytics/trim-velocity?sortBy=slowest");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/admin/analytics/trim-velocity (drill)", () => {
  it("returns 400 when drill missing make", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest(
      "http://localhost/api/admin/analytics/trim-velocity?drill=1&model=RAV4&trim=XLE&year=2026",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 on non-numeric year", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest(
      "http://localhost/api/admin/analytics/trim-velocity?drill=1&make=Toyota&model=RAV4&trim=XLE&year=abc",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with drill rows when params valid", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest(
      "http://localhost/api/admin/analytics/trim-velocity?drill=1&make=Toyota&model=RAV4&trim=XLE%20Hybrid&year=2026",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.make).toBe("Toyota");
    expect(Array.isArray(data.rows)).toBe(true);
  });
});
