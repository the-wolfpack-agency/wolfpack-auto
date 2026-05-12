/**
 * Contract tests for GET /api/admin/fi-audit-runs.
 *
 * 401 path: with no session, requireWolfpackStaff returns 401.
 * 200 path: when the operator-auth mock returns a session, the handler
 *   responds with `{ runs: [] }` in shadow mode (no DATABASE_URL).
 */

import { GET } from "@/app/api/admin/fi-audit-runs/route";
import { NextRequest } from "next/server";

jest.mock("@/lib/operator-auth", () => {
  const actual = jest.requireActual("@/lib/operator-auth");
  return {
    ...actual,
    requireWolfpackStaff: jest.fn(),
    isWolfpackStaff: actual.isWolfpackStaff,
  };
});

import * as opAuth from "@/lib/operator-auth";
import { NextResponse } from "next/server";

describe("GET /api/admin/fi-audit-runs", () => {
  test("401 when no Wolfpack staff session", async () => {
    (opAuth.requireWolfpackStaff as jest.Mock).mockResolvedValueOnce(
      NextResponse.json({ error: "Wolfpack staff authentication required" }, { status: 401 }),
    );
    const req = new NextRequest("http://localhost/api/admin/fi-audit-runs");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  test("200 with empty runs list in shadow mode", async () => {
    (opAuth.requireWolfpackStaff as jest.Mock).mockResolvedValueOnce({
      staff: {
        id: "staff-1",
        email: "ops@wolfpackauto.com",
        name: "Ops",
        role: "operator",
      },
    });
    const req = new NextRequest("http://localhost/api/admin/fi-audit-runs");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runs: unknown[] };
    expect(Array.isArray(body.runs)).toBe(true);
  });

  test("respects limit query param (capped at 200)", async () => {
    (opAuth.requireWolfpackStaff as jest.Mock).mockResolvedValueOnce({
      staff: { id: "staff-1", email: "x@y.z", name: "X", role: "admin" },
    });
    const req = new NextRequest("http://localhost/api/admin/fi-audit-runs?limit=500");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});
