/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contract tests for /api/admin/modules (GET + PUT).
 * Asserts 200 / 401 / 403 / 400 and that PUT is agency-only and validates keys.
 */
const mockRequireAuth = jest.fn();
const mockRequireRole = jest.fn();
const mockGetEnabled = jest.fn();
const mockSetEnabled = jest.fn();

jest.mock("@/lib/auth-guard", () => ({
  requireAuth: (...a: any[]) => mockRequireAuth(...a),
  requireRole: (...a: any[]) => mockRequireRole(...a),
  // Real implementation: authenticated iff not a NextResponse.
  isAuthenticated: (r: any) =>
    !(r && typeof r === "object" && typeof r.status === "number" && "json" in r),
}));
jest.mock("@/lib/module-access", () => ({
  getEnabledModules: (...a: any[]) => mockGetEnabled(...a),
  setEnabledModules: (...a: any[]) => mockSetEnabled(...a),
}));
jest.mock("@/lib/audit-log", () => ({ auditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/analytics-hooks", () => ({ trackSystem: jest.fn() }));

import { NextRequest, NextResponse } from "next/server";
import { GET, PUT } from "../route";

const ORIGINAL_DB_URL = process.env.DATABASE_URL;
const AGENCY = { user: { id: "u1", dealer_id: "dealer-1", role: "admin" } };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATABASE_URL = "postgres://test";
  mockRequireAuth.mockResolvedValue({ user: { id: "u1", dealer_id: "dealer-1", role: "sub_dealer" } });
  mockRequireRole.mockResolvedValue(AGENCY);
  mockGetEnabled.mockResolvedValue(["payroll", "accounting"]);
  mockSetEnabled.mockResolvedValue(true);
});
afterAll(() => {
  if (ORIGINAL_DB_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DB_URL;
});

function putReq(body: unknown): NextRequest {
  return new NextRequest("https://x.test/api/admin/modules", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("GET /api/admin/modules", () => {
  test("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(NextResponse.json({ error: "no" }, { status: 401 }));
    const res = await GET(new NextRequest("https://x.test/api/admin/modules"));
    expect(res.status).toBe(401);
  });

  test("200 returns role, enabled allow-list, and the full key catalog", async () => {
    const res = await GET(new NextRequest("https://x.test/api/admin/modules"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("sub_dealer");
    expect(body.enabled).toEqual(["payroll", "accounting"]);
    expect(Array.isArray(body.all_keys)).toBe(true);
    expect(body.all_keys).toContain("payroll");
  });
});

describe("PUT /api/admin/modules", () => {
  test("403 for a non-agency role (requireRole rejects)", async () => {
    mockRequireRole.mockResolvedValueOnce(NextResponse.json({ error: "forbidden" }, { status: 403 }));
    const res = await PUT(putReq({ modules: ["payroll"] }));
    expect(res.status).toBe(403);
    expect(mockSetEnabled).not.toHaveBeenCalled();
  });

  test("400 on unknown module keys (a typo can't disable everything)", async () => {
    const res = await PUT(putReq({ modules: ["payroll", "totally-fake-module"] }));
    expect(res.status).toBe(400);
    expect(mockSetEnabled).not.toHaveBeenCalled();
  });

  test("400 when modules is neither array nor null", async () => {
    const res = await PUT(putReq({ modules: "payroll" }));
    expect(res.status).toBe(400);
  });

  test("200 saves a valid allow-list (de-duped)", async () => {
    const res = await PUT(putReq({ modules: ["payroll", "payroll", "accounting"] }));
    expect(res.status).toBe(200);
    const [, saved] = mockSetEnabled.mock.calls[0];
    expect(saved.sort()).toEqual(["accounting", "payroll"]);
    const body = await res.json();
    expect(body.updated).toBe(true);
  });

  test("200 with modules:null clears the gate (all modules)", async () => {
    const res = await PUT(putReq({ modules: null }));
    expect(res.status).toBe(200);
    expect(mockSetEnabled).toHaveBeenCalledWith("dealer-1", null);
  });

  test("404 when the dealer row does not exist", async () => {
    mockSetEnabled.mockResolvedValueOnce(false);
    const res = await PUT(putReq({ modules: ["payroll"] }));
    expect(res.status).toBe(404);
  });
});
