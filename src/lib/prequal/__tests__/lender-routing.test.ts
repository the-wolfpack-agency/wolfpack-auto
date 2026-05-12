/**
 * Unit tests for lender-routing.ts (Stream B, migration 070).
 *
 * Mocks @/lib/db, @/lib/audit-log, @/lib/analytics-hooks, @/lib/triple-write,
 * and the `resend` module so we exercise the real control flow without I/O.
 *
 * Covers:
 *   - validators (isValidLenderEmail, isValidLenderType)
 *   - createLenderRoute happy path + bad email + bad type
 *   - listLenderRoutes shape
 *   - updateLenderRoute (no-op, valid patch, not-found)
 *   - deleteLenderRoute (success + not found)
 *   - routePrequalToLenders:
 *       - emits prequal.lender_packet_built
 *       - emits prequal.lender_packet_emailed when send succeeds
 *       - emits prequal.lender_route_failed when send fails
 *       - records dispatches as 'queued' when RESEND_API_KEY is absent
 *       - records dispatches as 'sent' when RESEND_API_KEY is present + send succeeds
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockQuery = jest.fn();
const mockAuditLog = jest.fn().mockResolvedValue(undefined);
const mockTrackPrequal = jest.fn();
const mockWriteSecondary = jest.fn().mockResolvedValue(undefined);
const mockResendSend = jest.fn();

jest.mock("@/lib/db", () => ({
  query: (...args: any[]) => mockQuery(...args),
}));
jest.mock("@/lib/audit-log", () => ({
  auditLog: (...args: any[]) => mockAuditLog(...args),
}));
jest.mock("@/lib/analytics-hooks", () => ({
  trackPrequal: (...args: any[]) => mockTrackPrequal(...args),
}));
jest.mock("@/lib/triple-write", () => ({
  writeEventsToSecondaryStores: (...args: any[]) => mockWriteSecondary(...args),
}));
jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: (...args: any[]) => mockResendSend(...args) },
  })),
}));

import {
  isValidLenderEmail,
  isValidLenderType,
  listLenderRoutes,
  createLenderRoute,
  updateLenderRoute,
  deleteLenderRoute,
  routePrequalToLenders,
} from "@/lib/prequal/lender-routing";
import type { LenderPacketInput } from "@/lib/prequal/lender-packet-pdf";

const DEALER = "dealer-uuid";

function rowFor(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: overrides.id ?? "route-1",
    dealer_id: DEALER,
    lender_name: overrides.lender_name ?? "ACME Bank",
    contact_email: overrides.contact_email ?? "lend@acme.example",
    contact_name: overrides.contact_name ?? null,
    sort_order: overrides.sort_order ?? 0,
    active: overrides.active ?? true,
    lender_type: overrides.lender_type ?? "other",
    notes: overrides.notes ?? null,
    created_at: "2026-05-12T00:00:00Z",
    updated_at: "2026-05-12T00:00:00Z",
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockAuditLog.mockClear();
  mockTrackPrequal.mockClear();
  mockWriteSecondary.mockClear();
  mockResendSend.mockReset();
  delete process.env.RESEND_API_KEY;
});

describe("validators", () => {
  it("isValidLenderEmail accepts good + rejects bad", () => {
    expect(isValidLenderEmail("a@b.co")).toBe(true);
    expect(isValidLenderEmail("not-an-email")).toBe(false);
    expect(isValidLenderEmail("  spaces@x.com  ".trim())).toBe(true);
  });
  it("isValidLenderType accepts each enum + rejects others", () => {
    for (const t of ["prime", "sub_prime", "captive", "credit_union", "other"]) {
      expect(isValidLenderType(t)).toBe(true);
    }
    expect(isValidLenderType("garbage")).toBe(false);
  });
});

describe("createLenderRoute", () => {
  it("inserts + returns the row on happy path", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [rowFor()] });
    const r = await createLenderRoute({
      dealerId: DEALER,
      lenderName: "ACME Bank",
      contactEmail: "lend@acme.example",
      lenderType: "prime",
    });
    expect(r.lenderName).toBe("ACME Bank");
    expect(r.lenderType).toBe("other"); // matches stubbed row
    expect(mockAuditLog).toHaveBeenCalledWith(
      "prequal.lender_route.created",
      expect.objectContaining({ lender_name: "ACME Bank" }),
      undefined,
      DEALER,
    );
  });
  it("throws on bad email", async () => {
    await expect(
      createLenderRoute({
        dealerId: DEALER,
        lenderName: "x",
        contactEmail: "bad",
      }),
    ).rejects.toThrow(/not a valid email/);
  });
  it("throws on empty name", async () => {
    await expect(
      createLenderRoute({
        dealerId: DEALER,
        lenderName: "   ",
        contactEmail: "a@b.co",
      }),
    ).rejects.toThrow(/required/);
  });
});

describe("listLenderRoutes", () => {
  it("maps rows -> typed shape", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [rowFor({ id: "r1" }), rowFor({ id: "r2", lender_name: "B" })],
    });
    const r = await listLenderRoutes(DEALER);
    expect(r).toHaveLength(2);
    expect(r[0].id).toBe("r1");
    expect(r[1].lenderName).toBe("B");
  });
});

describe("updateLenderRoute", () => {
  it("returns current row on no-op patch", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [rowFor({ id: "r1" })] });
    const r = await updateLenderRoute(DEALER, "r1", {});
    expect(r?.id).toBe("r1");
  });

  it("applies a patch + writes audit_log", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [rowFor({ id: "r1", active: false })],
    });
    const r = await updateLenderRoute(DEALER, "r1", { active: false });
    expect(r?.active).toBe(false);
    expect(mockAuditLog).toHaveBeenCalledWith(
      "prequal.lender_route.updated",
      expect.objectContaining({ lender_route_id: "r1" }),
      undefined,
      DEALER,
    );
  });

  it("returns null for not-found", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const r = await updateLenderRoute(DEALER, "missing", { active: true });
    expect(r).toBeNull();
  });
});

describe("deleteLenderRoute", () => {
  it("returns true + audits on delete", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "r1" }] });
    const ok = await deleteLenderRoute(DEALER, "r1");
    expect(ok).toBe(true);
    expect(mockAuditLog).toHaveBeenCalledWith(
      "prequal.lender_route.deleted",
      { lender_route_id: "r1" },
      undefined,
      DEALER,
    );
  });
  it("returns false when nothing matched", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    expect(await deleteLenderRoute(DEALER, "x")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* routePrequalToLenders                                                      */
