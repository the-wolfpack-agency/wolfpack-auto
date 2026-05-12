/**
 * Contract tests for /api/admin/vehicles/[id]/title-lien.
 *
 *   200 — authed + supported state (or honest stub) + cache write fires.
 *   400 — missing or invalid `state` query.
 *   401 — unauthenticated.
 *   404 — vehicle not found.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockRequireAuth = jest.fn();
const mockLoadVehicle = jest.fn();
const mockLoadOrFetch = jest.fn();
const mockAuditLog = jest.fn().mockResolvedValue(undefined);
const mockTrackTitleLien = jest.fn();
const mockQuery = jest.fn();

jest.mock("@/lib/auth-guard", () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
  isAuthenticated: (r: any) => !(r && typeof r === "object" && "status" in r),
}));

jest.mock("@/lib/recalls", () => ({
  loadVehicle: (...args: any[]) => mockLoadVehicle(...args),
}));

jest.mock("@/lib/title-lien", () => ({
  isStateRegistered: (s: string) => ["CA", "TX", "FL"].includes(s.toUpperCase()),
  registeredStateCodes: () => ["CA", "TX", "FL"],
  loadOrFetchTitleLien: (...args: any[]) => mockLoadOrFetch(...args),
}));

jest.mock("@/lib/audit-log", () => ({
  auditLog: (...args: any[]) => mockAuditLog(...args),
}));

jest.mock("@/lib/analytics-hooks", () => ({
  trackTitleLien: (...args: any[]) => mockTrackTitleLien(...args),
}));

jest.mock("@/lib/db", () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/admin/vehicles/[id]/title-lien/route";

const DEALER = "00000000-0000-4000-a000-000000000001";
const VEHICLE_ID = "00000000-0000-4000-b000-000000000001";
const VIN = "1HGCM82633A123456";

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
  return Response.json(
    { error: "Authentication required" },
    { status: 401 },
  );
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockLoadVehicle.mockReset();
  mockLoadOrFetch.mockReset();
  mockTrackTitleLien.mockReset();
  mockQuery.mockReset();
  process.env.DATABASE_URL = "postgresql://test";
});

describe("GET /api/admin/vehicles/[id]/title-lien", () => {
  it("returns 200 with shadow_mode when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    const req = new NextRequest(
      `http://localhost/api/admin/vehicles/${VEHICLE_ID}/title-lien?state=FL`,
    );
    const res = await GET(req, {
      params: Promise.resolve({ id: VEHICLE_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shadow_mode).toBe(true);
    expect(body.supported).toBe(false);
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(unauthed());
    const req = new NextRequest(
      `http://localhost/api/admin/vehicles/${VEHICLE_ID}/title-lien?state=FL`,
    );
    const res = await GET(req, {
      params: Promise.resolve({ id: VEHICLE_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when state is missing", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const req = new NextRequest(
      `http://localhost/api/admin/vehicles/${VEHICLE_ID}/title-lien`,
    );
    const res = await GET(req, {
      params: Promise.resolve({ id: VEHICLE_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when state is malformed", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const req = new NextRequest(
      `http://localhost/api/admin/vehicles/${VEHICLE_ID}/title-lien?state=FLA`,
    );
    const res = await GET(req, {
      params: Promise.resolve({ id: VEHICLE_ID }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when vehicle not found", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockLoadVehicle.mockResolvedValueOnce(null);
    const req = new NextRequest(
      `http://localhost/api/admin/vehicles/${VEHICLE_ID}/title-lien?state=FL`,
    );
    const res = await GET(req, {
      params: Promise.resolve({ id: VEHICLE_ID }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 with honest unsupported payload for FL + fires analytics", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockLoadVehicle.mockResolvedValueOnce({
      id: VEHICLE_ID,
      make: "Toyota",
      model: "Camry",
      year: 2019,
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ vin: VIN }] });
    mockLoadOrFetch.mockResolvedValueOnce({
      vin: VIN,
      state_code: "FL",
      supported: false,
      reason: "paid_subscription_required",
      source: "unsupported",
      looked_up_at: new Date().toISOString(),
    });

    const req = new NextRequest(
      `http://localhost/api/admin/vehicles/${VEHICLE_ID}/title-lien?state=FL`,
    );
    const res = await GET(req, {
      params: Promise.resolve({ id: VEHICLE_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.supported).toBe(false);
    expect(body.reason).toBe("paid_subscription_required");
    expect(body.state_code).toBe("FL");
    expect(body.vin).toBe(VIN);
    expect(mockTrackTitleLien).toHaveBeenCalledWith(
      "title_lien.lookup_failed",
      DEALER,
      expect.objectContaining({ reason: "paid_subscription_required" }),
    );
    expect(mockAuditLog).toHaveBeenCalled();
  });

  it("fires state_not_supported analytics + audit on unregistered state", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockLoadVehicle.mockResolvedValueOnce({
      id: VEHICLE_ID,
      make: "Toyota",
      model: "Camry",
      year: 2019,
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ vin: VIN }] });
    mockLoadOrFetch.mockResolvedValueOnce({
      vin: VIN,
      state_code: "NY",
      supported: false,
      reason: "state_not_supported_yet",
      source: "unsupported",
      looked_up_at: new Date().toISOString(),
    });

    const req = new NextRequest(
      `http://localhost/api/admin/vehicles/${VEHICLE_ID}/title-lien?state=NY`,
    );
    const res = await GET(req, {
      params: Promise.resolve({ id: VEHICLE_ID }),
    });
    expect(res.status).toBe(200);
    expect(mockTrackTitleLien).toHaveBeenCalledWith(
      "title_lien.state_not_supported",
      DEALER,
      expect.objectContaining({ state_code: "NY" }),
    );
  });

  it("fires success analytics on a supported + has_lien response", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockLoadVehicle.mockResolvedValueOnce({
      id: VEHICLE_ID,
      make: "Toyota",
      model: "Camry",
      year: 2019,
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ vin: VIN }] });
    mockLoadOrFetch.mockResolvedValueOnce({
      vin: VIN,
      state_code: "FL",
      supported: true,
      has_lien: true,
      lienholder_name: "BANK",
      title_status: "CLEAN",
      source: "fl_flhsmv",
      looked_up_at: new Date().toISOString(),
    });

    const req = new NextRequest(
      `http://localhost/api/admin/vehicles/${VEHICLE_ID}/title-lien?state=FL`,
    );
    const res = await GET(req, {
      params: Promise.resolve({ id: VEHICLE_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.has_lien).toBe(true);
    expect(body.lienholder_name).toBe("BANK");
    expect(mockTrackTitleLien).toHaveBeenCalledWith(
      "title_lien.lookup_succeeded",
      DEALER,
      expect.objectContaining({ has_lien: true }),
    );
  });
});
