/**
 * Mock e-commerce adapter — deterministic synthetic data for development,
 * E2E tests, and BBB-pitch demo motions before any real Shopify / etc
 * connection is wired.
 *
 * Mirrors `src/lib/dms-adapters/mock-adapter.ts` — same determinism
 * guarantees, same `isMock: true` discipline so downstream UI code can
 * render a "Demo data" banner. Never strip that flag before the data
 * leaves the adapter boundary — confusing mock data for real data is the
 * kind of production bug that costs trust.
 *
 * Dataset:
 *   - 20 products (mix of statuses, in-stock, out-of-stock)
 *   - 10 orders (mix of statuses)
 *   - 15 customers (mix of marketing opt-in, spend)
 *   - 6 carts (mix of abandoned/active)
 *   - 1 campaign draft (returned via draftCampaign)
 *   - 30-day funnel metrics
 *   - 4 ad performance rows
 *   - 3 email engagement rows
 *
 * Determinism: the dataset is the same on every call (subject to filter).
 * No randomness, no timestamps that drift between requests. Tests can
 * assert exact shapes.
 */

import type { EcommerceAdapter } from "./adapter-interface";
import {
  ALL_ECOMMERCE_CAPABILITIES,
  type AdapterPingStatus,
  type AdapterResult,
  type AdPerformanceFilter,
  type AdPerformanceRow,
  type CampaignSpec,
  type CartFilter,
  type CartSnapshot,
  type CustomerFilter,
  type EcommerceCapability,
  type EcommerceCustomer,
  type EcommerceOrder,
  type EcommerceProduct,
  type EmailEngagementFilter,
  type EmailEngagementRow,
  type FunnelMetrics,
  type OrderFilter,
  type ProductFilter,
} from "./types";

const FIXED_NOW = "2026-05-12T00:00:00.000Z";
const FIXED_30D_AGO = "2026-04-12T00:00:00.000Z";

// ---------------------------------------------------------------------------
// Synthetic fixtures
// ---------------------------------------------------------------------------

const PRODUCTS: EcommerceProduct[] = [
  p("MS-P-0001", "SKU-COTTON-TEE-S",   "Classic Cotton Tee — Small",        "ACME Apparel",   "apparel",    "active",   24.99,  125),
  p("MS-P-0002", "SKU-COTTON-TEE-M",   "Classic Cotton Tee — Medium",       "ACME Apparel",   "apparel",    "active",   24.99,   88),
  p("MS-P-0003", "SKU-COTTON-TEE-L",   "Classic Cotton Tee — Large",        "ACME Apparel",   "apparel",    "active",   24.99,    9),
  p("MS-P-0004", "SKU-DENIM-32",       "Slim Denim — 32W",                  "ACME Apparel",   "apparel",    "active",   58.0,   42),
  p("MS-P-0005", "SKU-DENIM-34",       "Slim Denim — 34W",                  "ACME Apparel",   "apparel",    "active",   58.0,    0),
  p("MS-P-0006", "SKU-MUG-12OZ",       "Ceramic Mug — 12oz",                "ACME Home",      "homegoods",  "active",   14.5,   210),
  p("MS-P-0007", "SKU-MUG-16OZ",       "Ceramic Mug — 16oz",                "ACME Home",      "homegoods",  "active",   18.0,    77),
  p("MS-P-0008", "SKU-CANDLE-VAN",     "Vanilla Soy Candle",                "ACME Home",      "homegoods",  "active",   22.0,    63),
  p("MS-P-0009", "SKU-CANDLE-LAV",     "Lavender Soy Candle",               "ACME Home",      "homegoods",  "active",   22.0,    12),
  p("MS-P-0010", "SKU-CANDLE-CIT",     "Citrus Soy Candle",                 "ACME Home",      "homegoods",  "draft",    22.0,     0),
  p("MS-P-0011", "SKU-LOTION-8OZ",     "Hand Lotion — 8oz",                 "ACME Beauty",    "beauty",     "active",   19.5,    98),
  p("MS-P-0012", "SKU-LOTION-16OZ",    "Hand Lotion — 16oz",                "ACME Beauty",    "beauty",     "active",   34.0,    41),
  p("MS-P-0013", "SKU-SOAP-3PK",       "Artisan Soap 3-pack",               "ACME Beauty",    "beauty",     "active",   28.0,   140),
  p("MS-P-0014", "SKU-COFFEE-12",      "Single-origin Coffee — 12oz",       "ACME Pantry",    "food",       "active",   22.0,   180),
  p("MS-P-0015", "SKU-TEA-LOOSE",      "Loose-leaf Earl Grey",              "ACME Pantry",    "food",       "active",   16.0,    55),
  p("MS-P-0016", "SKU-NOTEBOOK-A5",    "Hardcover Notebook A5",             "ACME Stationery","stationery", "active",   14.0,   220),
  p("MS-P-0017", "SKU-PEN-3PK",        "Gel Pen 3-pack",                    "ACME Stationery","stationery", "active",    8.5,   430),
  p("MS-P-0018", "SKU-BOTTLE-32",      "Insulated Bottle — 32oz",           "ACME Outdoors",  "outdoors",   "active",   38.0,    72),
  p("MS-P-0019", "SKU-TOTE-CANVAS",    "Canvas Tote Bag",                   "ACME Outdoors",  "outdoors",   "active",   24.0,   105),
  p("MS-P-0020", "SKU-LEGACY-SHIRT",   "Legacy Tee (Archived)",             "ACME Apparel",   "apparel",    "archived", 19.99,    0),
];

