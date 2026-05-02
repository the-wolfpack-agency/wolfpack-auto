/**
 * Contract tests for the deal-copilot admin routes.
 *
 *   POST /api/admin/deal-copilot/sessions
 *   POST /api/admin/deal-copilot/sessions/[id]/suggest
 *   POST /api/admin/deal-copilot/sessions/[id]/close
 *   POST /api/admin/deal-copilot/suggestions/[id]/accept
 *   POST /api/admin/deal-copilot/suggestions/[id]/reject
 *
 * Asserts 200 / 201 / 400 / 401 envelopes for each verb. The lib layer is
 * mocked — these tests exercise only the route shape (auth, parsing,
 * validation, status codes, analytics emission).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockRequireAuth = jest.fn();
const mockOpenSession = jest.fn();
const mockGenerateSuggestions = jest.fn();
const mockAcceptSuggestion = jest.fn();
const mockRejectSuggestion = jest.fn();
const mockRecordOutcome = jest.fn();
const mockTrackServerEvent = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/auth-guard", () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
  isAuthenticated: (r: any) => !(r && typeof r.status === "number"),
}));

jest.mock("@/lib/deal-copilot", () => ({
  openSession: (...args: any[]) => mockOpenSession(...args),
  generateSuggestions: (...args: any[]) => mockGenerateSuggestions(...args),
  acceptSuggestion: (...args: any[]) => mockAcceptSuggestion(...args),
  rejectSuggestion: (...args: any[]) => mockRejectSuggestion(...args),
  recordOutcome: (...args: any[]) => mockRecordOutcome(...args),
}));

jest.mock("@/lib/analytics", () => ({
  trackServerEvent: (...args: any[]) => mockTrackServerEvent(...args),
}));

import { NextRequest, NextResponse } from "next/server";
import { POST as openPost } from "@/app/api/admin/deal-copilot/sessions/route";
import { POST as suggestPost } from "@/app/api/admin/deal-copilot/sessions/[id]/suggest/route";
import { POST as closePost } from "@/app/api/admin/deal-copilot/sessions/[id]/close/route";
import { POST as acceptPost } from "@/app/api/admin/deal-copilot/suggestions/[id]/accept/route";
import { POST as rejectPost } from "@/app/api/admin/deal-copilot/suggestions/[id]/reject/route";

const DEALER = "00000000-0000-4000-a000-000000000001";

function authed() {
  return {
    user: {
      id: "u1",
      email: "u@x.com",
      name: "U",
      dealer_id: DEALER,
      role: "admin",
    },
  };
}

function unauthed() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}

const validSnapshot = {
  selling_price: 38500,
  msrp: 40000,
  term_months: 72,
  cash_down: 2000,
  apr: 7.9,
  credit_tier: 2 as const,
  credit_score: 720,
  fi_products: [],
  vehicle_type: "new" as const,
};

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockOpenSession.mockReset();
  mockGenerateSuggestions.mockReset();
  mockAcceptSuggestion.mockReset();
  mockRejectSuggestion.mockReset();
  mockRecordOutcome.mockReset();
  mockTrackServerEvent.mockClear();
  process.env.DATABASE_URL = "postgresql://test";
});

/* -------------------------------------------------------------------------- */
/* POST /sessions                                                             */
/* -------------------------------------------------------------------------- */