/* -------------------------------------------------------------------------- */

function basePacketInput(): LenderPacketInput {
  return {
    prequalId: "prequal-1",
    dealerName: "ACME",
    customerName: "Cust",
    vehicleInterestText: "Truck",
    income: { monthlyCents: 600_000, confidence: "self_reported", isMock: false },
    credit: {
      bureauUsed: "mock",
      scoreRangeMin: 660,
      scoreRangeMax: 700,
      tier: "prime",
      isMock: true,
    },
    ofacClear: true,
  };
}

describe("routePrequalToLenders", () => {
  it("returns queued + packet_text_fallback when RESEND_API_KEY is absent", async () => {
    // 1st query = listLenderRoutes
    mockQuery.mockResolvedValueOnce({
      rows: [rowFor({ id: "r1", contact_email: "a@x.example" })],
    });
    // 2nd query = recordDispatch
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "disp-1" }] });

    const result = await routePrequalToLenders({
      dealerId: DEALER,
      prequalId: "prequal-1",
      packetInput: basePacketInput(),
    });

    expect(result.dispatches).toHaveLength(1);
    expect(result.dispatches[0].status).toBe("queued");
    expect(result.dispatches[0].failureReason).toBe("resend_not_configured");
    expect(typeof result.packetTextFallback).toBe("string");
    expect(mockTrackPrequal).toHaveBeenCalledWith(
      "prequal.lender_packet_built",
      DEALER,
      expect.objectContaining({ prequal_id: "prequal-1", target_count: 1 }),
    );
  });

  it("returns 'sent' when RESEND_API_KEY is present + Resend succeeds", async () => {
    process.env.RESEND_API_KEY = "test-key";
    mockResendSend.mockResolvedValueOnce({ error: null });
    mockQuery.mockResolvedValueOnce({
      rows: [rowFor({ id: "r1", contact_email: "a@x.example" })],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "disp-1" }] });

    const result = await routePrequalToLenders({
      dealerId: DEALER,
      prequalId: "prequal-1",
      packetInput: basePacketInput(),
    });

    expect(result.dispatches[0].status).toBe("sent");
    expect(result.packetTextFallback).toBeUndefined();
    expect(mockTrackPrequal).toHaveBeenCalledWith(
      "prequal.lender_packet_emailed",
      DEALER,
      expect.objectContaining({ prequal_id: "prequal-1" }),
    );
  });

  it("emits prequal.lender_route_failed when Resend errors", async () => {
    process.env.RESEND_API_KEY = "test-key";
    mockResendSend.mockResolvedValueOnce({ error: { message: "boom" } });
    mockQuery.mockResolvedValueOnce({
      rows: [rowFor({ id: "r1", contact_email: "a@x.example" })],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "disp-1" }] });

    const result = await routePrequalToLenders({
      dealerId: DEALER,
      prequalId: "prequal-1",
      packetInput: basePacketInput(),
    });

    expect(result.dispatches[0].status).toBe("failed");
    expect(mockTrackPrequal).toHaveBeenCalledWith(
      "prequal.lender_route_failed",
      DEALER,
      expect.objectContaining({ reason: "boom" }),
    );
  });

  it("filters by onlyRouteIds", async () => {
    process.env.RESEND_API_KEY = "test-key";
    mockResendSend.mockResolvedValueOnce({ error: null });
    mockQuery.mockResolvedValueOnce({
      rows: [
        rowFor({ id: "r1", contact_email: "a@x.example" }),
        rowFor({ id: "r2", contact_email: "b@x.example" }),
      ],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "disp-1" }] });

    const result = await routePrequalToLenders({
      dealerId: DEALER,
      prequalId: "prequal-1",
      packetInput: basePacketInput(),
      onlyRouteIds: ["r1"],
    });

    expect(result.dispatches).toHaveLength(1);
    expect(result.dispatches[0].lenderRouteId).toBe("r1");
  });
});