const ORDERS: EcommerceOrder[] = [
  o("MS-O-1001", "#1001", "alice@example.com",  "Alice Garcia", "paid",      "fulfilled",   "USD", 124.97, 3, "online_store",   "2026-05-11T18:42:00.000Z"),
  o("MS-O-1002", "#1002", "brian@example.com",  "Brian Chen",   "paid",      "in_transit",  "USD",  86.0,  2, "online_store",   "2026-05-11T12:15:00.000Z"),
  o("MS-O-1003", "#1003", "carla@example.com",  "Carla Singh",  "fulfilled", "delivered",   "USD",  44.0,  2, "online_store",   "2026-05-10T09:30:00.000Z"),
  o("MS-O-1004", "#1004", "devon@example.com",  "Devon Murphy", "pending",   null,          "USD",  72.5,  1, "online_store",   "2026-05-12T07:10:00.000Z"),
  o("MS-O-1005", "#1005", "elena@example.com",  "Elena Park",   "paid",      "fulfilled",   "USD", 248.0,  4, "instagram",      "2026-05-09T16:20:00.000Z"),
  o("MS-O-1006", "#1006", "frank@example.com",  "Frank Liu",    "refunded",  "returned",    "USD",  58.0,  1, "online_store",   "2026-05-08T14:00:00.000Z"),
  o("MS-O-1007", "#1007", "gina@example.com",   "Gina Park",    "paid",      "fulfilled",   "USD",  18.0,  1, "online_store",   "2026-05-07T20:00:00.000Z"),
  o("MS-O-1008", "#1008", "henry@example.com",  "Henry Park",   "cancelled", null,          "USD",  92.0,  3, "online_store",   "2026-05-07T08:00:00.000Z"),
  o("MS-O-1009", "#1009", "ivy@example.com",    "Ivy Park",     "paid",      "processing",  "USD", 156.0,  2, "tiktok",         "2026-05-12T11:00:00.000Z"),
  o("MS-O-1010", "#1010", "jacob@example.com",  "Jacob Park",   "paid",      "fulfilled",   "USD",  34.5,  2, "online_store",   "2026-05-06T13:00:00.000Z"),
];

