/**
 * Unit tests for the e-commerce stub adapters (Shopify, BigCommerce, Adobe
 * Commerce, Klaviyo, Attentive, Meta Ads, Google Ads).
 *
 * Until partner enrollment is approved, every adapter method should return
 * `not_configured` for capabilities the adapter declares, or `not_supported`
 * for capabilities it does NOT declare. These tests pin that contract so a
 * future "wire the real Shopify API" change is forced to update the test
 * suite — i.e. you cannot accidentally silently lose the stub.
 *
 * Also pins the capability matrix per provider so any drift from the
 * documented per-provider scope (Klaviyo is email-only, Meta is ad-only,
 * etc.) trips a test.
 */

import {
  AdobeCommerceAdapter,
  createAdobeCommerceAdapter,
} from "../adobe-commerce-adapter";
import { AttentiveAdapter, createAttentiveAdapter } from "../attentive-adapter";
import {
  BigCommerceAdapter,
  createBigCommerceAdapter,
} from "../bigcommerce-adapter";
import { GoogleAdsAdapter, createGoogleAdsAdapter } from "../google-ads-adapter";
import { KlaviyoAdapter, createKlaviyoAdapter } from "../klaviyo-adapter";
import { MetaAdsAdapter, createMetaAdsAdapter } from "../meta-ads-adapter";
import { ShopifyAdapter, createShopifyAdapter } from "../shopify-adapter";

describe("ShopifyAdapter (stub)", () => {
  test("declares shopify provider", () => {
    expect(new ShopifyAdapter(null).provider).toBe("shopify");
  });

  test("declares full-coverage capabilities (read products/orders/customers/carts + write_product_update + read_funnel_analytics)", () => {
    const a = createShopifyAdapter(null);
    expect(a.capabilities.has("read_products")).toBe(true);
    expect(a.capabilities.has("write_product_update")).toBe(true);
    expect(a.capabilities.has("read_orders")).toBe(true);
    expect(a.capabilities.has("read_customers")).toBe(true);
    expect(a.capabilities.has("read_carts")).toBe(true);
    expect(a.capabilities.has("read_funnel_analytics")).toBe(true);
    // ads + marketing live in other adapters
    expect(a.capabilities.has("read_ad_performance")).toBe(false);
    expect(a.capabilities.has("write_campaign_draft")).toBe(false);
  });

  test("every read method returns not_configured without creds", async () => {
    const a = createShopifyAdapter(null);
    const calls = [
      await a.ping(),
      await a.listProducts(),
      await a.listOrders(),
      await a.listCustomers(),
      await a.listCarts(),
      await a.readFunnelAnalytics({ from: new Date(), to: new Date() }),
    ];
    for (const r of calls) {
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toBe("not_configured");
        expect(r.detail).toMatch(/shopify-credential/i);
      }
    }
  });

  test("undeclared capabilities short-circuit to not_supported", async () => {
    const a = createShopifyAdapter(null);
    const draft = await a.draftCampaign({
      channel: "email",
      name: "x",
      segment: "x",
      body: "x",
    });
    expect(draft.ok).toBe(false);
    if (!draft.ok) expect(draft.error).toBe("not_supported");

    const ads = await a.readAdPerformance();
    expect(ads.ok).toBe(false);
    if (!ads.ok) expect(ads.error).toBe("not_supported");
  });
});

describe("BigCommerceAdapter (stub)", () => {
  test("declares bigcommerce provider", () => {
    expect(new BigCommerceAdapter(null).provider).toBe("bigcommerce");
  });

  test("declares read_products + write_product_update + read_orders + read_customers (no carts/analytics/ads)", () => {
    const a = createBigCommerceAdapter(null);
    expect(a.capabilities.has("read_products")).toBe(true);
    expect(a.capabilities.has("write_product_update")).toBe(true);
    expect(a.capabilities.has("read_orders")).toBe(true);
    expect(a.capabilities.has("read_customers")).toBe(true);
    expect(a.capabilities.has("read_carts")).toBe(false);
    expect(a.capabilities.has("read_funnel_analytics")).toBe(false);
    expect(a.capabilities.has("read_ad_performance")).toBe(false);
  });

  test("read methods return not_configured with bigcommerce-credential marker", async () => {
    const a = createBigCommerceAdapter(null);
    const r = await a.listProducts();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("not_configured");
      expect(r.detail).toMatch(/bigcommerce-credential/i);
    }
  });
});

