/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Integration test for the DMS adapter framework.
 *
 * Walks the documented happy path end-to-end:
 *   1. Register a mock adapter for dealer A via `configureAdapter`.
 *   2. Resolve the runtime adapter via `getAdapter`.
 *   3. Call `listVehicles` and assert the deterministic shape.
 *   4. Call the executed-action wiring helper.
 *   5. Assert the dms_adapter.configured + dms_adapter.action_executed
 *      analytics events fired and the audit_log helper was invoked.
 *
 * The test mocks `@/lib/audit-log` + `@/lib/analytics-hooks` to assert the
 * exact wiring without touching Postgres. The library-layer code paths
 * exercised here mirror what the API route invokes.
 */

const auditCalls: Array<{ action: string; dealerId: string; details: unknown }> = [];
const analyticsCalls: Array<{ event: string; dealerId: string; meta: unknown }> = [];

jest.mock("@/lib/audit-log", () => ({
  auditLog: jest.fn(
    async (action: string, details: unknown, _userId, dealerId: string) => {
      auditCalls.push({ action, dealerId, details });
    },
  ),
}));

jest.mock("@/lib/analytics-hooks", () => ({
  trackDMSAdapter: jest.fn(
    (event: string, dealerId: string, meta: unknown) => {
      analyticsCalls.push({ event, dealerId, meta });
    },
  ),
}));

import { generateTestKey } from "@/lib/external-credentials/crypto-vault";
import {
  configureAdapter,
  getAdapter,
  recordActionExecuted,
  seedDefaultAdapters,
} from "../index";

const ORIGINAL_KEY = process.env.EXTERNAL_CREDENTIAL_KEY;
const ORIGINAL_DB_URL = process.env.DATABASE_URL;

beforeEach(() => {
  auditCalls.length = 0;
  analyticsCalls.length = 0;
  process.env.EXTERNAL_CREDENTIAL_KEY = generateTestKey();
  delete process.env.DATABASE_URL;
  seedDefaultAdapters();
});

afterAll(() => {
  process.env.EXTERNAL_CREDENTIAL_KEY = ORIGINAL_KEY;
  if (ORIGINAL_DB_URL === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = ORIGINAL_DB_URL;
  }
});

test("happy path: configure → resolve → call → audit + analytics fire", async () => {
  const dealerId = "dealer-A";

  // 1. Configure mock adapter.
  const record = await configureAdapter({
    dealerId,
    provider: "mock",
    actorUserId: "u-1",
  });
  expect(record.provider).toBe("mock");

  // dms_adapter.configured event fired (analytics + audit)
  expect(analyticsCalls.some((c) => c.event === "dms_adapter.configured")).toBe(true);
  expect(auditCalls.some((c) => c.action === "dms_adapter.configured")).toBe(true);

  // 2. Resolve runtime adapter.
  const adapter = await getAdapter("mock", dealerId);
  expect(adapter).not.toBeNull();
  expect(adapter?.provider).toBe("mock");

  // 3. Call listVehicles and assert deterministic shape.
  const vehicles = await adapter!.listVehicles({ limit: 5 });
  expect(vehicles.ok).toBe(true);
  if (vehicles.ok) {
    expect(vehicles.data).toHaveLength(5);
    expect(vehicles.data[0]).toMatchObject({
      externalId: "MK-0001",
      vin: "1HGCM82633A100001",
      make: "Honda",
      model: "Accord",
      isMock: true,
    });
  }

  // 4. Record the action via the framework's helper.
  await recordActionExecuted({
    dealerId,
    provider: "mock",
    adapterId: record.id,
    capability: "read_inventory",
    ok: true,
    actorUserId: "u-1",
  });

  // 5. action_executed analytics + audit fired.
  expect(analyticsCalls.some((c) => c.event === "dms_adapter.action_executed")).toBe(
    true,
  );
  expect(auditCalls.some((c) => c.action === "dms_adapter.action_executed")).toBe(
    true,
  );

  // Negative path: action_failed wiring.
  await recordActionExecuted({
    dealerId,
    provider: "mock",
    adapterId: record.id,
    capability: "write_inventory_update",
    ok: false,
    detail: "rate limited",
    actorUserId: "u-1",
  });
  expect(analyticsCalls.some((c) => c.event === "dms_adapter.action_failed")).toBe(
    true,
  );
  expect(auditCalls.some((c) => c.action === "dms_adapter.action_failed")).toBe(
    true,
  );

  // All audit + analytics events keyed to the right dealer.
  for (const c of analyticsCalls) expect(c.dealerId).toBe(dealerId);
  for (const c of auditCalls) expect(c.dealerId).toBe(dealerId);
});

test("get the non-mock adapter without DB returns a stub adapter that surfaces not_configured", async () => {
  const adapter = await getAdapter("cox_vauto", "dealer-B");
  expect(adapter).not.toBeNull();
  const res = await adapter!.listVehicles();
  expect(res.ok).toBe(false);
  if (!res.ok) {
    expect(res.error).toBe("not_configured");
    expect(res.detail).toMatch(/cox-api-key/i);
  }
});

test("getAdapter returns null for an unknown provider slug", async () => {
  const adapter = await getAdapter("does-not-exist", "dealer-C");
  expect(adapter).toBeNull();
});
