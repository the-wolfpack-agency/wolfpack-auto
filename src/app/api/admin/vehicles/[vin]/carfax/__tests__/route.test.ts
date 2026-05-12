/**
 * Contract tests for /api/admin/vehicles/[vin]/carfax.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockRequireAuth = jest.fn();
const mockGetCarfax = jest.fn();

jest.mock("@/lib/auth-guard", () => ({
  requireAuth: (...a: any[]) => mockRequireAuth(...a),
  isAuthenticated: (r: any) => !(r && typeof r.status === "number"),
}));
jest.mock("@/lib/external-credentials/carfax-client", () => ({
  getCarfaxReport: (...a: any[]) => mockGetCarfax(...a),
}));

import { NextRequest, NextResponse } from "next/server";
import { GET } from "@/app/api/admin/vehicles/[vin]/carfax/route";

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
  new NextRequest(`http://localhost/api/admin/vehicles/${VIN}/carfax`, { method: "GET" });

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockGetCarfax.mockReset();
});

describe("GET /api/admin/vehicles/[vin]/carfax", () => {
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

  it("200 with available:false reason no_credential when dealer has no credential", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockGetCarfax.mockResolvedValueOnce({
      ok: false,
      error: { code: "upstream_unavailable", message: "no_credential" },
    });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toBe("no_credential");
  });

  it("400 when client returns invalid_input", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockGetCarfax.mockResolvedValueOnce({
      ok: false,
      error: { code: "invalid_input", message: "VIN must be 17 chars" },
    });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(400);
  });

  it("200 with available:true on happy path", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockGetCarfax.mockResolvedValueOnce({
      ok: true,
      value: {
        vin: VIN,
        ownerCount: 2,
        accidentCount: 0,
        isMock: false,
        providerLabel: "Carfax for Dealers",
        fetchedAt: "2026-05-12T00:00:00Z",
      },
    });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.mock_in_use).toBe(false);
    expect(body.report.ownerCount).toBe(2);
  });

  it("200 with available:false when upstream returns 5xx (graceful)", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockGetCarfax.mockResolvedValueOnce({
      ok: false,
      error: { code: "upstream_error", message: "Carfax HTTP 500", status: 500 },
    });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toBe("upstream_error");
  });
});
