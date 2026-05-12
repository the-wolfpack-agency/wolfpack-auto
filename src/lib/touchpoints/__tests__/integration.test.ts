/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Integration test for the touchpoint module.
 *
 * Walks the documented happy path end-to-end:
 *   1. A tenant has registered a QR code at (qr, "vehicle-walkaround-VIN").
 *   2. A customer scans the QR -- raw payload is the canonical wp:// URI.
 *   3. Dispatcher parses + validates + looks up the registration.
 *   4. Dispatcher records the event, fires analytics + audit_log, and
 *      returns the action slug.
 *
 * The DB is mocked at the @/lib/db boundary so we can assert SQL shape
 * + parameter ordering deterministically. The analytics + audit modules
 * are mocked so we can assert exact wiring.
 */

const mockQuery = jest.fn();
const analyticsCalls: Array<{ event: string; meta: any }> = [];
const auditCalls: Array<{ action: string; details: any }> = [];

jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
}));

jest.mock("@/lib/analytics-hooks", () => ({
  trackTouchpoint: jest.fn((event: string, _dealerId: string, meta: any) => {
    analyticsCalls.push({ event, meta });
  }),
}));

jest.mock("@/lib/audit-log", () => ({
  auditLog: jest.fn(async (action: string, details: any) => {
    auditCalls.push({ action, details });
  }),
}));

import { dispatchScan, _resetHandlerRegistry, signQrPayload } from "..";

const TENANT = "11111111-1111-4111-9111-111111111111";

beforeEach(() => {
  mockQuery.mockReset();
  analyticsCalls.length = 0;
  auditCalls.length = 0;
  process.env.DATABASE_URL = "postgres://test";
  _resetHandlerRegistry();
});

afterEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.TOUCHPOINT_SIGNING_KEY;
});

test("end-to-end: register -> scan -> event recorded -> action returned", async () => {
  // 1. duplicate-check returns no rows.
  // 2. registration lookup returns the configured action.
  // 3. insert succeeds.
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

  const raw = `wp://qr/${TENANT}/vehicle-walkaround-VIN123`;
  const result = await dispatchScan(TENANT, "qr", raw, {
    customerId: "22222222-2222-4222-9222-222222222222",
    ip: "10.0.0.1",
    ua: "Mozilla/5.0",
  });

  // Result shape
  expect(result.outcome).toBe("action_triggered");
  expect(result.actionSlug).toBe("inventory.feature_vehicle");
  expect(result.actionParameters).toEqual({ vin: "VIN123" });
  expect(result.eventId).toMatch(/[0-9a-f-]{36}/);

  // touchpoint_events insert was issued with the resolved action slug + a
  // sha256 device fingerprint.
  const insertCall = mockQuery.mock.calls.find((c) =>
    c[0].includes("INSERT INTO touchpoint_events"),
  );
  expect(insertCall).toBeDefined();
  const insertParams = insertCall![1];
  expect(insertParams[1]).toBe(TENANT); // tenant_id
  expect(insertParams[2]).toBe("qr");   // touchpoint_type
  expect(insertParams[3]).toBe("vehicle-walkaround-VIN123"); // touchpoint_id
  expect(insertParams[7]).toBe("inventory.feature_vehicle"); // action_triggered_slug
  expect(insertParams[8]).toBe("action_triggered"); // outcome

  // Analytics: scanned + action_triggered both fired exactly once.
  const events = analyticsCalls.map((c) => c.event);
  expect(events).toEqual(
    expect.arrayContaining([
      "touchpoint.scanned",
      "touchpoint.action_triggered",
    ]),
  );

  // Audit log fired exactly once for this action_triggered scan.
  expect(auditCalls).toHaveLength(1);
  expect(auditCalls[0].action).toBe("touchpoint.scanned");
  expect(auditCalls[0].details.touchpoint_id).toBe("vehicle-walkaround-VIN123");
});

test("end-to-end: signed QR envelope validates against TOUCHPOINT_SIGNING_KEY", async () => {
  process.env.TOUCHPOINT_SIGNING_KEY = "round-trip-secret";

  mockQuery
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({
      rows: [
        { action_slug: "leads.create_followup", action_parameters: { vin: "X" } },
      ],
    })
    .mockResolvedValueOnce({ rows: [] });

  const raw = signQrPayload(
    { touchpoint_id: "signed-VIN", tenant_id: TENANT },
    process.env.TOUCHPOINT_SIGNING_KEY!,
  );

  const result = await dispatchScan(TENANT, "qr", raw, { ip: "10.0.0.2" });
  expect(result.outcome).toBe("action_triggered");
  expect(result.actionSlug).toBe("leads.create_followup");
});

test("end-to-end: duplicate scan inside 60s window is suppressed", async () => {
  // duplicate-check returns a recent row.
  mockQuery
    .mockResolvedValueOnce({ rows: [{ id: "prev-event" }] })
    // insert
    .mockResolvedValueOnce({ rows: [] });

  const raw = `wp://qr/${TENANT}/dup-VIN`;
  const result = await dispatchScan(TENANT, "qr", raw, {
    customerId: "22222222-2222-4222-9222-222222222222",
  });

  expect(result.outcome).toBe("duplicate_suppressed");
  expect(
    analyticsCalls.some((c) => c.event === "touchpoint.duplicate_suppressed"),
  ).toBe(true);
  // No audit row -- duplicates do not count as a new physical event.
  expect(auditCalls).toHaveLength(0);
});
