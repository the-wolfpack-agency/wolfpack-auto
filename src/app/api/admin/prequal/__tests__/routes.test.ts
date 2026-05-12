/**
 * Contract tests for the prequal admin routes added by Stream B.
 *
 *   POST /api/admin/prequal/[id]/route-to-lender
 *   POST /api/admin/prequal/[id]/plaid-income
 *
 * Asserts 200 / 400 / 401 / 404 envelopes. Heavy mocking of the lib layer.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockRequireAuth = jest.fn();
const mockGetSession = jest.fn();
const mockRecordIncome = jest.fn().mockResolvedValue(undefined);
const mockRoute = jest.fn();
const mockBuildClient = jest.fn();
const mockRunVerify = jest.fn();
const mockTrackPrequal = jest.fn();
const mockQuery = jest.fn();

jest.mock("@/lib/auth-guard", () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
  isAuthenticated: (r: any) => !(r && typeof r.status === "number"),
}));
jest.mock("@/lib/prequal/session-store", () => ({
  getSession: (...args: any[]) => mockGetSession(...args),
  recordIncome: (...args: any[]) => mockRecordIncome(...args),
}));
jest.mock("@/lib/prequal/lender-routing", () => ({
  routePrequalToLenders: (...args: any[]) => mockRoute(...args),
}));
jest.mock("@/lib/prequal/plaid-byo-client", () => ({
  buildPlaidByoClient: (...args: any[]) => mockBuildClient(...args),
  runByoIncomeVerification: (...args: any[]) => mockRunVerify(...args),
}));
jest.mock("@/lib/analytics-hooks", () => ({
  trackPrequal: (...args: any[]) => mockTrackPrequal(...args),
}));
jest.mock("@/lib/audit-log", () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/db", () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

import { NextRequest, NextResponse } from "next/server";
import { POST as routeToLenderPost } from "@/app/api/admin/prequal/[id]/route-to-lender/route";
import { POST as plaidPost } from "@/app/api/admin/prequal/[id]/plaid-income/route";

const DEALER = "00000000-0000-4000-a000-000000000001";

function authed() {
  return {
    user: { id: "u1", email: "u@x.com", name: "U", dealer_id: DEALER, role: "admin" },
  };
}
function unauthed() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockGetSession.mockReset();
  mockRecordIncome.mockClear();
  mockRoute.mockReset();
  mockBuildClient.mockReset();
  mockRunVerify.mockReset();
  mockTrackPrequal.mockClear();
  mockQuery.mockReset();
  process.env.DATABASE_URL = "postgres://x";
});

/* -------------------------------------------------------------------------- */
/* POST /route-to-lender                                                      */
/* -------------------------------------------------------------------------- */

describe("POST /api/admin/prequal/[id]/route-to-lender", () => {
  it("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(unauthed());
    const req = new NextRequest(
      "http://localhost/api/admin/prequal/p1/route-to-lender",
      { method: "POST", body: "{}" },
    );
    const res = await routeToLenderPost(req, ctx("p1"));
    expect(res.status).toBe(401);
  });

  it("400 on invalid JSON body", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const req = new NextRequest(
      "http://localhost/api/admin/prequal/p1/route-to-lender",
      { method: "POST", body: "not-json" },
    );
    const res = await routeToLenderPost(req, ctx("p1"));
    expect(res.status).toBe(400);
  });

  it("200 + shadow_mode when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    mockRequireAuth.mockResolvedValueOnce(authed());
    const req = new NextRequest(
      "http://localhost/api/admin/prequal/p1/route-to-lender",
      { method: "POST", body: "{}" },
    );
    const res = await routeToLenderPost(req, ctx("p1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shadow_mode).toBe(true);
  });

  it("404 when prequal not found", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockGetSession.mockResolvedValueOnce(null);
    const req = new NextRequest(
      "http://localhost/api/admin/prequal/p1/route-to-lender",
      { method: "POST", body: "{}" },
    );
    const res = await routeToLenderPost(req, ctx("p1"));
    expect(res.status).toBe(404);
  });

  it("404 when prequal belongs to another dealer", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockGetSession.mockResolvedValueOnce({
      id: "p1",
      dealer_id: "other-dealer",
      customer_name: "x",
      customer_email: "x",
      customer_phone: null,
      vehicle_interest_text: "x",
      status: "credit_pulled",
      started_at: "",
      completed_at: null,
      ip_address: null,
      user_agent: null,
    });
    const req = new NextRequest(
      "http://localhost/api/admin/prequal/p1/route-to-lender",
      { method: "POST", body: "{}" },
    );
    const res = await routeToLenderPost(req, ctx("p1"));
    expect(res.status).toBe(404);
  });

  it("400 when no credit pull on file", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockGetSession.mockResolvedValueOnce({
      id: "p1",
      dealer_id: DEALER,
      customer_name: "x",
      customer_email: "x",
      customer_phone: null,
      vehicle_interest_text: "x",
      status: "started",
      started_at: "",
      completed_at: null,
      ip_address: null,
      user_agent: null,
    });
    // Both credit + income lookups return empty
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // credit
      .mockResolvedValueOnce({ rows: [] }); // income
    const req = new NextRequest(
      "http://localhost/api/admin/prequal/p1/route-to-lender",
      { method: "POST", body: "{}" },
    );
    const res = await routeToLenderPost(req, ctx("p1"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/soft credit pull/i);
  });

  it("200 + dispatch ids on happy path", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockGetSession.mockResolvedValueOnce({
      id: "p1",
      dealer_id: DEALER,
      customer_name: "Jane",
      customer_email: "jane@x.com",
      customer_phone: null,
      vehicle_interest_text: "Truck",
      status: "income_verified",
      started_at: "",
      completed_at: null,
      ip_address: null,
      user_agent: null,
    });
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            bureau_used: "mock",
            score_range_min: 660,
            score_range_max: 700,
            tier: "prime",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ income_monthly_cents: "600000", income_confidence: "self_reported" }],
      });
    mockRoute.mockResolvedValueOnce({
      prequalId: "p1",
      dispatches: [
        {
          dispatchId: "d1",
          lenderRouteId: "r1",
          lenderName: "ACME",
          contactEmail: "a@x.co",
          status: "sent",
        },
      ],
      packetSubject: "subj",
    });
    const req = new NextRequest(
      "http://localhost/api/admin/prequal/p1/route-to-lender",
      { method: "POST", body: "{}" },
    );
    const res = await routeToLenderPost(req, ctx("p1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dispatches[0].dispatchId).toBe("d1");
  });
});

