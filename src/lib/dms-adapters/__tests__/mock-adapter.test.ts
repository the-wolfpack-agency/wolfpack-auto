/**
 * Unit tests for the mock DMS adapter.
 *
 * The mock adapter is deterministic by design. These tests assert exact
 * counts + filter semantics so any regression in the demo dataset is
 * caught immediately.
 */

import { MockDMSAdapter, createMockAdapter } from "../mock-adapter";
import { ALL_CAPABILITIES } from "../types";

describe("MockDMSAdapter", () => {
  describe("contract", () => {
    test("declares mock provider", () => {
      const adapter = new MockDMSAdapter();
      expect(adapter.provider).toBe("mock");
    });

    test("declares ALL capabilities", () => {
      const adapter = createMockAdapter();
      for (const cap of ALL_CAPABILITIES) {
        expect(adapter.capabilities.has(cap)).toBe(true);
      }
      expect(adapter.capabilities.size).toBe(ALL_CAPABILITIES.length);
    });

    test("ping returns healthy:true", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.ping();
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.healthy).toBe(true);
        expect(res.data.vendor_version).toBe("mock-1.0.0");
      }
    });
  });

  describe("listVehicles", () => {
    test("returns 10 deterministic vehicles", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.listVehicles();
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data).toHaveLength(10);
        expect(res.data.every((v) => v.isMock === true)).toBe(true);
        // determinism — same call twice returns same dataset
        const second = await adapter.listVehicles();
        if (second.ok) {
          expect(second.data).toEqual(res.data);
        }
      }
    });

    test("filters by VIN (case insensitive)", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.listVehicles({ vin: "1hgcm82633a100003" });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data).toHaveLength(1);
        expect(res.data[0].make).toBe("Toyota");
      }
    });

    test("filters by stock number", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.listVehicles({ stock: "ST-1005" });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data).toHaveLength(1);
        expect(res.data[0].make).toBe("Ford");
      }
    });

    test("applies limit", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.listVehicles({ limit: 3 });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data).toHaveLength(3);
      }
    });

    test("isMock:true on every vehicle row", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.listVehicles();
      if (res.ok) {
        for (const v of res.data) expect(v.isMock).toBe(true);
      }
    });
  });

  describe("updateVehiclePrice", () => {
    test("succeeds for a known VIN", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.updateVehiclePrice("1HGCM82633A100001", 29900);
      expect(res.ok).toBe(true);
    });

    test("rejects unknown VIN", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.updateVehiclePrice("NOPE", 29900);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe("upstream_error");
    });

    test("rejects negative price", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.updateVehiclePrice("1HGCM82633A100001", -1);
      expect(res.ok).toBe(false);
    });
  });

  describe("listLeads", () => {
    test("returns 5 leads", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.listLeads();
      if (res.ok) expect(res.data).toHaveLength(5);
    });

    test("filters by status", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.listLeads({ status: "qualified" });
      if (res.ok) {
        expect(res.data).toHaveLength(1);
        expect(res.data[0].firstName).toBe("Carla");
      }
    });

    test("filters by since", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.listLeads({ since: new Date("2026-05-11T00:00:00Z") });
      if (res.ok) {
        // Only one lead has createdAt >= 2026-05-11
        expect(res.data).toHaveLength(1);
        expect(res.data[0].firstName).toBe("Alice");
      }
    });
  });

  describe("updateLeadStatus", () => {
    test("succeeds for known lead", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.updateLeadStatus("MKL-0001", "contacted");
      expect(res.ok).toBe(true);
    });

    test("rejects unknown lead", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.updateLeadStatus("NOPE", "contacted");
      expect(res.ok).toBe(false);
    });

    test("rejects empty status", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.updateLeadStatus("MKL-0001", "");
      expect(res.ok).toBe(false);
    });
  });

  describe("listDeals", () => {
    test("returns 3 deals", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.listDeals();
      if (res.ok) expect(res.data).toHaveLength(3);
    });

    test("filters funded=true", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.listDeals({ funded: true });
      if (res.ok) {
        expect(res.data).toHaveLength(2);
        for (const d of res.data) expect(d.funded).toBe(true);
      }
    });

    test("filters funded=false", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.listDeals({ funded: false });
      if (res.ok) {
        expect(res.data).toHaveLength(1);
        expect(res.data[0].funded).toBe(false);
      }
    });
  });

  describe("listServiceOrders", () => {
    test("returns 2 service orders", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.listServiceOrders();
      if (res.ok) expect(res.data).toHaveLength(2);
    });

    test("filters open=true", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.listServiceOrders({ open: true });
      if (res.ok) {
        expect(res.data).toHaveLength(2);
      }
    });

    test("filters open=false (no closed orders in mock)", async () => {
      const adapter = createMockAdapter();
      const res = await adapter.listServiceOrders({ open: false });
      if (res.ok) expect(res.data).toHaveLength(0);
    });
  });
});