const CUSTOMERS: EcommerceCustomer[] = [
  c("MS-C-2001", "alice@example.com",   "Alice",   "Garcia",  true,  1230.45, 12, ["vip", "newsletter"]),
  c("MS-C-2002", "brian@example.com",   "Brian",   "Chen",    true,   480.0,   6, ["newsletter"]),
  c("MS-C-2003", "carla@example.com",   "Carla",   "Singh",   false,  176.0,   4, []),
  c("MS-C-2004", "devon@example.com",   "Devon",   "Murphy",  true,    72.5,   1, ["sale-shopper"]),
  c("MS-C-2005", "elena@example.com",   "Elena",   "Park",    true,  2480.0,  18, ["vip", "newsletter", "early-access"]),
  c("MS-C-2006", "frank@example.com",   "Frank",   "Liu",     false,   58.0,   1, []),
  c("MS-C-2007", "gina@example.com",    "Gina",    "Park",    true,    36.0,   2, ["newsletter"]),
  c("MS-C-2008", "henry@example.com",   "Henry",   "Park",    false,    0.0,   0, []),
  c("MS-C-2009", "ivy@example.com",     "Ivy",     "Park",    true,   312.0,   2, ["newsletter", "sale-shopper"]),
  c("MS-C-2010", "jacob@example.com",   "Jacob",   "Park",    true,   138.0,   4, ["newsletter"]),
  c("MS-C-2011", "kate@example.com",    "Kate",    "Park",    true,   880.0,   9, ["newsletter", "vip"]),
  c("MS-C-2012", "lee@example.com",     "Lee",     "Park",    false,   42.0,   1, []),
  c("MS-C-2013", "mara@example.com",    "Mara",    "Park",    true,   210.0,   3, ["newsletter"]),
  c("MS-C-2014", "noah@example.com",    "Noah",    "Park",    true,   590.0,   7, ["newsletter", "sale-shopper"]),
  c("MS-C-2015", "olive@example.com",   "Olive",   "Park",    true,    18.0,   1, ["newsletter"]),
];

const CARTS: CartSnapshot[] = [
  cart("MS-CART-3001", "alice@example.com",  3, 124.97, false, "2026-05-11T18:30:00.000Z"),
  cart("MS-CART-3002", "kate@example.com",   2,  46.0,  true,  "2026-05-10T22:00:00.000Z"),
  cart("MS-CART-3003", null,                 1,  24.99, true,  "2026-05-11T11:14:00.000Z"),
  cart("MS-CART-3004", "noah@example.com",   4, 188.0,  true,  "2026-05-09T07:20:00.000Z"),
  cart("MS-CART-3005", "ivy@example.com",    2, 156.0,  false, "2026-05-12T10:50:00.000Z"),
  cart("MS-CART-3006", "lee@example.com",    1,  18.0,  true,  "2026-05-08T16:00:00.000Z"),
];

const FUNNEL: FunnelMetrics = {
  from: FIXED_30D_AGO,
  to: FIXED_NOW,
  sessions: 18420,
  productViews: 56210,
  addsToCart: 4310,
  checkoutsStarted: 1820,
  ordersPlaced: 980,
  conversionRate: 0.0532,
  revenue: 78420.5,
  currency: "USD",
  isMock: true,
};

const AD_ROWS: AdPerformanceRow[] = [
  ad("MS-AD-CAMP-001", "Spring Apparel — Meta Prospecting", "meta",   "active", 412034, 6210, 4820.5,  214, 22.52, 4.21, "USD", FIXED_30D_AGO, FIXED_NOW),
  ad("MS-AD-CAMP-002", "Spring Apparel — Meta Retargeting", "meta",   "active",  88210, 3210, 2104.0,  302,  6.97, 8.42, "USD", FIXED_30D_AGO, FIXED_NOW),
  ad("MS-AD-CAMP-003", "Brand Search — Google",             "google", "active",  42100, 4400, 1820.0,  410,  4.44, 9.18, "USD", FIXED_30D_AGO, FIXED_NOW),
  ad("MS-AD-CAMP-004", "Discontinued Test — Paused",        "meta",   "paused",  18210,  402,  812.0,    7,  116, 0.18, "USD", FIXED_30D_AGO, FIXED_NOW),
];

const EMAIL_ROWS: EmailEngagementRow[] = [
  em("MS-EM-CAMP-001", "Spring Drop Launch",       12480, 12120,  4210, 820,  62, 138, FIXED_30D_AGO, FIXED_NOW),
  em("MS-EM-CAMP-002", "Mother's Day Pre-launch",  10200,  9980,  3120, 612,  41,  91, FIXED_30D_AGO, FIXED_NOW),
  em("MS-EM-CAMP-003", "Abandon Cart — Day 1",      4210,  4180,  1620, 410,  18,  30, FIXED_30D_AGO, FIXED_NOW),
];

