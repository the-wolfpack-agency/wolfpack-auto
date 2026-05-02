/**
 * Contract tests for the admin/auction route family:
 *   GET  /api/admin/auction/opportunities                 → 200 / 401
 *   POST /api/admin/auction/opportunities/[id]/[action]   → 200 / 400 / 401 / 404
 *   GET  /api/admin/auction/benchmarks                    → 200 / 400 / 401 / 404
 *   GET  /api/cron/auction-sync                           → 200 / 401
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockRequireAuth = jest.fn();
const mockHandleAction = jest.fn();
const mockGetBenchmark = jest.fn();
const mockSyncAll = jest.fn();
const mockScoreOpps = jest.fn();

jest.mock("@/lib/auth-guard", () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
  isAuthenticated: (r: any) => !(r && typeof r.status === "number"),
}));
jest.mock("@/lib/auction-feed", () => ({
  handleOpportunityAction: (...args: any[]) => mockHandleAction(...args),
  getTradeBenchmark: (...args: any[]) => mockGetBenchmark(...args),
  syncAllSources: (...args: any[]) => mockSyncAll(...args),
  scoreAcquisitionOpportunities: (...args: any[]) => mockScoreOpps(...args),
}));
jest.mock("@/lib/analytics", () => ({
  trackServerEvent: jest.fn().mockResolvedValue(undefined),
}));

import { NextRequest, NextResponse } from "next/server";
import { GET as listOpps } from "@/app/api/admin/auction/opportunities/route";
import { POST as actOpp } from "@/app/api/admin/auction/opportunities/[id]/[action]/route";
import { GET as getBench } from "@/app/api/admin/auction/benchmarks/route";
import { GET as cronSync } from "@/app/api/cron/auction-sync/route";

const DEALER = "00000000-0000-4000-a000-000000000001";

function authedUser() {
  return {
    user: { id: "u1", email: "u@x.com", name: "U", dealer_id: DEALER, role: "admin" },
  };
}
function authFail() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockHandleAction.mockReset();
  mockGetBenchmark.mockReset();
  mockSyncAll.mockReset();
  mockScoreOpps.mockReset();
  delete process.env.DATABASE_URL;
  delete process.env.CRON_SECRET;
});

describe("GET /api/admin/auction/opportunities", () => {
  it("401 unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(authFail());
    const req = new NextRequest("http://localhost/api/admin/auction/opportunities");
    const res = await listOpps(req);
    expect(res.status).toBe(401);
  });

  it("200 with demo data when DATABASE_URL absent", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest("http://localhost/api/admin/auction/opportunities");
    const res = await listOpps(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.opportunities)).toBe(true);
    expect(body.opportunities.length).toBeGreaterThan(0);
  });

  it("200 with status filter accepted", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest("http://localhost/api/admin/auction/opportunities?status=open");
    const res = await listOpps(req);
    expect(res.status).toBe(200);
  });
});

describe("POST /api/admin/auction/opportunities/[id]/[action]", () => {
  const params = (id: string, action: string) =>
    Promise.resolve({ id, action });

  it("401 unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(authFail());
    const req = new NextRequest("http://localhost/api/admin/auction/opportunities/x/bid", { method: "POST" });
    const res = await actOpp(req, { params: params("x", "bid") });
    expect(res.status).toBe(401);
  });

  it("400 invalid action", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest("http://localhost/api/admin/auction/opportunities/x/destroy", { method: "POST" });
    const res = await actOpp(req, { params: params("x", "destroy") });
    expect(res.status).toBe(400);
  });

  it("400 missing id", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest("http://localhost/api/admin/auction/opportunities//bid", { method: "POST" });
    const res = await actOpp(req, { params: params("", "bid") });
    expect(res.status).toBe(400);
  });

  it("200 valid action", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockHandleAction.mockResolvedValueOnce({ ok: true, status: "bidding" });
    const req = new NextRequest("http://localhost/api/admin/auction/opportunities/o-1/bid", { method: "POST" });
    const res = await actOpp(req, { params: params("o-1", "bid") });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("bidding");
  });

  it("404 when opportunity missing in real DB mode", async () => {
    process.env.DATABASE_URL = "postgresql://test";
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockHandleAction.mockResolvedValueOnce({ ok: false, status: "won" });
    const req = new NextRequest("http://localhost/api/admin/auction/opportunities/missing/won", { method: "POST" });
    const res = await actOpp(req, { params: params("missing", "won") });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/admin/auction/benchmarks", () => {
  it("401 unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(authFail());
    const req = new NextRequest("http://localhost/api/admin/auction/benchmarks?year=2021&make=Honda&model=Accord&mileage=42000");
    const res = await getBench(req);
    expect(res.status).toBe(401);
  });

  it("400 missing required params", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest("http://localhost/api/admin/auction/benchmarks");
    const res = await getBench(req);
    expect(res.status).toBe(400);
  });

  it("400 non-numeric year", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest("http://localhost/api/admin/auction/benchmarks?year=abc&make=Honda&model=Accord&mileage=42000");
    const res = await getBench(req);
    expect(res.status).toBe(400);
  });

  it("400 short VIN", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest("http://localhost/api/admin/auction/benchmarks?vin=tooShort");
    const res = await getBench(req);
    expect(res.status).toBe(400);
  });

  it("200 with synthetic benchmark", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockGetBenchmark.mockResolvedValueOnce({
      vin_pattern: "2021|honda|accord|ex|25-50k",
      year: 2021, make: "Honda", model: "Accord", trim: "EX",
      mileage_band: "25-50k", p25_cents: 1_500_000, p50_cents: 1_700_000,
      p75_cents: 1_900_000, sample_size: 0, last_updated_at: new Date().toISOString(),
    });
    const req = new NextRequest("http://localhost/api/admin/auction/benchmarks?year=2021&make=Honda&model=Accord&mileage=42000");
    const res = await getBench(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.benchmark).toBeDefined();
    expect(data.benchmark.p50_cents).toBe(1_700_000);
  });
});

describe("GET /api/cron/auction-sync", () => {
  it("200 with no DATABASE_URL", async () => {
    mockSyncAll.mockResolvedValueOnce([]);
    const req = new NextRequest("http://localhost/api/cron/auction-sync");
    const res = await cronSync(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("401 with wrong CRON_SECRET", async () => {
    process.env.CRON_SECRET = "expected";
    const req = new NextRequest("http://localhost/api/cron/auction-sync", {
      headers: { authorization: "Bearer wrong" },
    });
    const res = await cronSync(req);
    expect(res.status).toBe(401);
  });

  it("200 with correct CRON_SECRET", async () => {
    process.env.CRON_SECRET = "match";
    mockSyncAll.mockResolvedValueOnce([]);
    const req = new NextRequest("http://localhost/api/cron/auction-sync", {
      headers: { authorization: "Bearer match" },
    });
    const res = await cronSync(req);
    expect(res.status).toBe(200);
  });
});
