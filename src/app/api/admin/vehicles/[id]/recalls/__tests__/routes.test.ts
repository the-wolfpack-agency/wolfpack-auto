/**
 * Contract tests for the recalls + TSB awareness admin + cron routes.
 *
 *   GET    /api/admin/vehicles/[id]/recalls                 — 200 / 401 / 404
 *   PATCH  /api/admin/vehicles/[id]/recalls/[recallId]      — 200 / 400 / 401
 *   GET    /api/cron/recall-refresh                         — idempotent + 200
 *
 * All external boundaries (auth, recalls-store, audit, analytics) are mocked
 * so the test runs entirely in-memory.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockRequireAuth = jest.fn();
const mockLoadVehicle = jest.fn();
const mockBuildReport = jest.fn();
const mockSetStatus = jest.fn();
const mockRefresh = jest.fn();
const mockAuditLog = jest.fn().mockResolvedValue(undefined);
const mockTrackService = jest.fn();

jest.mock("@/lib/auth-guard", () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
  isAuthenticated: (r: any) => !(r && typeof r === "object" && "status" in r),
}));

jest.mock("@/lib/recalls", () => ({
  loadVehicle: (...args: any[]) => mockLoadVehicle(...args),
  buildVehicleRecallReport: (...args: any[]) => mockBuildReport(...args),
  setRecallStatus: (...args: any[]) => mockSetStatus(...args),
  refreshRecallsAndTSBs: (...args: any[]) => mockRefresh(...args),
}));

jest.mock("@/lib/audit-log", () => ({
  auditLog: (...args: any[]) => mockAuditLog(...args),
}));

jest.mock("@/lib/analytics-hooks", () => ({
  trackService: (...args: any[]) => mockTrackService(...args),
}));

import { NextRequest } from "next/server";

import { GET as getRecalls } from "@/app/api/admin/vehicles/[id]/recalls/route";
import { PATCH as patchRecall } from "@/app/api/admin/vehicles/[id]/recalls/[recallId]/route";
import { GET as cronRefresh } from "@/app/api/cron/recall-refresh/route";

const DEALER = "00000000-0000-4000-a000-000000000001";
const VEHICLE_ID = "00000000-0000-4000-b000-000000000001";

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

function unauthed() {
  return Response.json(
    { error: "Authentication required" },
    { status: 401 },
  );
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockLoadVehicle.mockReset();
  mockBuildReport.mockReset();
  mockSetStatus.mockReset();
  mockRefresh.mockReset();
  mockTrackService.mockReset();
  process.env.DATABASE_URL = "postgresql://test";
  delete process.env.CRON_SECRET;
});

/* ------------------------------------------------------------------ */
/*  GET /api/admin/vehicles/[id]/recalls                                */
/* ------------------------------------------------------------------ */

