/**
 * Contract tests for the maintenance-leads admin routes:
 *   GET  /api/admin/maintenance-leads               → 200 / 401 / 400
 *   POST /api/admin/maintenance-leads/[id]/dismiss  → 200 / 400 / 401 / 404
 *   POST /api/admin/maintenance-leads/[id]/complete → 200 / 400 / 401 / 404
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockListLeads = jest.fn();
const mockDismissLead = jest.fn();
const mockCompleteLead = jest.fn();
const mockRequireAuth = jest.fn();

jest.mock("@/lib/connected-vehicle", () => ({
  listLeadsForDealer: (...args: any[]) => mockListLeads(...args),
  dismissLead: (...args: any[]) => mockDismissLead(...args),
  markLeadCompleted: (...args: any[]) => mockCompleteLead(...args),
}));

jest.mock("@/lib/auth-guard", () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
}));

jest.mock("@/lib/analytics", () => ({
  trackServerEvent: jest.fn().mockResolvedValue(undefined),
}));

import { NextRequest, NextResponse } from "next/server";
import { GET as listGet } from "@/app/api/admin/maintenance-leads/route";
import { POST as dismissPost } from "@/app/api/admin/maintenance-leads/[id]/dismiss/route";
import { POST as completePost } from "@/app/api/admin/maintenance-leads/[id]/complete/route";

const DEALER = "00000000-0000-4000-a000-000000000001";

function authedUser() {
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

beforeEach(() => {
  mockListLeads.mockReset();
  mockDismissLead.mockReset();
  mockCompleteLead.mockReset();
  mockRequireAuth.mockReset();
  process.env.DATABASE_URL = "postgresql://test";
});

describe("GET /api/admin/maintenance-leads", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    );
    const req = new NextRequest(
      "http://localhost:3000/api/admin/maintenance-leads",
    );
    const res = await listGet(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with leads for an authed user", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockListLeads.mockResolvedValueOnce([{ id: "l1" }]);
    const req = new NextRequest(
      "http://localhost:3000/api/admin/maintenance-leads",
    );
    const res = await listGet(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.leads).toEqual([{ id: "l1" }]);
  });

  it("returns 400 on invalid status filter", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest(
      "http://localhost:3000/api/admin/maintenance-leads?status=bogus",
    );
    const res = await listGet(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid urgency filter", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest(
      "http://localhost:3000/api/admin/maintenance-leads?urgency=tomorrow",
    );
    const res = await listGet(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/maintenance-leads/[id]/dismiss", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    );
    const req = new NextRequest(
      "http://localhost:3000/api/admin/maintenance-leads/x/dismiss",
      {
        method: "POST",
        body: JSON.stringify({ reason: "x" }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const res = await dismissPost(req, {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 on missing reason", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest(
      "http://localhost:3000/api/admin/maintenance-leads/x/dismiss",
      {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      },
    );
    const res = await dismissPost(req, {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when lead is not found", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockDismissLead.mockResolvedValueOnce(null);
    const req = new NextRequest(
      "http://localhost:3000/api/admin/maintenance-leads/missing/dismiss",
      {
        method: "POST",
        body: JSON.stringify({ reason: "duplicate" }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const res = await dismissPost(req, {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 on successful dismiss", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockDismissLead.mockResolvedValueOnce({
      id: "ok",
      lead_type: "oil_change",
      urgency: "soon",
    });
    const req = new NextRequest(
      "http://localhost:3000/api/admin/maintenance-leads/ok/dismiss",
      {
        method: "POST",
        body: JSON.stringify({ reason: "duplicate" }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const res = await dismissPost(req, {
      params: Promise.resolve({ id: "ok" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/admin/maintenance-leads/[id]/complete", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    );
    const req = new NextRequest(
      "http://localhost:3000/api/admin/maintenance-leads/x/complete",
      {
        method: "POST",
        body: JSON.stringify({ outcome: "x" }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const res = await completePost(req, {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 on successful complete", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockCompleteLead.mockResolvedValueOnce({
      id: "ok",
      lead_type: "brake_service",
      urgency: "soon",
      estimated_revenue_cents: 45000,
    });
    const req = new NextRequest(
      "http://localhost:3000/api/admin/maintenance-leads/ok/complete",
      {
        method: "POST",
        body: JSON.stringify({ outcome: "scheduled" }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const res = await completePost(req, {
      params: Promise.resolve({ id: "ok" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 404 when lead is missing", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockCompleteLead.mockResolvedValueOnce(null);
    const req = new NextRequest(
      "http://localhost:3000/api/admin/maintenance-leads/missing/complete",
      {
        method: "POST",
        body: JSON.stringify({ outcome: "x" }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const res = await completePost(req, {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });
});
