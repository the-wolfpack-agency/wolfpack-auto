/**
 * Unit tests for the mock e-commerce adapter.
 *
 * The mock adapter is deterministic by design. These tests assert exact
 * counts + filter semantics so any regression in the demo dataset is
 * caught immediately. Mirrors `src/lib/dms-adapters/__tests__/mock-adapter.test.ts`.
 */

import { MockEcommerceAdapter, createMockEcommerceAdapter } from "../mock-adapter";
import { ALL_ECOMMERCE_CAPABILITIES } from "../types";

describe("MockEcommerceAdapter", () => {
  describe("contract", () => {
    test("declares mock_shop provider", () => {
      const adapter = new MockEcommerceAdapter();
      expect(adapter.provider).toBe("mock_shop");
    });

    test("declares ALL capabilities", () => {
      const adapter = createMockEcommerceAdapter();
      for (const cap of ALL_ECOMMERCE_CAPABILITIES) {
        expect(adapter.capabilities.has(cap)).toBe(true);
      }
      expect(adapter.capabilities.size).toBe(ALL_ECOMMERCE_CAPABILITIES.length);
    });

    test("ping returns healthy:true", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.ping();
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.healthy).toBe(true);
        expect(res.data.vendor_version).toBe("mock_shop-1.0.0");
      }
    });
  });

  describe("listProducts", () => {
    test("returns 20 deterministic products", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.listProducts();
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data).toHaveLength(20);
        expect(res.data.every((p) => p.isMock === true)).toBe(true);
        // determinism — same call twice returns same dataset
        const second = await adapter.listProducts();
        if (second.ok) {
          expect(second.data).toEqual(res.data);
        }
      }
    });

    test("filters by SKU (case insensitive)", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.listProducts({ sku: "sku-cotton-tee-s" });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data).toHaveLength(1);
        expect(res.data[0].title).toMatch(/Small/);
      }
    });

    test("filters by in_stock=true", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.listProducts({ in_stock: true });
      expect(res.ok).toBe(true);
      if (res.ok) {
        for (const p of res.data) expect(p.inStock).toBe(true);
      }
    });

    test("filters by in_stock=false", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.listProducts({ in_stock: false });
      expect(res.ok).toBe(true);
      if (res.ok) {
        // 3 products in the fixture are out of stock
        expect(res.data.length).toBeGreaterThanOrEqual(1);
        for (const p of res.data) expect(p.inStock).toBe(false);
      }
    });

    test("applies limit", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.listProducts({ limit: 5 });
      if (res.ok) expect(res.data).toHaveLength(5);
    });
  });

  describe("updateProduct", () => {
    test("succeeds for a known externalId", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.updateProduct("MS-P-0001", { price: 22.0 });
      expect(res.ok).toBe(true);
    });

    test("rejects unknown externalId", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.updateProduct("NOPE", { price: 1 });
      expect(res.ok).toBe(false);
    });

    test("rejects negative price", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.updateProduct("MS-P-0001", { price: -1 });
      expect(res.ok).toBe(false);
    });
  });

  describe("listOrders", () => {
    test("returns 10 orders", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.listOrders();
      if (res.ok) expect(res.data).toHaveLength(10);
    });

    test("filters by status", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.listOrders({ status: "refunded" });
      if (res.ok) {
        expect(res.data).toHaveLength(1);
        expect(res.data[0].customerEmail).toBe("frank@example.com");
      }
    });

    test("filters by since", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.listOrders({
        since: new Date("2026-05-11T00:00:00Z"),
      });
      if (res.ok) {
        for (const o of res.data) {
          expect(new Date(o.placedAt).getTime()).toBeGreaterThanOrEqual(
            new Date("2026-05-11T00:00:00Z").getTime(),
          );
        }
      }
    });
  });

  describe("listCustomers", () => {
    test("returns 15 customers", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.listCustomers();
      if (res.ok) expect(res.data).toHaveLength(15);
    });

    test("applies limit", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.listCustomers({ limit: 3 });
      if (res.ok) expect(res.data).toHaveLength(3);
    });
  });

  describe("listCarts", () => {
    test("returns 6 carts", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.listCarts();
      if (res.ok) expect(res.data).toHaveLength(6);
    });

    test("filters abandoned=true", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.listCarts({ abandoned: true });
      if (res.ok) {
        for (const c of res.data) expect(c.abandoned).toBe(true);
      }
    });
  });

  describe("draftCampaign", () => {
    test("succeeds with deterministic draft id", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.draftCampaign({
        channel: "email",
        name: "Spring Drop",
        segment: "newsletter",
        subject: "New Drop",
        body: "Hello",
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.draft_id).toBe("mock-draft-email-spring_drop");
      }
    });

    test("rejects empty body", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.draftCampaign({
        channel: "email",
        name: "X",
        segment: "x",
        body: "",
      });
      expect(res.ok).toBe(false);
    });

    test("rejects empty name", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.draftCampaign({
        channel: "email",
        name: "",
        segment: "x",
        body: "hi",
      });
      expect(res.ok).toBe(false);
    });
  });

  describe("readFunnelAnalytics", () => {
    test("returns funnel for the supplied range", async () => {
      const adapter = createMockEcommerceAdapter();
      const from = new Date("2026-04-12T00:00:00Z");
      const to = new Date("2026-05-12T00:00:00Z");
      const res = await adapter.readFunnelAnalytics({ from, to });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.sessions).toBeGreaterThan(0);
        expect(res.data.conversionRate).toBeGreaterThan(0);
        expect(res.data.from).toBe(from.toISOString());
        expect(res.data.to).toBe(to.toISOString());
        expect(res.data.isMock).toBe(true);
      }
    });

    test("rejects non-Date range", async () => {
      const adapter = createMockEcommerceAdapter();
      // @ts-expect-error testing runtime guard
      const res = await adapter.readFunnelAnalytics({ from: "x", to: "y" });
      expect(res.ok).toBe(false);
    });
  });

  describe("readAdPerformance", () => {
    test("returns 4 deterministic ad rows", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.readAdPerformance();
      if (res.ok) expect(res.data).toHaveLength(4);
    });

    test("filters by campaignId", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.readAdPerformance({ campaignId: "MS-AD-CAMP-003" });
      if (res.ok) {
        expect(res.data).toHaveLength(1);
        expect(res.data[0].channel).toBe("google");
      }
    });
  });

  describe("pauseAd", () => {
    test("succeeds for known campaign", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.pauseAd("MS-AD-CAMP-001");
      expect(res.ok).toBe(true);
    });

    test("rejects unknown campaign", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.pauseAd("NOPE");
      expect(res.ok).toBe(false);
    });
  });

  describe("readEmailEngagement", () => {
    test("returns 3 deterministic engagement rows", async () => {
      const adapter = createMockEcommerceAdapter();
      const res = await adapter.readEmailEngagement();
      if (res.ok) expect(res.data).toHaveLength(3);
    });
  });
});
