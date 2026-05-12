/**
 * E-commerce adapter types.
 *
 * The adapter framework abstracts every e-commerce / retail platform
 * (Shopify, BigCommerce, Adobe Commerce, Klaviyo, Attentive, Meta Ads,
 * Google Ads) behind a single typed surface so downstream code (Wolfpack
 * Assistant Platform, action-registry, retail copilot) is platform-agnostic.
 * Year-2 retail-vertical foundation per
 * `docs/wolfpack-platform-multivertical-2026-05-12.md`.
 *
 * This file mirrors `src/lib/dms-adapters/types.ts` exactly — same shape,
 * e-commerce providers instead of DMS providers. Tenant-scoped (vs.
 * dealer-scoped) because retail tenants do not call themselves dealers.
 *
 * Reserved scope (per the strategy doc):
 *   - read_products / read_orders / read_customers / read_carts
 *   - write_product_update
 *   - write_campaign_draft (Klaviyo / Attentive marketing)
 *   - read_funnel_analytics (Shopify analytics surface)
 *   - read_ad_performance / write_ad_pause (Meta / Google Ads)
 *   - read_email_engagement (Klaviyo engagement signals)
 *
 * Capability declarations are READ-ONLY at the adapter level so the registry
 * can enforce "the tenant's Meta Ads adapter doesn't support read_products"
 * at the route layer instead of letting the call go through and 4xx at the
 * upstream platform.
 */

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export type EcommerceCapability =
  | "read_products"
  | "write_product_update"
  | "read_orders"
  | "read_customers"
  | "read_carts"
  | "write_campaign_draft"
  | "read_funnel_analytics"
  | "read_ad_performance"
  | "write_ad_pause"
  | "read_email_engagement";

export const ALL_ECOMMERCE_CAPABILITIES: ReadonlyArray<EcommerceCapability> = Object.freeze([
  "read_products",
  "write_product_update",
  "read_orders",
  "read_customers",
  "read_carts",
  "write_campaign_draft",
  "read_funnel_analytics",
  "read_ad_performance",
  "write_ad_pause",
  "read_email_engagement",
]);

// ---------------------------------------------------------------------------
// Provider enum
// ---------------------------------------------------------------------------

/**
 * Adapter-side provider slugs. Mirrors the CHECK constraint on
 * migration 082's `provider` column.
 *
 * `mock_shop` is the deterministic demo/test adapter (mirrors the `mock`
 * DMS adapter). The rest are stubs pending partner enrollment / API
 * approval — see the per-provider files for the TODO markers.
 *
 * NOTE: This is intentionally a string-literal union (not an enum) because
 * the adapter framework treats provider as a routing key, and we want to
 * be able to register new adapters without touching the type file.
 */
export type EcommerceAdapterProvider =
  | "mock_shop"
  | "shopify"
  | "bigcommerce"
  | "adobe_commerce"
  | "klaviyo"
  | "attentive"
  | "meta_ads"
  | "google_ads";

export const ALL_ECOMMERCE_ADAPTER_PROVIDERS: ReadonlyArray<EcommerceAdapterProvider> = Object.freeze([
  "mock_shop",
  "shopify",
  "bigcommerce",
  "adobe_commerce",
  "klaviyo",
  "attentive",
  "meta_ads",
  "google_ads",
]);

// ---------------------------------------------------------------------------
// Result discriminated union
// ---------------------------------------------------------------------------

/**
 * Every adapter method returns an AdapterResult. Never throw — the call
 * sites must be able to surface "Shopify unavailable" / "Meta auth expired"
 * cleanly to the UI per the graceful-degradation invariant from CLAUDE.md.
 */
export type AdapterResultError =
  | "not_supported"      // adapter does not declare this capability
  | "not_configured"     // credentials missing or revoked
  | "auth_failed"        // upstream auth rejected (rotated key, expired token)
  | "rate_limited"       // upstream 429
  | "upstream_error";    // upstream 5xx or transport failure

export type AdapterResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AdapterResultError; detail?: string };

// ---------------------------------------------------------------------------
// Canonical entity shapes returned by the adapter
// ---------------------------------------------------------------------------

/**
 * Canonical product shape the adapter returns.
 * Mirrors the merchandising surface e-commerce operators actually care
 * about — not the raw provider payload. Adapters MAY include more fields,
 * but these are the ones downstream code can rely on.
 */
