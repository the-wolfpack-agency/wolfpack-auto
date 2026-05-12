/**
 * Contract tests for /api/admin/vehicles/[vin]/edmunds-valuation.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockRequireAuth = jest.fn();
const mockGetValuation = jest.fn();

jest.mock("@/lib/auth-guard", () => ({
  requireAuth: (...a: any[]) => mockRequireAuth(...a),
  isAuthenticated: (r: any) => !(r && typeof r.status === "number"),
}));
jest.mock("@/lib/external-credentials/edmunds-client", () => ({
  getValuation: (...a: any[]) => mockGetValuation(...a),
}));

import { NextRequest, NextResponse } from "next/server";
import { GET } from "@/app/api/admin/vehicles/[vin]/edmunds-valuation/route";

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
function req(url = `http://localhost/api/admin/vehicles/${VIN}/edmunds-valuation`) {
  return new NextRequest(url, { method: "GET" });
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockGetValuation.mockReset();
});

describe("GET /api/admin/vehicles/[vin]/edmunds-valuation", () => {
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

  it("400 on invalid_input from client", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockGetValuation.mockResolvedValueOnce({
      ok: false,
      error: { code: "invalid_input", message: "bad VIN" },
    });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(400);
  });

  it("200 with available:false on upstream_unavailable", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockGetValuation.mockResolvedValueOnce({
      ok: false,
      error: { code: "upstream_unavailable", message: "503" },
    });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.reason).toBe("upstream_unavailable");
  });

  it("200 with valuation on success", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockGetValuation.mockResolvedValueOnce({
      ok: true,
      value: {
        vin: VIN,
        providerLabel: "Edmunds (public)",
        tradeInValueCents: 1_000_000,
        privatePartyValueCents: 1_100_000,
        dealerRetailValueCents: 1_200_000,
        marketAverageCents: 1_100_000,
        capturedAt: "2026-05-12T00:00:00Z",
        isMock: false,
      },
    });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.valuation.dealerRetailValueCents).toBe(1_200_000);
    expect(body.mock_in_use).toBe(false);
  });

  it("passes zip query param through to the client", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockGetValuation.mockResolvedValueOnce({
      ok: true,
      value: {
        vin: VIN,
        providerLabel: "Edmunds (public)",
        tradeInValueCents: 0,
        privatePartyValueCents: 0,
        dealerRetailValueCents: 0,
        marketAverageCents: 0,
        capturedAt: "x",
        isMock: false,
      },
    });
    await GET(req(`http://localhost/api/admin/vehicles/${VIN}/edmunds-valuation?zip=90210`), ctx());
    expect(mockGetValuation).toHaveBeenCalledWith(
      expect.objectContaining({ zipCode: "90210" }),
      DEALER,
    );
  });
});