describe("AdobeCommerceAdapter (stub)", () => {
  test("declares adobe_commerce provider", () => {
    expect(new AdobeCommerceAdapter(null).provider).toBe("adobe_commerce");
  });

  test("declares read_products + read_orders + read_customers (read-only year-2)", () => {
    const a = createAdobeCommerceAdapter(null);
    expect(a.capabilities.has("read_products")).toBe(true);
    expect(a.capabilities.has("read_orders")).toBe(true);
    expect(a.capabilities.has("read_customers")).toBe(true);
    expect(a.capabilities.has("write_product_update")).toBe(false);
  });

  test("read methods return not_configured with adobe-commerce-credential marker", async () => {
    const a = createAdobeCommerceAdapter(null);
    const r = await a.listProducts();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("not_configured");
      expect(r.detail).toMatch(/adobe-commerce-credential/i);
    }
  });
});

describe("KlaviyoAdapter (stub)", () => {
  test("declares klaviyo provider", () => {
    expect(new KlaviyoAdapter(null).provider).toBe("klaviyo");
  });

  test("declares email-only capabilities (read_customers + write_campaign_draft + read_email_engagement)", () => {
    const a = createKlaviyoAdapter(null);
    expect(a.capabilities.has("read_customers")).toBe(true);
    expect(a.capabilities.has("write_campaign_draft")).toBe(true);
    expect(a.capabilities.has("read_email_engagement")).toBe(true);
    expect(a.capabilities.has("read_products")).toBe(false);
    expect(a.capabilities.has("read_orders")).toBe(false);
    expect(a.capabilities.has("read_ad_performance")).toBe(false);
  });

  test("listProducts is not_supported (Klaviyo doesn't own products)", async () => {
    const a = createKlaviyoAdapter(null);
    const r = await a.listProducts();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("not_supported");
  });

  test("declared methods return not_configured with klaviyo-credential marker", async () => {
    const a = createKlaviyoAdapter(null);
    const r = await a.listCustomers();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("not_configured");
      expect(r.detail).toMatch(/klaviyo-credential/i);
    }
  });
});

describe("AttentiveAdapter (stub)", () => {
  test("declares attentive provider", () => {
    expect(new AttentiveAdapter(null).provider).toBe("attentive");
  });

  test("declares sms-marketing capabilities (read_customers + write_campaign_draft only)", () => {
    const a = createAttentiveAdapter(null);
    expect(a.capabilities.has("read_customers")).toBe(true);
    expect(a.capabilities.has("write_campaign_draft")).toBe(true);
    expect(a.capabilities.has("read_email_engagement")).toBe(false);
    expect(a.capabilities.has("read_products")).toBe(false);
  });

  test("declared methods return not_configured with attentive-credential marker", async () => {
    const a = createAttentiveAdapter(null);
    const r = await a.listCustomers();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("not_configured");
      expect(r.detail).toMatch(/attentive-credential/i);
    }
  });
});

describe("MetaAdsAdapter (stub)", () => {
  test("declares meta_ads provider", () => {
    expect(new MetaAdsAdapter(null).provider).toBe("meta_ads");
  });

  test("declares ads-only capabilities (read_ad_performance + write_ad_pause)", () => {
    const a = createMetaAdsAdapter(null);
    expect(a.capabilities.has("read_ad_performance")).toBe(true);
    expect(a.capabilities.has("write_ad_pause")).toBe(true);
    expect(a.capabilities.has("read_products")).toBe(false);
    expect(a.capabilities.has("read_orders")).toBe(false);
    expect(a.capabilities.has("read_email_engagement")).toBe(false);
  });

  test("ad methods return not_configured with meta-ads-credential marker", async () => {
    const a = createMetaAdsAdapter(null);
    const r = await a.readAdPerformance();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("not_configured");
      expect(r.detail).toMatch(/meta-ads-credential/i);
    }
  });

  test("non-ad methods are not_supported", async () => {
    const a = createMetaAdsAdapter(null);
    const r = await a.listProducts();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("not_supported");
  });
});

describe("GoogleAdsAdapter (stub)", () => {
  test("declares google_ads provider", () => {
    expect(new GoogleAdsAdapter(null).provider).toBe("google_ads");
  });

  test("declares ads-only capabilities", () => {
    const a = createGoogleAdsAdapter(null);
    expect(a.capabilities.has("read_ad_performance")).toBe(true);
    expect(a.capabilities.has("write_ad_pause")).toBe(true);
    expect(a.capabilities.has("read_products")).toBe(false);
  });

  test("ad methods return not_configured with google-ads-credential marker", async () => {
    const a = createGoogleAdsAdapter(null);
    const r = await a.readAdPerformance();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("not_configured");
      expect(r.detail).toMatch(/google-ads-credential/i);
    }
  });
});
