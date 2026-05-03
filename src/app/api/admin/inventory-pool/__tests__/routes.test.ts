/**
 * Contract tests for the admin/inventory-pool route family:
 *   POST /api/admin/inventory-pool/join                       → 200 / 400 / 401
 *   POST /api/admin/inventory-pool/leave                      → 200 / 400 / 401
 *   GET  /api/admin/inventory-pool/visible                    → 200 / 401
 *   POST /api/admin/inventory-pool/reserve                    → 200 / 400 / 401
 *   GET  /api/admin/inventory-pool/reserve                    → 200 / 401
 *   POST /api/admin/inventory-pool/reservations/[id]/[action] → 200 / 400 / 401 / 404
 *   GET  /api/admin/inventory-pool/swaps                      → 200 / 400 / 401
 *   POST /api/admin/inventory-pool/swaps                      → 200 / 400 / 401
 *   POST /api/admin/inventory-pool/swaps/[id]/[action]        → 200 / 400 / 401 / 404
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockRequireAuth = jest.fn();
const mockJoinPool = jest.fn();
const mockLeavePool = jest.fn();
const mockRecompute = jest.fn();
const mockSearchPool = jest.fn();
const mockRequest = jest.fn();
const mockActReservation = jest.fn();
const mockListIncoming = jest.fn();
const mockListOutgoing = jest.fn();
const mockListSwaps = jest.fn();
const mockProposeSwaps = jest.fn();
const mockActSwap = jest.fn();

jest.mock("@/lib/auth-guard", () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
  isAuthenticated: (r: any) => !(r && typeof r.status === "number"),
}));
jest.mock("@/lib/inventory-pool", () => ({
  joinPool: (...args: any[]) => mockJoinPool(...args),
  leavePool: (...args: any[]) => mockLeavePool(...args),
  recomputeVisibilities: (...args: any[]) => mockRecompute(...args),
  searchPool: (...args: any[]) => mockSearchPool(...args),
  requestReservation: (...args: any[]) => mockRequest(...args),
  actOnReservation: (...args: any[]) => mockActReservation(...args),
  listIncomingReservations: (...args: any[]) => mockListIncoming(...args),
  listOutgoingReservations: (...args: any[]) => mockListOutgoing(...args),
  listSwapProposals: (...args: any[]) => mockListSwaps(...args),
  proposeSwaps: (...args: any[]) => mockProposeSwaps(...args),
  actOnSwap: (...args: any[]) => mockActSwap(...args),
}));

import { NextRequest, NextResponse } from "next/server";
import { POST as joinPost } from "@/app/api/admin/inventory-pool/join/route";
import { POST as leavePost } from "@/app/api/admin/inventory-pool/leave/route";
import { GET as visibleGet } from "@/app/api/admin/inventory-pool/visible/route";
import { POST as reservePost, GET as reserveGet } from "@/app/api/admin/inventory-pool/reserve/route";
import { POST as actResPost } from "@/app/api/admin/inventory-pool/reservations/[id]/[action]/route";
import { GET as swapsGet, POST as swapsPropose } from "@/app/api/admin/inventory-pool/swaps/route";
import { POST as actSwapPost } from "@/app/api/admin/inventory-pool/swaps/[id]/[action]/route";

const DEALER = "00000000-0000-4000-a000-000000000001";

function authedUser() {
  return { user: { id: "u1", email: "u@x.com", name: "U", dealer_id: DEALER, role: "admin" } };
}
function authFail() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}

beforeEach(() => {
  [
    mockRequireAuth, mockJoinPool, mockLeavePool, mockRecompute, mockSearchPool,
    mockRequest, mockActReservation, mockListIncoming, mockListOutgoing,
    mockListSwaps, mockProposeSwaps, mockActSwap,
  ].forEach((m) => m.mockReset());
  // Sibling admin routes return 503 when DATABASE_URL is unset (AVAIL-001
  // shadow-mode guard). Set a dummy value so the contract tests below see
  // the real success / 4xx paths instead of the shadow-mode short-circuit.
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
});

function jsonReq(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/inventory-pool/join", () => {
  it("401 unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(authFail());
    const r = await joinPost(jsonReq("http://x/", { dealer_group_id: "g" }));
    expect(r.status).toBe(401);
  });
  it("400 missing dealer_group_id", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const r = await joinPost(jsonReq("http://x/", {}));
    expect(r.status).toBe(400);
  });
  it("400 invalid share_policy", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const r = await joinPost(jsonReq("http://x/", { dealer_group_id: "g", share_policy: "bogus" }));
    expect(r.status).toBe(400);
  });
  it("400 invalid JSON body", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const r = await joinPost(new NextRequest("http://x/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    }));
    expect(r.status).toBe(400);
  });
  it("200 valid", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockJoinPool.mockResolvedValueOnce({ ok: true, membership_id: null });
    mockRecompute.mockResolvedValueOnce({ exposed: 0, members: 1 });
    const r = await joinPost(jsonReq("http://x/", { dealer_group_id: "g" }));
    expect(r.status).toBe(200);
  });
});

describe("POST /api/admin/inventory-pool/leave", () => {
  it("401 unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(authFail());
    const r = await leavePost(jsonReq("http://x/", { dealer_group_id: "g" }));
    expect(r.status).toBe(401);
  });
  it("400 missing field", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const r = await leavePost(jsonReq("http://x/", {}));
    expect(r.status).toBe(400);
  });
  it("200 valid", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockLeavePool.mockResolvedValueOnce({ ok: true });
    const r = await leavePost(jsonReq("http://x/", { dealer_group_id: "g" }));
    expect(r.status).toBe(200);
  });
});

describe("GET /api/admin/inventory-pool/visible", () => {
  it("401 unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(authFail());
    const r = await visibleGet(new NextRequest("http://x/api/admin/inventory-pool/visible"));
    expect(r.status).toBe(401);
  });
  it("200 returns demo inventory in shadow mode", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    delete process.env.DATABASE_URL; // exercise shadow-mode demo branch
    const r = await visibleGet(new NextRequest("http://x/api/admin/inventory-pool/visible"));
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(Array.isArray(data.inventory)).toBe(true);
  });
});

describe("/api/admin/inventory-pool/reserve", () => {
  it("POST 401 unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(authFail());
    const r = await reservePost(jsonReq("http://x/", { vin: "1HGCV1F34LA000001", owning_dealer_id: "d" }));
    expect(r.status).toBe(401);
  });
  it("POST 400 invalid body", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const r = await reservePost(jsonReq("http://x/", { vin: "short" }));
    expect(r.status).toBe(400);
  });
  it("POST 200 valid", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockRequest.mockResolvedValueOnce({ ok: true, reservation_id: "r1" });
    const r = await reservePost(jsonReq("http://x/", { vin: "1HGCV1F34LA000001", owning_dealer_id: "d" }));
    expect(r.status).toBe(200);
  });
  it("GET 401 unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(authFail());
    const r = await reserveGet(new NextRequest("http://x/api/admin/inventory-pool/reserve"));
    expect(r.status).toBe(401);
  });
  it("GET 200 returns incoming+outgoing", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockListIncoming.mockResolvedValueOnce([]);
    mockListOutgoing.mockResolvedValueOnce([]);
    const r = await reserveGet(new NextRequest("http://x/api/admin/inventory-pool/reserve"));
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.incoming).toBeDefined();
    expect(data.outgoing).toBeDefined();
  });
});

describe("POST /api/admin/inventory-pool/reservations/[id]/[action]", () => {
  const params = (id: string, action: string) => Promise.resolve({ id, action });
  it("401 unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(authFail());
    const r = await actResPost(jsonReq("http://x/", {}), { params: params("r", "approve") });
    expect(r.status).toBe(401);
  });
  it("400 invalid action", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const r = await actResPost(jsonReq("http://x/", {}), { params: params("r", "destroy") });
    expect(r.status).toBe(400);
  });
  it("400 missing id", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const r = await actResPost(jsonReq("http://x/", {}), { params: params("", "approve") });
    expect(r.status).toBe(400);
  });
  it("200 valid", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockActReservation.mockResolvedValueOnce({ ok: true, status: "approved" });
    const r = await actResPost(jsonReq("http://x/", {}), { params: params("r", "approve") });
    expect(r.status).toBe(200);
  });
  it("404 when reservation missing in real DB mode", async () => {
    process.env.DATABASE_URL = "postgresql://test";
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockActReservation.mockResolvedValueOnce({ ok: false, status: "approved" });
    const r = await actResPost(jsonReq("http://x/", {}), { params: params("missing", "approve") });
    expect(r.status).toBe(404);
  });
});

describe("/api/admin/inventory-pool/swaps", () => {
  it("GET 401 unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(authFail());
    const r = await swapsGet(new NextRequest("http://x/api/admin/inventory-pool/swaps?dealer_group_id=g"));
    expect(r.status).toBe(401);
  });
  it("GET 400 missing dealer_group_id", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const r = await swapsGet(new NextRequest("http://x/api/admin/inventory-pool/swaps"));
    expect(r.status).toBe(400);
  });
  it("GET 200 demo data in shadow mode", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    delete process.env.DATABASE_URL; // exercise shadow-mode demo branch
    const r = await swapsGet(new NextRequest("http://x/api/admin/inventory-pool/swaps?dealer_group_id=g"));
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(Array.isArray(data.swaps)).toBe(true);
  });
  it("POST 401 unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(authFail());
    const r = await swapsPropose(jsonReq("http://x/", { dealer_group_id: "g" }));
    expect(r.status).toBe(401);
  });
  it("POST 400 missing field", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const r = await swapsPropose(jsonReq("http://x/", {}));
    expect(r.status).toBe(400);
  });
  it("POST 200 valid", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockProposeSwaps.mockResolvedValueOnce({ proposed: 0, considered: 0 });
    const r = await swapsPropose(jsonReq("http://x/", { dealer_group_id: "g" }));
    expect(r.status).toBe(200);
  });
});

describe("POST /api/admin/inventory-pool/swaps/[id]/[action]", () => {
  const params = (id: string, action: string) => Promise.resolve({ id, action });
  it("401 unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(authFail());
    const r = await actSwapPost(jsonReq("http://x/", {}), { params: params("s", "accept") });
    expect(r.status).toBe(401);
  });
  it("400 invalid action", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const r = await actSwapPost(jsonReq("http://x/", {}), { params: params("s", "explode") });
    expect(r.status).toBe(400);
  });
  it("400 missing id", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const r = await actSwapPost(jsonReq("http://x/", {}), { params: params("", "accept") });
    expect(r.status).toBe(400);
  });
  it("200 valid", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockActSwap.mockResolvedValueOnce({ ok: true, status: "accepted" });
    const r = await actSwapPost(jsonReq("http://x/", {}), { params: params("s", "accept") });
    expect(r.status).toBe(200);
  });
  it("404 when swap missing in real DB mode", async () => {
    process.env.DATABASE_URL = "postgresql://test";
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockActSwap.mockResolvedValueOnce({ ok: false, status: "accepted" });
    const r = await actSwapPost(jsonReq("http://x/", {}), { params: params("missing", "accept") });
    expect(r.status).toBe(404);
  });
});