/* -------------------------------------------------------------------------- */
/* POST /plaid-income                                                         */
/* -------------------------------------------------------------------------- */

describe("POST /api/admin/prequal/[id]/plaid-income", () => {
  it("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(unauthed());
    const req = new NextRequest(
      "http://localhost/api/admin/prequal/p1/plaid-income",
      { method: "POST", body: JSON.stringify({ action: "link" }) },
    );
    const res = await plaidPost(req, ctx("p1"));
    expect(res.status).toBe(401);
  });

  it("400 when action invalid", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const req = new NextRequest(
      "http://localhost/api/admin/prequal/p1/plaid-income",
      { method: "POST", body: JSON.stringify({ action: "bogus" }) },
    );
    const res = await plaidPost(req, ctx("p1"));
    expect(res.status).toBe(400);
  });

  it("400 when verify without public_token", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const req = new NextRequest(
      "http://localhost/api/admin/prequal/p1/plaid-income",
      { method: "POST", body: JSON.stringify({ action: "verify" }) },
    );
    const res = await plaidPost(req, ctx("p1"));
    expect(res.status).toBe(400);
  });

  it("422 when dealer has not configured Plaid (link action)", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockBuildClient.mockResolvedValueOnce({
      ok: false,
      error: { kind: "missing_credentials", message: "no plaid", hint: "configure plaid" },
    });
    const req = new NextRequest(
      "http://localhost/api/admin/prequal/p1/plaid-income",
      { method: "POST", body: JSON.stringify({ action: "link" }) },
    );
    const res = await plaidPost(req, ctx("p1"));
    expect(res.status).toBe(422);
  });

  it("200 on link happy path", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockBuildClient.mockResolvedValueOnce({
      ok: true,
      value: {
        isReal: () => false,
        createLinkToken: async () => ({
          ok: true,
          value: { linkToken: "tok", isMock: true, expiresAt: "z" },
        }),
        verifyIncome: async () => ({ ok: true, value: { incomeMonthlyCents: 0, confidence: "mock", isMock: true } }),
      },
    });
    const req = new NextRequest(
      "http://localhost/api/admin/prequal/p1/plaid-income",
      { method: "POST", body: JSON.stringify({ action: "link" }) },
    );
    const res = await plaidPost(req, ctx("p1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.link_token).toBe("tok");
  });

  it("404 on verify when prequal belongs to another dealer", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockGetSession.mockResolvedValueOnce({
      id: "p1",
      dealer_id: "other",
      customer_name: "x",
      customer_email: "x",
      customer_phone: null,
      vehicle_interest_text: "x",
      status: "credit_pulled",
      started_at: "",
      completed_at: null,
      ip_address: null,
      user_agent: null,
    });
    const req = new NextRequest(
      "http://localhost/api/admin/prequal/p1/plaid-income",
      { method: "POST", body: JSON.stringify({ action: "verify", public_token: "pt" }) },
    );
    const res = await plaidPost(req, ctx("p1"));
    expect(res.status).toBe(404);
  });

  it("200 on verify happy path", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockGetSession.mockResolvedValueOnce({
      id: "p1",
      dealer_id: DEALER,
      customer_name: "x",
      customer_email: "x",
      customer_phone: null,
      vehicle_interest_text: "x",
      status: "credit_pulled",
      started_at: "",
      completed_at: null,
      ip_address: null,
      user_agent: null,
    });
    mockRunVerify.mockResolvedValueOnce({
      ok: true,
      value: {
        incomeMonthlyCents: 700_000,
        confidence: "mock",
        isMock: true,
      },
    });
    const req = new NextRequest(
      "http://localhost/api/admin/prequal/p1/plaid-income",
      { method: "POST", body: JSON.stringify({ action: "verify", public_token: "pt" }) },
    );
    const res = await plaidPost(req, ctx("p1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.income_monthly_cents).toBe(700_000);
    expect(mockRecordIncome).toHaveBeenCalled();
  });
});
