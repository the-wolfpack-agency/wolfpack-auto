/**
 * Unit tests for the stub adapters (Cox/vAuto, DealerSocket, CDK).
 *
 * Until partner enrollment is approved, every adapter method should
 * return `not_configured` (or `not_supported` for capabilities the
 * adapter explicitly does not declare). These tests pin that contract
 * so a future "wire the real Cox API" change is forced to update the
 * test suite — i.e. you cannot accidentally silently lose the stub.
 */

import { CDKAdapter, createCDKAdapter } from "../cdk-adapter";
import { CoxVAutoAdapter, createCoxVAutoAdapter } from "../cox-vauto-adapter";
import {
  DealerSocketAdapter,
  createDealerSocketAdapter,
} from "../dealersocket-adapter";

describe("CoxVAutoAdapter (stub)", () => {
  test("declares cox_vauto provider", () => {
    expect(new CoxVAutoAdapter(null).provider).toBe("cox_vauto");
  });

  test("declares read-only capabilities", () => {
    const adapter = createCoxVAutoAdapter(null);
    expect(adapter.capabilities.has("read_inventory")).toBe(true);
    expect(adapter.capabilities.has("read_leads")).toBe(true);
    expect(adapter.capabilities.has("read_deals")).toBe(true);
    expect(adapter.capabilities.has("write_inventory_update")).toBe(false);
    expect(adapter.capabilities.has("write_lead_update")).toBe(false);
    expect(adapter.capabilities.has("read_service_orders")).toBe(false);
  });

  test("every read method returns not_configured without creds", async () => {
    const adapter = createCoxVAutoAdapter(null);
    const calls = [
      await adapter.ping(),
      await adapter.listVehicles(),
      await adapter.listLeads(),
      await adapter.listDeals(),
    ];
    for (const r of calls) {
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toBe("not_configured");
        expect(r.detail).toMatch(/cox-api-key/i);
      }
    }
  });

  test("write methods short-circuit to not_supported", async () => {
    const adapter = createCoxVAutoAdapter(null);
    const update = await adapter.updateVehiclePrice("VIN", 1);
    expect(update.ok).toBe(false);
    if (!update.ok) expect(update.error).toBe("not_supported");

    const lead = await adapter.updateLeadStatus("L1", "x");
    expect(lead.ok).toBe(false);
    if (!lead.ok) expect(lead.error).toBe("not_supported");
  });

  test("service-orders not supported (year-one scope)", async () => {
    const adapter = createCoxVAutoAdapter(null);
    const res = await adapter.listServiceOrders();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("not_supported");
  });
});

describe("DealerSocketAdapter (stub)", () => {
  test("declares dealersocket provider", () => {
    expect(new DealerSocketAdapter(null).provider).toBe("dealersocket");
  });

  test("read methods return not_configured with dealersocket-credential marker", async () => {
    const adapter = createDealerSocketAdapter(null);
    const res = await adapter.listVehicles();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("not_configured");
      expect(res.detail).toMatch(/dealersocket-credential/i);
    }
  });

  test("write methods are not_supported", async () => {
    const adapter = createDealerSocketAdapter(null);
    const u = await adapter.updateVehiclePrice("V", 1);
    expect(u.ok).toBe(false);
    if (!u.ok) expect(u.error).toBe("not_supported");
  });
});

describe("CDKAdapter (stub)", () => {
  test("declares cdk provider", () => {
    expect(new CDKAdapter(null).provider).toBe("cdk");
  });

  test("read methods return not_configured with cdk-credential marker", async () => {
    const adapter = createCDKAdapter(null);
    const res = await adapter.listLeads();
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("not_configured");
      expect(res.detail).toMatch(/cdk-credential/i);
    }
  });
});