describe("POST /api/admin/deal-copilot/sessions", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(unauthed());
    const req = new NextRequest("http://localhost/api/admin/deal-copilot/sessions", {
      method: "POST",
      body: JSON.stringify({ deal_id: "d1" }),
    });
    const res = await openPost(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid JSON", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const req = new NextRequest("http://localhost/api/admin/deal-copilot/sessions", {
      method: "POST",
      body: "{not-json",
    });
    const res = await openPost(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when deal_id is missing", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const req = new NextRequest("http://localhost/api/admin/deal-copilot/sessions", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await openPost(req);
    expect(res.status).toBe(400);
  });

  it("returns 201 with the new session and emits analytics", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockOpenSession.mockResolvedValueOnce({ id: "s1", dealer_id: DEALER, deal_id: "d1" });
    const req = new NextRequest("http://localhost/api/admin/deal-copilot/sessions", {
      method: "POST",
      body: JSON.stringify({ deal_id: "d1" }),
    });
    const res = await openPost(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.session.id).toBe("s1");
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      "copilot.session_opened",
      expect.objectContaining({ dealer_id: DEALER, session_id: "s1", deal_id: "d1" }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* POST /sessions/[id]/suggest                                                */
/* -------------------------------------------------------------------------- */

describe("POST /api/admin/deal-copilot/sessions/[id]/suggest", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(unauthed());
    const req = new NextRequest("http://localhost/api/admin/deal-copilot/sessions/s1/suggest", {
      method: "POST",
      body: JSON.stringify({ snapshot: validSnapshot }),
    });
    const res = await suggestPost(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid JSON", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const req = new NextRequest("http://localhost/api/admin/deal-copilot/sessions/s1/suggest", {
      method: "POST",
      body: "{not-json",
    });
    const res = await suggestPost(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 when snapshot is missing", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const req = new NextRequest("http://localhost/api/admin/deal-copilot/sessions/s1/suggest", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await suggestPost(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 when snapshot.selling_price is invalid", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const req = new NextRequest("http://localhost/api/admin/deal-copilot/sessions/s1/suggest", {
      method: "POST",
      body: JSON.stringify({ snapshot: { ...validSnapshot, selling_price: -1 } }),
    });
    const res = await suggestPost(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 when credit_tier is out of range", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const req = new NextRequest("http://localhost/api/admin/deal-copilot/sessions/s1/suggest", {
      method: "POST",
      body: JSON.stringify({ snapshot: { ...validSnapshot, credit_tier: 9 } }),
    });
    const res = await suggestPost(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 200 with suggestions and emits analytics", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockGenerateSuggestions.mockResolvedValueOnce([
      { id: "x1", suggestion_type: "rate_stack" },
    ]);
    const req = new NextRequest("http://localhost/api/admin/deal-copilot/sessions/s1/suggest", {
      method: "POST",
      body: JSON.stringify({ snapshot: validSnapshot }),
    });
    const res = await suggestPost(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.count).toBe(1);
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      "copilot.suggestions_generated",
      expect.objectContaining({ session_id: "s1", suggestion_count: 1 }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* POST /sessions/[id]/close                                                  */
/* -------------------------------------------------------------------------- */

describe("POST /api/admin/deal-copilot/sessions/[id]/close", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(unauthed());
    const req = new NextRequest("http://localhost/api/admin/deal-copilot/sessions/s1/close", {
      method: "POST",
      body: JSON.stringify({ outcome: "won" }),
    });
    const res = await closePost(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 when outcome is invalid", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const req = new NextRequest("http://localhost/api/admin/deal-copilot/sessions/s1/close", {
      method: "POST",
      body: JSON.stringify({ outcome: "stalled" }),
    });
    const res = await closePost(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 200 on won and emits the won event", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockRecordOutcome.mockResolvedValueOnce({ outcome_id: "o1", weights_updated: 2 });
    const req = new NextRequest("http://localhost/api/admin/deal-copilot/sessions/s1/close", {
      method: "POST",
      body: JSON.stringify({ outcome: "won", close_reason: "rate", gross_profit_cents: 250000 }),
    });
    const res = await closePost(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(200);
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      "copilot.session_closed_won",
      expect.objectContaining({ session_id: "s1", weights_updated: 2 }),
    );
  });

  it("returns 200 on lost and emits the lost event", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockRecordOutcome.mockResolvedValueOnce({ outcome_id: "o2", weights_updated: 1 });
    const req = new NextRequest("http://localhost/api/admin/deal-copilot/sessions/s1/close", {
      method: "POST",
      body: JSON.stringify({ outcome: "lost" }),
    });
    const res = await closePost(req, { params: Promise.resolve({ id: "s1" }) });
    expect(res.status).toBe(200);
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      "copilot.session_closed_lost",
      expect.objectContaining({ session_id: "s1" }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* POST /suggestions/[id]/accept                                              */
/* -------------------------------------------------------------------------- */

describe("POST /api/admin/deal-copilot/suggestions/[id]/accept", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(unauthed());
    const req = new NextRequest("http://localhost/api/admin/deal-copilot/suggestions/sg1/accept", {
      method: "POST",
      body: "{}",
    });
    const res = await acceptPost(req, { params: Promise.resolve({ id: "sg1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 200 and emits analytics on success", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockAcceptSuggestion.mockResolvedValueOnce({
      id: "sg1",
      suggestion_type: "rate_stack",
      session_id: "s1",
    });
    const req = new NextRequest("http://localhost/api/admin/deal-copilot/suggestions/sg1/accept", {
      method: "POST",
      body: "{}",
    });
    const res = await acceptPost(req, { params: Promise.resolve({ id: "sg1" }) });
    expect(res.status).toBe(200);
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      "copilot.suggestion_accepted",
      expect.objectContaining({ suggestion_id: "sg1", suggestion_type: "rate_stack" }),
    );
  });

  it("returns 200 with null suggestion when DB row missing (shadow mode)", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockAcceptSuggestion.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/admin/deal-copilot/suggestions/sg1/accept", {
      method: "POST",
      body: "{}",
    });
    const res = await acceptPost(req, { params: Promise.resolve({ id: "sg1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.suggestion).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* POST /suggestions/[id]/reject                                              */
/* -------------------------------------------------------------------------- */

describe("POST /api/admin/deal-copilot/suggestions/[id]/reject", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(unauthed());
    const req = new NextRequest("http://localhost/api/admin/deal-copilot/suggestions/sg1/reject", {
      method: "POST",
      body: JSON.stringify({ reason: "no fit" }),
    });
    const res = await rejectPost(req, { params: Promise.resolve({ id: "sg1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 200 and emits analytics with reason", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockRejectSuggestion.mockResolvedValueOnce({ id: "sg1", suggestion_type: "lender_swap" });
    const req = new NextRequest("http://localhost/api/admin/deal-copilot/suggestions/sg1/reject", {
      method: "POST",
      body: JSON.stringify({ reason: "rate ok" }),
    });
    const res = await rejectPost(req, { params: Promise.resolve({ id: "sg1" }) });
    expect(res.status).toBe(200);
    expect(mockTrackServerEvent).toHaveBeenCalledWith(
      "copilot.suggestion_rejected",
      expect.objectContaining({ suggestion_id: "sg1", reason: "rate ok" }),
    );
  });

  it("returns 200 even with empty body", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockRejectSuggestion.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/admin/deal-copilot/suggestions/sg1/reject", {
      method: "POST",
      body: "",
    });
    const res = await rejectPost(req, { params: Promise.resolve({ id: "sg1" }) });
    expect(res.status).toBe(200);
  });
});
