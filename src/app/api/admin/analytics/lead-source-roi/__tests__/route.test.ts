/**
 * Contract tests for GET /api/admin/analytics/lead-source-roi.
 *
 * Covers 200 (rollup + drill), 400 (missing source), 401.
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
import { GET } from "@/app/api/admin/analytics/lead-source-roi/route";

const DEALER = "00000000-0000-4000-a000-000000000001";

function authedUser() {
  return {
    user: { id: "u1", email: "u@x.com", name: "U", dealer_id: DEALER, role: "admin" },
  };
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  delete process.env.DATABASE_URL;
});

describe("GET /api/admin/analytics/lead-source-roi (rollup)", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    );
    const req = new NextRequest("http://localhost/api/admin/analytics/lead-source-roi");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with rows for an authed user", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest("http://localhost/api/admin/analytics/lead-source-roi");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.rows)).toBe(true);
    expect(data.rows.length).toBeGreaterThan(0);
    expect(typeof data.headline).toBe("string");
  });

  it("flags cost not configured by default in shadow mode", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest("http://localhost/api/admin/analytics/lead-source-roi");
    const res = await GET(req);
    const data = await res.json();
    expect(data.costNotConfigured).toBe(true);
  });

  it("accepts sortBy=conversion", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest("http://localhost/api/admin/analytics/lead-source-roi?sortBy=conversion");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/admin/analytics/lead-source-roi (drill)", () => {
  it("returns 400 when source is missing", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest(
      "http://localhost/api/admin/analytics/lead-source-roi?drill=1",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with drill rows when source provided", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest(
      "http://localhost/api/admin/analytics/lead-source-roi?drill=1&source=autotrader",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.source).toBe("autotrader");
    expect(Array.isArray(data.rows)).toBe(true);
  });
});
