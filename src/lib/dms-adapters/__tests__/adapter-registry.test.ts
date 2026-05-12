/**
 * Unit tests for the adapter registry — factory routing, capability
 * snapshotting, credential round-tripping through the AES-256-GCM vault.
 *
 * Tests run in shadow mode (DATABASE_URL unset) so they exercise the
 * library's graceful-degradation path. The integration test
 * (`integration.test.ts`) covers the DB-backed path against a mocked db
 * client.
 */

import {
  configureAdapter,
  getAdapter,
  listAvailableAdapters,
  registerAdapter,
  seedDefaultAdapters,
  type DMSAdapter,
} from "../index";
import { ALL_CAPABILITIES } from "../types";
import { generateTestKey } from "@/lib/external-credentials/crypto-vault";

const ORIGINAL_KEY = process.env.EXTERNAL_CREDENTIAL_KEY;
const ORIGINAL_DB_URL = process.env.DATABASE_URL;

beforeEach(() => {
  process.env.EXTERNAL_CREDENTIAL_KEY = generateTestKey();
  delete process.env.DATABASE_URL;
  seedDefaultAdapters();
});

afterEach(() => {
  process.env.EXTERNAL_CREDENTIAL_KEY = ORIGINAL_KEY;
  if (ORIGINAL_DB_URL === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = ORIGINAL_DB_URL;
  }
});

describe("listAvailableAdapters", () => {
  test("includes mock + cox_vauto + dealersocket + cdk by default", () => {
    const providers = listAvailableAdapters();
    expect(providers).toEqual(
      expect.arrayContaining(["mock", "cox_vauto", "dealersocket", "cdk"]),
    );
  });
});

describe("registerAdapter", () => {
  test("can register a custom factory and resolve it via getAdapter", async () => {
    const stub: DMSAdapter = {
      provider: "mock",
      capabilities: new Set(["read_inventory"]),
      ping: async () => ({ ok: true, data: { healthy: true, vendor_version: "stub" } }),
      listVehicles: async () => ({ ok: true, data: [] }),
      updateVehiclePrice: async () => ({ ok: false, error: "not_supported" }),
      listLeads: async () => ({ ok: true, data: [] }),
      updateLeadStatus: async () => ({ ok: false, error: "not_supported" }),
      listDeals: async () => ({ ok: true, data: [] }),
      listServiceOrders: async () => ({ ok: true, data: [] }),
    };
    registerAdapter("mock", () => stub);
    const resolved = await getAdapter("mock", "dealer-1");
    expect(resolved).toBe(stub);
  });

  test("getAdapter returns null for unknown provider", async () => {
    const res = await getAdapter("unknown_dms", "dealer-1");
    expect(res).toBeNull();
  });
});

describe("getAdapter — shadow mode (no DATABASE_URL)", () => {
  test("returns the mock adapter without persistence", async () => {
    const a = await getAdapter("mock", "dealer-1");
    expect(a).not.toBeNull();
    expect(a?.provider).toBe("mock");
  });

  test("returns a stub adapter for non-mock providers", async () => {
    const a = await getAdapter("cox_vauto", "dealer-1");
    expect(a).not.toBeNull();
    expect(a?.provider).toBe("cox_vauto");
    const res = await a!.listVehicles();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("not_configured");
  });
});

describe("configureAdapter — shadow mode", () => {
  test("returns synthetic record + snapshots mock capabilities", async () => {
    const record = await configureAdapter({
      dealerId: "dealer-1",
      provider: "mock",
      actorUserId: "user-1",
    });
    expect(record.dealerId).toBe("dealer-1");
    expect(record.provider).toBe("mock");
    expect(record.status).toBe("pending"); // no creds supplied
    expect(record.capabilitySet.sort()).toEqual([...ALL_CAPABILITIES].sort());
  });

  test("status flips to active when credentials are supplied", async () => {
    const record = await configureAdapter({
      dealerId: "dealer-1",
      provider: "cox_vauto",
      plaintextCredentials: { apiKey: "abc", dealerCode: "D-1" },
      actorUserId: "user-1",
    });
    expect(record.status).toBe("active");
    // Cox stub declares read_inventory + read_leads + read_deals only.
    expect(record.capabilitySet.sort()).toEqual(
      ["read_deals", "read_inventory", "read_leads"],
    );
  });

  test("throws when provider is unknown", async () => {
    await expect(
      configureAdapter({
        // @ts-expect-error testing runtime guard
        dealerId: "dealer-1", provider: "unknown", actorUserId: "user-1",
      }),
    ).rejects.toThrow(/unknown DMS adapter provider/);
  });
});
