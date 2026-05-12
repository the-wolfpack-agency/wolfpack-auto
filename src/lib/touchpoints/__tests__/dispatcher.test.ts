/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for the touchpoint dispatcher.
 *
 * Strategy:
 *   - Mock @/lib/db so we can pin SQL shape + parameter ordering without
 *     a real Postgres.
 *   - Mock @/lib/analytics-hooks so we assert the four touchpoint events
 *     fire on the exact paths the contract describes.
 *   - Mock @/lib/audit-log so we assert the audit_log row is written for
 *     every action-triggered scan.
 *
 * The dispatcher itself is library code -- it never imports next/server.
 */

const mockQuery = jest.fn();
const analyticsCalls: Array<{ event: string; meta: any }> = [];
const auditCalls: Array<{ action: string; dealerId: string | undefined }> = [];

jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
}));

jest.mock("@/lib/analytics-hooks", () => ({
  trackTouchpoint: jest.fn((event: string, _dealerId: string, meta: any) => {
    analyticsCalls.push({ event, meta });
  }),
}));

jest.mock("@/lib/audit-log", () => ({
  auditLog: jest.fn(
    async (action: string, _details: any, _userId: any, dealerId: any) => {
      auditCalls.push({ action, dealerId });
    },
  ),
}));

import { dispatchScan, _resetHandlerRegistry } from "../dispatcher";
import { signQrPayload } from "../qr-handler";

const TENANT_ID = "11111111-1111-4111-9111-111111111111";

beforeEach(() => {
  mockQuery.mockReset();
  analyticsCalls.length = 0;
  auditCalls.length = 0;
  process.env.DATABASE_URL = "postgres://test";
  _resetHandlerRegistry();
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

/* ------------------------------------------------------------------ */
/* dispatchScan                                                        */
/* ------------------------------------------------------------------ */

describe("dispatchScan -- QR happy path", () => {
  test("action_triggered when registration exists", async () => {
    // 1. duplicate-check -> none (rows: [])
    // 2. registration lookup -> matched (rows: [{action_slug, action_parameters}])
    // 3. insert -> ok (rows: [])
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            action_slug: "inventory.feature_vehicle",
            action_parameters: { vin: "VIN123" },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await dispatchScan(
      TENANT_ID,
      "qr",
      `wp://qr/${TENANT_ID}/walkaround-VIN123`,
      { ip: "1.2.3.4", ua: "Mozilla/5.0" },
    );

    expect(result.outcome).toBe("action_triggered");
    expect(result.actionSlug).toBe("inventory.feature_vehicle");
    expect(result.actionParameters).toEqual({ vin: "VIN123" });
    expect(result.eventId).toMatch(/[0-9a-f-]{36}/);

    // touchpoint_events insert was issued
    const insertCall = mockQuery.mock.calls.find((c) =>
      c[0].includes("INSERT INTO touchpoint_events"),
    );
    expect(insertCall).toBeDefined();

    // analytics fired: scanned + action_triggered
    expect(analyticsCalls.map((c) => c.event)).toEqual(
      expect.arrayContaining([
        "touchpoint.scanned",
        "touchpoint.action_triggered",
      ]),
    );

    // audit_log fired exactly once for this scan
    expect(auditCalls.length).toBe(1);
    expect(auditCalls[0].action).toBe("touchpoint.scanned");
    expect(auditCalls[0].dealerId).toBe(TENANT_ID);
  });
});

describe("dispatchScan -- no_match path", () => {
  test("records no_match when registration is missing", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })   // duplicate-check
      .mockResolvedValueOnce({ rows: [] })   // registration lookup -- none
      .mockResolvedValueOnce({ rows: [] });  // insert

    const result = await dispatchScan(
      TENANT_ID,
      "qr",
      `wp://qr/${TENANT_ID}/unregistered`,
      {},
    );

    expect(result.outcome).toBe("no_match");
    expect(result.actionSlug).toBeUndefined();
    expect(analyticsCalls.some((c) => c.event === "touchpoint.scanned")).toBe(true);
    // No action_triggered analytics event on no_match.
    expect(analyticsCalls.some((c) => c.event === "touchpoint.action_triggered")).toBe(false);
  });
});

describe("dispatchScan -- parse-failure path", () => {
  test("garbage payload records no_match + unknown_payload analytics", async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await dispatchScan(TENANT_ID, "qr", "not-a-qr-payload");
    expect(result.outcome).toBe("no_match");
    expect(analyticsCalls.some((c) => c.event === "touchpoint.unknown_payload")).toBe(
      true,
    );
  });
});

describe("dispatchScan -- duplicate suppression", () => {
  test("returns duplicate_suppressed when a recent row exists", async () => {
    mockQuery
      // duplicate-check -> existing row
      .mockResolvedValueOnce({ rows: [{ id: "prev-event-id" }] })
      // insert
      .mockResolvedValueOnce({ rows: [] });

    const result = await dispatchScan(
      TENANT_ID,
      "qr",
      `wp://qr/${TENANT_ID}/dup`,
      { customerId: "22222222-2222-4222-9222-222222222222" },
    );

    expect(result.outcome).toBe("duplicate_suppressed");
    expect(
      analyticsCalls.some((c) => c.event === "touchpoint.duplicate_suppressed"),
    ).toBe(true);
  });
});

describe("dispatchScan -- stub handler path", () => {
  test("NFC scan records outcome=error with not_supported detail", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const result = await dispatchScan(TENANT_ID, "nfc", "anything");
    expect(result.outcome).toBe("error");
    expect(result.detail).toMatch(/not yet wired/);
  });
});

describe("dispatchScan -- signed envelope", () => {
  test("invalid signature records outcome=error", async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    // Sign with a secret we will NOT make available to the handler:
    // the handler uses process.env.TOUCHPOINT_SIGNING_KEY by default,
    // and we leave it unset so the signing-secret resolver returns null.
    delete process.env.TOUCHPOINT_SIGNING_KEY;
    const raw = signQrPayload(
      { touchpoint_id: "tp-x", tenant_id: TENANT_ID },
      "secret-the-handler-cannot-see",
    );
    const result = await dispatchScan(TENANT_ID, "qr", raw);
    expect(result.outcome).toBe("error");
  });
});

describe("dispatchScan -- DATABASE_URL not set (shadow mode)", () => {
  test("returns no_match without throwing when DB is absent", async () => {
    delete process.env.DATABASE_URL;
    const result = await dispatchScan(
      TENANT_ID,
      "qr",
      `wp://qr/${TENANT_ID}/no-db`,
    );
    expect(result.outcome).toBe("no_match");
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
