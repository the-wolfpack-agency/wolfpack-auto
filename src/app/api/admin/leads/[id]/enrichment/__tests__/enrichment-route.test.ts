/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contract tests for GET /api/admin/leads/:id/enrichment
 */

const mockRequireAuth = jest.fn();

jest.mock("@/lib/auth-guard", () => {
  const actual = jest.requireActual<typeof import("@/lib/auth-guard")>("@/lib/auth-guard");
  return {
    ...actual,
    requireAuth: (...a: any[]) => mockRequireAuth(...a),
    isAuthenticated: actual.isAuthenticated,
  };
});

beforeEach(() => {
  delete process.env.DATABASE_URL;
  mockRequireAuth.mockReset();
  mockRequireAuth.mockResolvedValue({
    user: {
      id: "user-1",
      email: "demo@example.com",
      name: "Demo",
      dealer_id: "00000000-0000-4000-a000-000000000001",
      role: "admin",
    },
  });
});

import { NextRequest, NextResponse } from "next/server";
import { GET } from "../route";

function makeGet(id: string): NextRequest {
  return new NextRequest(`https://x.test/api/admin/leads/${id}/enrichment`, { method: "GET" });
}

describe("GET /api/admin/leads/:id/enrichment", () => {
  test("returns 200 with stub enrichment in shadow mode", async () => {
    const res = await GET(makeGet("lead-1"), {
      params: Promise.resolve({ id: "lead-1" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.lead_id).toBe("lead-1");
    expect(json.enrichment).toBeTruthy();
    expect(json.routing).toBeTruthy();
  });

  test("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "auth required" }, { status: 401 }),
    );
    const res = await GET(makeGet("lead-1"), {
      params: Promise.resolve({ id: "lead-1" }),
    });
    expect(res.status).toBe(401);
  });
});
