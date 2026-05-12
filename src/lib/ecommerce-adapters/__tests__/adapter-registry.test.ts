/**
 * Unit tests for the e-commerce adapter registry — factory routing,
 * capability snapshotting, credential round-tripping through the AES-
 * 256-GCM vault. Mirrors `src/lib/dms-adapters/__tests__/adapter-registry.test.ts`.
 *
 * Tests run in shadow mode (DATABASE_URL unset) so they exercise the
 * library's graceful-degradation path. The integration test
 * (`integration.test.ts`) covers the DB-backed path against a mocked db
 * client.
 */

import {
  configureEcommerceAdapter,
  getEcommerceAdapter,
  listAvailableEcommerceAdapters,
  registerEcommerceAdapter,
  seedDefaultEcommerceAdapters,
  type EcommerceAdapter,
} from "../index";
import { ALL_ECOMMERCE_CAPABILITIES } from "../types";
import { generateTestKey } from "@/lib/external-credentials/crypto-vault";

const ORIGINAL_KEY = process.env.EXTERNAL_CREDENTIAL_KEY;
const ORIGINAL_DB_URL = process.env.DATABASE_URL;

beforeEach(() => {
  process.env.EXTERNAL_CREDENTIAL_KEY = generateTestKey();
  delete process.env.DATABASE_URL;
  seedDefaultEcommerceAdapters();
});

afterEach(() => {
  process.env.EXTERNAL_CREDENTIAL_KEY = ORIGINAL_KEY;
  if (ORIGINAL_DB_URL === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = ORIGINAL_DB_URL;
  }
});

describe("listAvailableEcommerceAdapters", () => {
  test("includes mock_shop + shopify + bigcommerce + adobe_commerce + klaviyo + attentive + meta_ads + google_ads", () => {
    const providers = listAvailableEcommerceAdapters();
    expect(providers).toEqual(
      expect.arrayContaining([
        "mock_shop",
        "shopify",
        "bigcommerce",
        "adobe_commerce",
        "klaviyo",
        "attentive",
        "meta_ads",
        "google_ads",
      ]),
    );
  });
});

describe("registerEcommerceAdapter", () => {
  test("can register a custom factory and resolve it via getEcommerceAdapter", async () => {
    const stub: EcommerceAdapter = {
      provider: "mock_shop",
      capabilities: new Set(["read_products"]),
      ping: async () => ({ ok: true, data: { healthy: true, vendor_version: "stub" } }),
      listProducts: async () => ({ ok: true, data: [] }),
      updateProduct: async () => ({ ok: false, error: "not_supported" }),
      listOrders: async () => ({ ok: true, data: [] }),
      listCustomers: async () => ({ ok: true, data: [] }),
      listCarts: async () => ({ ok: true, data: [] }),
      draftCampaign: async () => ({ ok: false, error: "not_supported" }),
      readFunnelAnalytics: async () => ({
        ok: false,
        error: "not_supported",
      }),
      readAdPerformance: async () => ({ ok: true, data: [] }),
      pauseAd: async () => ({ ok: false, error: "not_supported" }),
      readEmailEngagement: async () => ({ ok: true, data: [] }),
    };
    registerEcommerceAdapter("mock_shop", () => stub);
    const resolved = await getEcommerceAdapter("mock_shop", "tenant-1");
    expect(resolved).toBe(stub);
  });

  test("getEcommerceAdapter returns null for unknown provider", async () => {
    const res = await getEcommerceAdapter("unknown_shop", "tenant-1");
    expect(res).toBeNull();
  });
});

describe("getEcommerceAdapter — shadow mode (no DATABASE_URL)", () => {
  test("returns the mock adapter without persistence", async () => {
    const a = await getEcommerceAdapter("mock_shop", "tenant-1");
    expect(a).not.toBeNull();
    expect(a?.provider).toBe("mock_shop");
  });

  test("returns a stub adapter for non-mock providers", async () => {
    const a = await getEcommerceAdapter("shopify", "tenant-1");
    expect(a).not.toBeNull();
    expect(a?.provider).toBe("shopify");
    const res = await a!.listProducts();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("not_configured");
  });

  test("returns null for revoked-style unknown provider slug", async () => {
    const a = await getEcommerceAdapter("not-a-real-shop", "tenant-1");
    expect(a).toBeNull();
  });
});

describe("configureEcommerceAdapter — shadow mode", () => {
  test("returns synthetic record + snapshots mock_shop capabilities", async () => {
    const record = await configureEcommerceAdapter({
      tenantId: "tenant-1",
      provider: "mock_shop",
      actorUserId: "user-1",
    });
    expect(record.tenantId).toBe("tenant-1");
    expect(record.provider).toBe("mock_shop");
    expect(record.status).toBe("pending"); // no creds supplied
    expect(record.capabilitySet.sort()).toEqual([...ALL_ECOMMERCE_CAPABILITIES].sort());
  });

  test("status flips to active when credentials are supplied (shopify)", async () => {
    const record = await configureEcommerceAdapter({
      tenantId: "tenant-1",
      provider: "shopify",
      plaintextCredentials: { adminAccessToken: "shpat_x", shopDomain: "acme.myshopify.com" },
      actorUserId: "user-1",
    });
    expect(record.status).toBe("active");
    expect(record.capabilitySet.sort()).toEqual(
      [
        "read_carts",
        "read_customers",
        "read_funnel_analytics",
        "read_orders",
        "read_products",
        "write_product_update",
      ].sort(),
    );
  });

  test("klaviyo capability snapshot only covers email-marketing scope", async () => {
    const record = await configureEcommerceAdapter({
      tenantId: "tenant-1",
      provider: "klaviyo",
      plaintextCredentials: { privateKey: "pk_test" },
      actorUserId: "user-1",
    });
    expect(record.capabilitySet.sort()).toEqual(
      ["read_customers", "read_email_engagement", "write_campaign_draft"].sort(),
    );
  });

  test("meta_ads capability snapshot only covers ads scope", async () => {
    const record = await configureEcommerceAdapter({
      tenantId: "tenant-1",
      provider: "meta_ads",
      plaintextCredentials: { accessToken: "EAA", adAccountId: "1234" },
      actorUserId: "user-1",
    });
    expect(record.capabilitySet.sort()).toEqual(
      ["read_ad_performance", "write_ad_pause"].sort(),
    );
  });

  test("throws when provider is unknown", async () => {
    await expect(
      configureEcommerceAdapter({
        // @ts-expect-error testing runtime guard
        tenantId: "tenant-1", provider: "unknown_shop", actorUserId: "user-1",
      }),
    ).rejects.toThrow(/unknown e-commerce adapter provider/);
  });
});
