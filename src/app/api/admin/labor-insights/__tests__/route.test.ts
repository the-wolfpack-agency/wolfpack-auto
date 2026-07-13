/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contract tests for GET /api/admin/labor-insights.
 * Asserts 200 / 401 / 403 and that dealer_id is always taken from the session,
 * never echoed from the query string.
 */

const mockRequireAuth = jest.fn();
const mockGetDealerId = jest.fn();
const mockRefresh = jest.fn();

jest.mock("@/lib/auth-guard", () => ({
  requireAuth: (...a: any[]) => mockRequireAuth(...a),
}));
jest.mock("@/lib/get-dealer-id", () => ({
  getDealerId: (...a: any[]) => mockGetDealerId(...a),
}));
jest.mock("@/lib/labor-insight", () => ({
  refreshLaborInsights: (...a: any[]) => mockRefresh(...a),
  // Keep the real period resolver so date validation is exercised.
  resolvePeriod: jest.requireActual("@/lib/labor-insight/index").resolvePeriod,
}));

import { NextRequest, NextResponse } from "next/server";
import { GET } from "../route";

function sampleReport(dealerId: string) {
  return {
    dealerId,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-13",
    headcount: 12,
    insights: [
      {
        id: "labor_margin_x",
        dealerId,
        kind: "labor_cost_vs_margin",
        insight: "Labor is 22% of your gross profit, up 4 points; the extra came from overtime, not headcount.",
        category: "labor",
        confidence: 0.85,
        sample_size: 12,
        severity: "action",
        generated_at: "2026-07-13T00:00:00.000Z",
        data: {},
      },
    ],
    ledger: {
      grossProfit: 420000,
      laborCost: 92400,
      overtimeCost: 610,
      headcount: 12,
      priorLaborPct: 18,
      priorHeadcount: 12,
    },
    isDemo: false,
    generatedAt: "2026-07-13T00:00:00.000Z",
  };
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockGetDealerId.mockReset();
  mockRefresh.mockReset();
  mockRequireAuth.mockResolvedValue({ user: { id: "u1", dealer_id: "dealer-1" } });
  mockGetDealerId.mockReturnValue("dealer-1");
  mockRefresh.mockImplementation(async (dealerId: string) => sampleReport(dealerId));
});

function req(qs = ""): NextRequest {
  return new NextRequest(`https://x.test/api/admin/labor-insights${qs}`);
}

describe("auth contract", () => {
  test("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    );
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  test("403 forwarded from the auth guard", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("200 path", () => {
  test("returns the report with insights + session dealerId", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.insights)).toBe(true);
    expect(body.insights[0].kind).toBe("labor_cost_vs_margin");
    expect(body.dealerId).toBe("dealer-1");
    expect(mockRefresh).toHaveBeenCalledWith("dealer-1", expect.objectContaining({ via: "api" }));
  });

  test("never trusts a user-supplied dealerId from the query string", async () => {
    const res = await GET(req("?dealerId=ATTACKER_DEALER"));
    const body = await res.json();
    expect(body.dealerId).toBe("dealer-1");
    const [dealerArg] = mockRefresh.mock.calls[0];
    expect(dealerArg).toBe("dealer-1");
    expect(dealerArg).not.toBe("ATTACKER_DEALER");
  });

  test("passes a resolved period (validated ISO dates) through to the refresh", async () => {
    await GET(req("?periodStart=2026-06-01&periodEnd=2026-06-30"));
    const [, opts] = mockRefresh.mock.calls[0];
    expect(opts.period.periodStart).toBe("2026-06-01");
    expect(opts.period.periodEnd).toBe("2026-06-30");
    // Prior period is the calendar month before the start.
    expect(opts.period.priorStart).toBe("2026-05-01");
    expect(opts.period.priorEnd).toBe("2026-05-31");
  });
});