describe("GET /api/admin/vehicles/[id]/recalls", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(unauthed());
    const req = new NextRequest(
      `http://localhost/api/admin/vehicles/${VEHICLE_ID}/recalls`,
    );
    const res = await getRecalls(req, {
      params: Promise.resolve({ id: VEHICLE_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the vehicle is not found", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockLoadVehicle.mockResolvedValueOnce(null);
    const req = new NextRequest(
      `http://localhost/api/admin/vehicles/${VEHICLE_ID}/recalls`,
    );
    const res = await getRecalls(req, {
      params: Promise.resolve({ id: VEHICLE_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 with the full report when authed and vehicle exists", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockLoadVehicle.mockResolvedValueOnce({
      id: VEHICLE_ID,
      make: "Toyota",
      model: "Camry",
      year: 2019,
    });
    mockBuildReport.mockResolvedValueOnce({
      vehicle: { id: VEHICLE_ID, make: "Toyota", model: "Camry", year: 2019 },
      open_recalls: [
        {
          id: "r1",
          nhtsa_campaign_id: "23V001",
          severity: "critical",
          status: "open",
        },
      ],
      tsbs: [{ id: "t1", manufacturer: "Toyota", bulletin_id: "T-001" }],
      recall_count: 1,
      tsb_count: 1,
      checked_at: new Date().toISOString(),
    });
    const req = new NextRequest(
      `http://localhost/api/admin/vehicles/${VEHICLE_ID}/recalls`,
    );
    const res = await getRecalls(req, {
      params: Promise.resolve({ id: VEHICLE_ID }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.recall_count).toBe(1);
    expect(data.tsb_count).toBe(1);
    // Analytics fire-and-forget — both events triggered
    expect(mockTrackService).toHaveBeenCalledWith(
      "service.recall_flagged",
      DEALER,
      expect.objectContaining({ recall_id: "r1" }),
    );
    expect(mockTrackService).toHaveBeenCalledWith(
      "service.tsb_flagged",
      DEALER,
      expect.objectContaining({ tsb_id: "t1" }),
    );
  });
});

/* ------------------------------------------------------------------ */
/*  PATCH /api/admin/vehicles/[id]/recalls/[recallId]                   */
/* ------------------------------------------------------------------ */

describe("PATCH /api/admin/vehicles/[id]/recalls/[recallId]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(unauthed());
    const req = new NextRequest(
      `http://localhost/api/admin/vehicles/${VEHICLE_ID}/recalls/r1`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      },
    );
    const res = await patchRecall(req, {
      params: Promise.resolve({ id: VEHICLE_ID, recallId: "r1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid status", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    const req = new NextRequest(
      `http://localhost/api/admin/vehicles/${VEHICLE_ID}/recalls/r1`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "bogus" }),
      },
    );
    const res = await patchRecall(req, {
      params: Promise.resolve({ id: VEHICLE_ID, recallId: "r1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 200 + fires service.recall_resolved on resolved status", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockLoadVehicle.mockResolvedValueOnce({
      id: VEHICLE_ID,
      make: "Toyota",
      model: "Camry",
      year: 2019,
    });
    mockSetStatus.mockResolvedValueOnce({
      status: "resolved",
      resolved_at: new Date().toISOString(),
    });
    const req = new NextRequest(
      `http://localhost/api/admin/vehicles/${VEHICLE_ID}/recalls/r1`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved", notes: "swapped airbag" }),
      },
    );
    const res = await patchRecall(req, {
      params: Promise.resolve({ id: VEHICLE_ID, recallId: "r1" }),
    });
    expect(res.status).toBe(200);
    expect(mockTrackService).toHaveBeenCalledWith(
      "service.recall_resolved",
      DEALER,
      expect.objectContaining({ recall_id: "r1" }),
    );
    expect(mockAuditLog).toHaveBeenCalled();
  });

  it("fires service.recall_dismissed when owner declines", async () => {
    mockRequireAuth.mockResolvedValueOnce(authedUser());
    mockLoadVehicle.mockResolvedValueOnce({
      id: VEHICLE_ID,
      make: "Toyota",
      model: "Camry",
      year: 2019,
    });
    mockSetStatus.mockResolvedValueOnce({
      status: "dismissed_by_owner",
      resolved_at: new Date().toISOString(),
    });
    const req = new NextRequest(
      `http://localhost/api/admin/vehicles/${VEHICLE_ID}/recalls/r1`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed_by_owner" }),
      },
    );
    const res = await patchRecall(req, {
      params: Promise.resolve({ id: VEHICLE_ID, recallId: "r1" }),
    });
    expect(res.status).toBe(200);
    expect(mockTrackService).toHaveBeenCalledWith(
      "service.recall_dismissed",
      DEALER,
      expect.objectContaining({ recall_id: "r1" }),
    );
  });
});

/* ------------------------------------------------------------------ */
/*  GET /api/cron/recall-refresh                                       */
/* ------------------------------------------------------------------ */

describe("GET /api/cron/recall-refresh", () => {
  it("returns 401 if a CRON_SECRET is set but the request omits it", async () => {
    process.env.CRON_SECRET = "secret-xyz";
    const req = new NextRequest("http://localhost/api/cron/recall-refresh");
    const res = await cronRefresh(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with refresh counts when authed", async () => {
    mockRefresh.mockResolvedValueOnce({
      recalls_fetched: 12,
      recalls_upserted: 7,
      tsbs_upserted: 3,
    });
    const req = new NextRequest("http://localhost/api/cron/recall-refresh");
    const res = await cronRefresh(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.recalls_upserted).toBe(7);
    expect(data.tsbs_upserted).toBe(3);
  });

  it("is idempotent — same body shape, regardless of call count", async () => {
    mockRefresh.mockResolvedValue({
      recalls_fetched: 12,
      recalls_upserted: 7,
      tsbs_upserted: 3,
    });
    const r1 = await cronRefresh(new NextRequest("http://localhost/api/cron/recall-refresh"));
    const r2 = await cronRefresh(new NextRequest("http://localhost/api/cron/recall-refresh"));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const d1 = await r1.json();
    const d2 = await r2.json();
    expect(d1.recalls_upserted).toBe(d2.recalls_upserted);
    expect(d1.tsbs_upserted).toBe(d2.tsbs_upserted);
  });

  it("returns 200 + shadow message when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    const req = new NextRequest("http://localhost/api/cron/recall-refresh");
    const res = await cronRefresh(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toMatch(/No database/);
  });
});