function p(
  externalId: string, sku: string, title: string, vendor: string, productType: string,
  status: EcommerceProduct["status"], price: number, inventoryQuantity: number,
): EcommerceProduct {
  return {
    externalId, sku, title, vendor, productType, status, price,
    inventoryQuantity, inStock: inventoryQuantity > 0,
    createdAt: FIXED_30D_AGO, updatedAt: FIXED_NOW, isMock: true,
  };
}

function o(
  externalId: string, orderNumber: string, customerEmail: string | null,
  customerName: string | null, status: EcommerceOrder["status"], fulfillmentStatus: string | null,
  currency: string, totalPrice: number, itemCount: number, channel: string | null,
  placedAt: string,
): EcommerceOrder {
  return {
    externalId, orderNumber, customerEmail, customerName, status, fulfillmentStatus,
    currency, totalPrice, itemCount, channel, placedAt, isMock: true,
  };
}

function c(
  externalId: string, email: string | null, firstName: string | null, lastName: string | null,
  marketingOptIn: boolean, totalSpent: number, ordersCount: number, tags: string[],
): EcommerceCustomer {
  return {
    externalId, email, firstName, lastName, marketingOptIn, totalSpent,
    ordersCount, tags, createdAt: FIXED_30D_AGO, isMock: true,
  };
}

function cart(
  externalId: string, customerEmail: string | null, itemCount: number, subtotal: number,
  abandoned: boolean, lastActivityAt: string,
): CartSnapshot {
  return {
    externalId, customerEmail, itemCount, subtotal, currency: "USD",
    abandoned, lastActivityAt, isMock: true,
  };
}

function ad(
  campaignExternalId: string, campaignName: string, channel: AdPerformanceRow["channel"],
  status: AdPerformanceRow["status"], impressions: number, clicks: number, spend: number,
  conversions: number, cpa: number, roas: number, currency: string,
  windowStart: string, windowEnd: string,
): AdPerformanceRow {
  return {
    campaignExternalId, campaignName, channel, status, impressions, clicks, spend,
    conversions, cpa, roas, currency, windowStart, windowEnd, isMock: true,
  };
}

