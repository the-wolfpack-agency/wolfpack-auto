/**
 * Contract tests for /api/admin/vehicles/[vin]/market-intel.
 *
 * Covers:
 *   GET   200 (data present)
 *   GET   200 (no DATABASE_URL — shadow mode payload, mock_in_use=true)
 *   GET   400 (missing VIN)
 *   GET   401 (unauthenticated)
 *   GET   404 (vehicle not found for the dealer)
 *   POST  200 (refresh succeeds)
 *   POST  401 (unauthenticated)
 *   POST  404 (vehicle not found)
 *
 * Idempotency: calling GET twice in a row returns the same body shape.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockRequireAuth = jest.fn();
const mockLoadCurrent = jest.fn();
const mockRefresh = jest.fn();
const mockQuery = jest.fn();

jest.mock("@/lib/auth-guard", () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
  isAuthenticated: (r: any) => !(r && typeof r.status === "number"),
}));
jest.mock("@/lib/market-intel", () => ({
  loadCurrentMarketIntel: (...args: any[]) => mockLoadCurrent(...args),
  refreshVehicleMarketIntel: (...args: any[]) => mockRefresh(...args),
}));
jest.mock("@/lib/db", () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

import { NextRequest, NextResponse } from "next/server";
import {
  GET,
  POST,
} from "@/app/api/admin/vehicles/[vin]/market-intel/route";

const DEALER = "00000000-0000-4000-a000-000000000001";
const VIN = "1HGCM82633A123456";

function authedUser() {
  return {
    user: { id: "u1", email: "u@x.com", name: "U", dealer_id: DEALER, role: "admin" },
  };
}
function authFail() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}

function ctx(vin: string | undefined = VIN) {
  return { params: Promise.resolve({ vin: vin as string }) };
}

function req(method: "GET" | "POST" = "GET", url = `http://localhost/api/admin/vehicles/${VIN}/market-intel`) {
  return new NextRequest(url, { method });
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockLoadCurrent.mockReset();
  mockRefresh.mockReset();
  mockQuery.mockReset();
  delete process.env.DATABASE_URL;
});

/* ------------------------------------------------------------------ */
/*  GET                                                                */
/* ------------------------------------------------------------------ */

describe("GET /api/admin/vehicles/[vin]/market-intel", () => {
  it("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(authFail());
    const res = await GET(req(), ctx());
    expect(res.status).toBe(401);
  });

  it("400 when VIN is missing in params", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const res = await GET(req(), ctx(""));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/VIN/);
  });

  it("200 (shadow payload) when DATABASE_URL is unset", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.noData).toBe(true);
    expect(body.noDataReason).toBe("database_unavailable");
    expect(body.mock_in_use).toBe(true);
    expect(body.signal).toBeNull();
  });

  it("404 when no vehicle row matches dealer+vin", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(404);
  });

  it("200 with full payload when a vehicle exists", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "veh-1", price: 25000, created_at: new Date() }],
    });
    mockLoadCurrent.mockResolvedValueOnce({
      signal: {
        vehicleId: "veh-1",
        dealerId: DEALER,
        daysOnLot: 12,
        marketVelocityDaysMedian: 35,
        ourPriceCents: 2_500_000,
        marketValueCents: 2_450_000,
        priceDeltaCents: 50_000,
        recommendation: "HOLD",
        confidence: 0.8,
        rationale: "Price and pace are in line with the local market.",
        comparablesCount: 4,
        generatedAt: new Date().toISOString(),
      },
      recentSnapshots: [
        { source: "mock", market_value_cents: 2_450_000, captured_at: new Date().toISOString(), is_mock: true },
      ],
      topComparables: [
        {
          compSource: "mock",
          compVinOrId: "MOCK-1",
          compPriceCents: 2_440_000,
          isMock: true,
          capturedAt: new Date().toISOString(),
        },
      ],
    });
    const res = await GET(req(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.signal.recommendation).toBe("HOLD");
    expect(body.mock_in_use).toBe(true);
    expect(Array.isArray(body.top_comparables)).toBe(true);
    expect(body.vin).toBe(VIN.toUpperCase());
  });

  it("is idempotent — two consecutive GETs return the same response shape", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockRequireAuth.mockResolvedValue(authedUser());
    mockQuery.mockResolvedValue({
      rows: [{ id: "veh-1", price: 25000, created_at: new Date() }],
    });
    mockLoadCurrent.mockResolvedValue({
      signal: null,
      recentSnapshots: [],
      topComparables: [],
    });
    const r1 = await GET(req(), ctx());
    const r2 = await GET(req(), ctx());
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(Object.keys(b1).sort()).toEqual(Object.keys(b2).sort());
    expect(b1.noData).toBe(true);
    expect(b2.noData).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  POST                                                               */
/* ------------------------------------------------------------------ */

describe("POST /api/admin/vehicles/[vin]/market-intel", () => {
  it("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(authFail());
    const res = await POST(req("POST"), ctx());
    expect(res.status).toBe(401);
  });

  it("returns success=false (200) in shadow mode (no DB)", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const res = await POST(req("POST"), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.noDataReason).toBe("database_unavailable");
  });

  it("404 when vehicle missing", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await POST(req("POST"), ctx());
    expect(res.status).toBe(404);
  });

  it("200 refresh path runs refreshVehicleMarketIntel with via=api", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "veh-1",
          vin: VIN,
          year: 2022,
          make: "Honda",
          model: "Accord",
          trim: "EX",
          mileage: 30_000,
          price: 25_000,
          created_at: new Date(),
        },
      ],
    });
    mockRefresh.mockResolvedValueOnce({
      signal: { recommendation: "HOLD", confidence: 0.7 },
      value: { isMock: true },
      comparables: [],
    });
    const res = await POST(req("POST"), ctx());
    expect(res.status).toBe(200);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    const callArgs = mockRefresh.mock.calls[0];
    expect(callArgs[1]).toMatchObject({ via: "api", userId: "u1" });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.mock_in_use).toBe(true);
  });
});
