/**
 * E-commerce adapter contract.
 *
 * Every adapter (mock_shop, Shopify, BigCommerce, Adobe Commerce, Klaviyo,
 * Attentive, Meta Ads, Google Ads) implements this interface. Year-2 retail
 * vertical foundation per
 * `docs/wolfpack-platform-multivertical-2026-05-12.md`.
 *
 * Mirrors `src/lib/dms-adapters/adapter-interface.ts` exactly — same shape,
 * e-commerce providers instead of DMS providers.
 *
 * The contract is intentionally narrow — only the operations the multi-
 * vertical overlay needs in year two. Shopify covers most capabilities;
 * Klaviyo / Attentive cover marketing capabilities only; Meta Ads / Google
 * Ads cover ads-only. Capability sets are declared per-adapter so the
 * registry can short-circuit `not_supported` responses before the upstream
 * call.
 *
 * Adapter authors MUST:
 *   - Return `AdapterResult<T>` from every method (never throw on auth,
 *     rate limit, or upstream-5xx — those are routine and the call site
 *     must be able to surface them cleanly to the UI).
 *   - Declare a capability set so the registry can short-circuit
 *     "not_supported" responses before the upstream call.
 *   - Be safe to instantiate without credentials (e.g. for `ping()`
 *     attempts during the tenant-admin connect-platform wizard).
 *
 * Adapter authors MAY throw on programmer errors (bad args, schema drift,
 * etc.) — those are bugs and should be loud.
 */

import type {
  AdapterPingStatus,
  AdapterResult,
  AdPerformanceFilter,
  AdPerformanceRow,
  CampaignSpec,
  CartFilter,
  CartSnapshot,
  CustomerFilter,
  EcommerceAdapterProvider,
  EcommerceCapability,
  EcommerceCustomer,
  EcommerceOrder,
  EcommerceProduct,
  EmailEngagementFilter,
  EmailEngagementRow,
  FunnelMetrics,
  OrderFilter,
  ProductFilter,
} from "./types";

export interface EcommerceAdapter {
  /** Provider slug — matches the migration 082 CHECK constraint. */
  readonly provider: EcommerceAdapterProvider;

  /** Static set of capabilities this adapter actually implements. */
  readonly capabilities: ReadonlySet<EcommerceCapability>;

  /** Test the configured credentials work. Returns adapter status. */
  ping(): Promise<AdapterResult<AdapterPingStatus>>;

  // Catalog ---------------------------------------------------------------
  listProducts(filter?: ProductFilter): Promise<AdapterResult<EcommerceProduct[]>>;
  updateProduct(
    externalId: string,
    patch: Partial<Pick<EcommerceProduct, "title" | "price" | "status" | "inventoryQuantity">>,
  ): Promise<AdapterResult<void>>;

  // Orders ----------------------------------------------------------------
  listOrders(filter?: OrderFilter): Promise<AdapterResult<EcommerceOrder[]>>;

  // Customers -------------------------------------------------------------
  listCustomers(filter?: CustomerFilter): Promise<AdapterResult<EcommerceCustomer[]>>;

  // Carts -----------------------------------------------------------------
  listCarts(filter?: CartFilter): Promise<AdapterResult<CartSnapshot[]>>;

  // Marketing -------------------------------------------------------------
  draftCampaign(spec: CampaignSpec): Promise<AdapterResult<{ draft_id: string }>>;

  // Analytics -------------------------------------------------------------
  readFunnelAnalytics(range: { from: Date; to: Date }): Promise<AdapterResult<FunnelMetrics>>;

  // Advertising -----------------------------------------------------------
  readAdPerformance(
    filter?: AdPerformanceFilter,
  ): Promise<AdapterResult<AdPerformanceRow[]>>;
  pauseAd(campaignExternalId: string): Promise<AdapterResult<void>>;

  // Email engagement ------------------------------------------------------
  readEmailEngagement(
    filter?: EmailEngagementFilter,
  ): Promise<AdapterResult<EmailEngagementRow[]>>;
}

// ---------------------------------------------------------------------------
// Helpers — every adapter shares these
// ---------------------------------------------------------------------------

/**
 * Build a `not_supported` result when the adapter's capability set lacks
 * the requested operation. Centralised here so every adapter speaks the
 * same error shape.
 */
export function notSupported<T>(capability: EcommerceCapability): AdapterResult<T> {
  return {
    ok: false,
    error: "not_supported",
    detail: `Adapter does not declare capability: ${capability}`,
  };
}

/**
 * Build a `not_configured` result when the adapter is missing credentials
 * or a stub is in place pending partner enrollment.
 */
export function notConfigured<T>(detail: string): AdapterResult<T> {
  return { ok: false, error: "not_configured", detail };
}

/**
 * Build an `upstream_error` result. Use when the platform responds with
 * 5xx, times out, or returns an unexpected schema.
 */
export function upstreamError<T>(detail: string): AdapterResult<T> {
  return { ok: false, error: "upstream_error", detail };
}
