/**
 * Contract tests for /api/admin/vehicles/[vin]/autocheck.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockRequireAuth = jest.fn();
const mockGetAutoCheck = jest.fn();

jest.mock("@/lib/auth-guard", () => ({
  requireAuth: (...a: any[]) => mockRequireAuth(...a),
  isAuthenticated: (r: any) => !(r && typeof r.status === "number"),
}));
jest.mock("@/lib/external-credentials/autocheck-client", () => ({
  getAutoCheckReport: (...a: any[]) => mockGetAutoCheck(...a),
}));

import { NextRequest, NextResponse } from "next/server";
import { GET } from "@/app/api/admin/vehicles/[vin]/autocheck/route";

const DEALER = "00000000-0000-4000-a000-000000000001";
const VIN = "1HGCM82633A123456";

function authed() {
  return {
    user: { id: "u1", email: "u@x.com", name: "U", dealer_id: DEALER, role: "admin" },
  };
}
function authFail() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}
function ctx(vin = VIN) {
  return { params: Promise.resolve({ vin }) };
}
const req = () =>
  new NextRequest(`http://localhost/api/admin/vehicles/${VIN}/autocheck`, { method: "GET" });

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockGetAutoCheck.mockReset();
});

describe("GET /api/admin/vehicles/[vin]/autocheck", () => {
  it("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(authFail());
    const res = await GET(req(), ctx());
    expect(res.status).toBe(401);
  });

  it("400 when VIN missing", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const res = await GET(req(), ctx(""));
    expect(res.status).toBe(400);
  });

  it("200 with no_credential reason when dealer has no credential", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockGetAutoCheck.mockResolvedValueOnce({
      ok: false,
      error: { code: "upstream_unavailable", message: "no_credential" },
    });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toBe("no_credential");
  });

  it("200 happy path", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockGetAutoCheck.mockResolvedValueOnce({
      ok: true,
      value: {
        vin: VIN,
        autocheckScore: 90,
        isMock: false,
        providerLabel: "AutoCheck (Experian)",
        fetchedAt: "2026-05-12T00:00:00Z",
      },
    });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.report.autocheckScore).toBe(90);
  });
});