export interface EcommerceProduct {
  /** External platform identifier (e.g. Shopify product GID, BigCommerce id). */
  externalId: string;
  sku: string;
  title: string;
  vendor: string | null;
  productType: string | null;
  status: "active" | "draft" | "archived" | "unknown";
  /** Per-variant or simple-product price; null if variants vary. */
  price: number | null;
  /** Total on-hand across all locations / warehouses. */
  inventoryQuantity: number | null;
  inStock: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  /** Mock-adapter flag — surfaced in UI so demo data is never confused with real data. */
  isMock?: boolean;
}

export interface EcommerceOrder {
  externalId: string;
  orderNumber: string;
  customerEmail: string | null;
  customerName: string | null;
  status: "pending" | "paid" | "fulfilled" | "refunded" | "cancelled" | "unknown";
  fulfillmentStatus: string | null;
  currency: string;
  totalPrice: number;
  itemCount: number;
  channel: string | null;
  placedAt: string; // ISO 8601
  isMock?: boolean;
}

export interface EcommerceCustomer {
  externalId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  marketingOptIn: boolean;
  totalSpent: number;
  ordersCount: number;
  tags: string[];
  createdAt: string; // ISO 8601
  isMock?: boolean;
}

/**
 * Campaign draft specification — input to `draftCampaign`. Provider adapters
 * map this to their own draft shape (Klaviyo Flow, Attentive Campaign, etc).
 */
export interface CampaignSpec {
  channel: "email" | "sms" | "push" | "ads";
  name: string;
  /** Segment identifier / tag the campaign should target. */
  segment: string;
  subject?: string;
  body: string;
  /** ISO 8601 timestamp the campaign should send, or null for "now". */
  sendAt?: string | null;
}

/**
 * Funnel metrics for a date range. The Shopify analytics surface returns
 * a similar shape; other adapters approximate. Adapter is the source of
 * truth on what is filled.
 */
export interface FunnelMetrics {
  /** ISO 8601 start of the range (inclusive). */
  from: string;
  /** ISO 8601 end of the range (exclusive). */
  to: string;
  sessions: number;
  productViews: number;
  addsToCart: number;
  checkoutsStarted: number;
  ordersPlaced: number;
  /** orders / sessions, 0-1. */
  conversionRate: number;
  revenue: number;
  currency: string;
  isMock?: boolean;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface ProductFilter {
  sku?: string;
  in_stock?: boolean;
  limit?: number;
}

export interface OrderFilter {
  status?: string;
  since?: Date;
  limit?: number;
}

export interface CustomerFilter {
  since?: Date;
  limit?: number;
}

export interface CartFilter {
  abandoned?: boolean;
  limit?: number;
}

export interface CartSnapshot {
  externalId: string;
  customerEmail: string | null;
  itemCount: number;
  subtotal: number;
  currency: string;
  abandoned: boolean;
  lastActivityAt: string; // ISO 8601
  isMock?: boolean;
}

export interface AdPerformanceFilter {
  campaignId?: string;
  since?: Date;
  limit?: number;
}

export interface AdPerformanceRow {
  campaignExternalId: string;
  campaignName: string;
  channel: "meta" | "google" | "tiktok" | "other";
  status: "active" | "paused" | "ended" | "unknown";
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  cpa: number | null;
  roas: number | null;
  currency: string;
  windowStart: string; // ISO 8601
  windowEnd: string; // ISO 8601
  isMock?: boolean;
}

export interface EmailEngagementFilter {
  since?: Date;
  limit?: number;
}

export interface EmailEngagementRow {
  campaignExternalId: string;
  campaignName: string;
  sent: number;
  delivered: number;
  opens: number;
  clicks: number;
  unsubscribes: number;
  bounces: number;
  windowStart: string; // ISO 8601
  windowEnd: string; // ISO 8601
  isMock?: boolean;
}

// ---------------------------------------------------------------------------
// Adapter status snapshot (returned by ping)
// ---------------------------------------------------------------------------

export interface AdapterPingStatus {
  healthy: boolean;
  vendor_version?: string;
}

// ---------------------------------------------------------------------------
// Registry record (the row shape returned by `listConfiguredAdapters`)
// ---------------------------------------------------------------------------

export type AdapterCredentialStatus =
  | "pending"
  | "active"
  | "failed"
  | "revoked"
  | "rotating";

export interface ConfiguredEcommerceAdapterRecord {
  id: string;
  tenantId: string;
  provider: EcommerceAdapterProvider;
  status: AdapterCredentialStatus;
  capabilitySet: EcommerceCapability[];
  lastUsedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}