function em(
  campaignExternalId: string, campaignName: string, sent: number, delivered: number,
  opens: number, clicks: number, unsubscribes: number, bounces: number,
  windowStart: string, windowEnd: string,
): EmailEngagementRow {
  return {
    campaignExternalId, campaignName, sent, delivered, opens, clicks, unsubscribes,
    bounces, windowStart, windowEnd, isMock: true,
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class MockEcommerceAdapter implements EcommerceAdapter {
  public readonly provider = "mock_shop" as const;
  public readonly capabilities: ReadonlySet<EcommerceCapability>;

  constructor() {
    // Mock adapter declares ALL capabilities so the registry passes through.
    this.capabilities = new Set(ALL_ECOMMERCE_CAPABILITIES);
  }

  async ping(): Promise<AdapterResult<AdapterPingStatus>> {
    return { ok: true, data: { healthy: true, vendor_version: "mock_shop-1.0.0" } };
  }

  async listProducts(filter?: ProductFilter): Promise<AdapterResult<EcommerceProduct[]>> {
    let rows = PRODUCTS.slice();
    if (filter?.sku) {
      const sku = filter.sku.toUpperCase();
      rows = rows.filter((r) => r.sku.toUpperCase() === sku);
    }
    if (typeof filter?.in_stock === "boolean") {
      rows = rows.filter((r) => r.inStock === filter.in_stock);
    }
    if (typeof filter?.limit === "number" && filter.limit >= 0) {
      rows = rows.slice(0, filter.limit);
    }
    return { ok: true, data: rows };
  }

  async updateProduct(
    externalId: string,
    patch: Partial<Pick<EcommerceProduct, "title" | "price" | "status" | "inventoryQuantity">>,
  ): Promise<AdapterResult<void>> {
    const product = PRODUCTS.find((row) => row.externalId === externalId);
    if (!product) {
      return { ok: false, error: "upstream_error", detail: `product not found: ${externalId}` };
    }
    if (patch.price !== undefined && (typeof patch.price !== "number" || patch.price < 0)) {
      return { ok: false, error: "upstream_error", detail: "price must be a non-negative number" };
    }
    return { ok: true, data: undefined };
  }

  async listOrders(filter?: OrderFilter): Promise<AdapterResult<EcommerceOrder[]>> {
    let rows = ORDERS.slice();
    if (filter?.status) {
      rows = rows.filter((r) => r.status === filter.status);
    }
    if (filter?.since instanceof Date) {
      const since = filter.since.getTime();
      rows = rows.filter((r) => new Date(r.placedAt).getTime() >= since);
    }
    if (typeof filter?.limit === "number" && filter.limit >= 0) {
      rows = rows.slice(0, filter.limit);
    }
    return { ok: true, data: rows };
  }

  async listCustomers(filter?: CustomerFilter): Promise<AdapterResult<EcommerceCustomer[]>> {
    let rows = CUSTOMERS.slice();
    if (filter?.since instanceof Date) {
      const since = filter.since.getTime();
      rows = rows.filter((r) => new Date(r.createdAt).getTime() >= since);
    }
    if (typeof filter?.limit === "number" && filter.limit >= 0) {
      rows = rows.slice(0, filter.limit);
    }
    return { ok: true, data: rows };
  }

  async listCarts(filter?: CartFilter): Promise<AdapterResult<CartSnapshot[]>> {
    let rows = CARTS.slice();
    if (typeof filter?.abandoned === "boolean") {
      rows = rows.filter((r) => r.abandoned === filter.abandoned);
    }
    if (typeof filter?.limit === "number" && filter.limit >= 0) {
      rows = rows.slice(0, filter.limit);
    }
    return { ok: true, data: rows };
  }

  async draftCampaign(spec: CampaignSpec): Promise<AdapterResult<{ draft_id: string }>> {
    if (!spec || typeof spec.name !== "string" || spec.name.length === 0) {
      return { ok: false, error: "upstream_error", detail: "campaign name required" };
    }
    if (!spec.body || spec.body.length === 0) {
      return { ok: false, error: "upstream_error", detail: "campaign body required" };
    }
    return {
      ok: true,
      data: { draft_id: `mock-draft-${spec.channel}-${spec.name.replace(/\s+/g, "_").toLowerCase()}` },
    };
  }

  async readFunnelAnalytics(range: { from: Date; to: Date }): Promise<AdapterResult<FunnelMetrics>> {
    if (!(range.from instanceof Date) || !(range.to instanceof Date)) {
      return { ok: false, error: "upstream_error", detail: "from/to must be Date instances" };
    }
    return {
      ok: true,
      data: {
        ...FUNNEL,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
    };
  }

  async readAdPerformance(
    filter?: AdPerformanceFilter,
  ): Promise<AdapterResult<AdPerformanceRow[]>> {
    let rows = AD_ROWS.slice();
    if (filter?.campaignId) {
      rows = rows.filter((r) => r.campaignExternalId === filter.campaignId);
    }
    if (typeof filter?.limit === "number" && filter.limit >= 0) {
      rows = rows.slice(0, filter.limit);
    }
    return { ok: true, data: rows };
  }

  async pauseAd(campaignExternalId: string): Promise<AdapterResult<void>> {
    const row = AD_ROWS.find((r) => r.campaignExternalId === campaignExternalId);
    if (!row) {
      return { ok: false, error: "upstream_error", detail: `campaign not found: ${campaignExternalId}` };
    }
    return { ok: true, data: undefined };
  }

  async readEmailEngagement(
    filter?: EmailEngagementFilter,
  ): Promise<AdapterResult<EmailEngagementRow[]>> {
    let rows = EMAIL_ROWS.slice();
    if (filter?.since instanceof Date) {
      const since = filter.since.getTime();
      rows = rows.filter((r) => new Date(r.windowStart).getTime() >= since);
    }
    if (typeof filter?.limit === "number" && filter.limit >= 0) {
      rows = rows.slice(0, filter.limit);
    }
    return { ok: true, data: rows };
  }
}

/** Factory used by the registry. Mock adapter ignores credentials. */
export function createMockEcommerceAdapter(): MockEcommerceAdapter {
  return new MockEcommerceAdapter();
}
