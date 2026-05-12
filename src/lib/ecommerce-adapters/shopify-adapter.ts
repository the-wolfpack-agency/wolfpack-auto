/**
 * Shopify adapter — STUB pending Shopify Partner App enrollment.
 *
 * Year-2 first-target adapter for the retail vertical (mirrors Cox/vAuto's
 * role in the DMS framework). Shopify has the most accessible APIs of the
 * major e-commerce platforms — Admin GraphQL API + Admin REST API both
 * documented at https://shopify.dev/docs/api/admin.
 *
 * Until the Wolfpack Assistant Platform's Shopify Partner App is approved,
 * every method returns `not_configured`. The TODO(shopify-credential)
 * markers below show the actual API shape from public docs so the swap-in
 * is mechanical when the credential arrives.
 *
 * Capabilities declared (full coverage — Shopify is the everything-platform):
 *   read_products, write_product_update, read_orders, read_customers,
 *   read_carts, read_funnel_analytics.
 *
 * Public Shopify API surface referenced:
 *   - Admin GraphQL:  https://{shop}.myshopify.com/admin/api/2026-04/graphql.json
 *   - Products REST:  https://{shop}.myshopify.com/admin/api/2026-04/products.json
 *   - Orders REST:    https://{shop}.myshopify.com/admin/api/2026-04/orders.json
 *   - Customers REST: https://{shop}.myshopify.com/admin/api/2026-04/customers.json
 *   - Checkouts REST: https://{shop}.myshopify.com/admin/api/2026-04/checkouts.json
 *   - ShopifyQL (analytics): Admin GraphQL `shopifyqlQuery`
 */

import type { EcommerceAdapter } from "./adapter-interface";
import { notConfigured, notSupported } from "./adapter-interface";
import type {
  AdapterPingStatus,
  AdapterResult,
  AdPerformanceFilter,
  AdPerformanceRow,
  CampaignSpec,
  CartFilter,
  CartSnapshot,
  CustomerFilter,
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

// ---------------------------------------------------------------------------
// Credential shape (post-enrollment)
// ---------------------------------------------------------------------------

export interface ShopifyCredentials {
  /** Shopify Admin API access token (offline). TODO(shopify-credential): vault-stored. */
  adminAccessToken: string;
  /** Shop domain, e.g. "acme-apparel.myshopify.com". */
  shopDomain: string;
  /** Admin API version, e.g. "2026-04". */
  apiVersion?: string;
}

const DEFAULT_API_VERSION = "2026-04";

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class ShopifyAdapter implements EcommerceAdapter {
  public readonly provider = "shopify" as const;
  public readonly capabilities: ReadonlySet<EcommerceCapability>;

  private readonly creds: ShopifyCredentials | null;

  constructor(creds: ShopifyCredentials | null) {
    this.creds = creds;
    // Shopify covers the everything-platform set. Marketing capabilities
    // (campaign drafting, email engagement) intentionally OMITTED — those
    // live in Klaviyo / Attentive adapters. Same for ads (Meta / Google).
    this.capabilities = new Set<EcommerceCapability>([
      "read_products",
      "write_product_update",
      "read_orders",
      "read_customers",
      "read_carts",
      "read_funnel_analytics",
    ]);
  }

  private baseUrl(): string {
    const v = this.creds?.apiVersion ?? DEFAULT_API_VERSION;
    return `https://${this.creds?.shopDomain ?? "example"}.myshopify.com/admin/api/${v}`;
  }

  async ping(): Promise<AdapterResult<AdapterPingStatus>> {
    if (!this.creds) {
      return notConfigured(
        "Shopify Partner App enrollment pending — see TODO(shopify-credential)",
      );
    }
    // TODO(shopify-credential): GET ${baseUrl}/shop.json with
    //   X-Shopify-Access-Token: this.creds.adminAccessToken
    // Returns { shop: { name, plan_name, ... } } on success.
    void this.baseUrl();
    return notConfigured(
      "Shopify ping not yet wired — see TODO(shopify-credential)",
    );
  }

  async listProducts(filter?: ProductFilter): Promise<AdapterResult<EcommerceProduct[]>> {
    if (!this.creds) {
      return notConfigured(
        "Shopify Partner App enrollment pending — see TODO(shopify-credential)",
      );
    }
    // TODO(shopify-credential): GET ${baseUrl}/products.json
    // Headers: { "X-Shopify-Access-Token": adminAccessToken }
    // Query: { limit, fields: "id,title,vendor,product_type,status,variants", ... }
    // Map { id, title, variants[0].sku, variants[0].price, variants[0].inventory_quantity, ... }
    // → EcommerceProduct.
    void filter;
    return notConfigured(
      "Shopify listProducts not yet wired — see TODO(shopify-credential)",
    );
  }

  async updateProduct(
    externalId: string,
    patch: Partial<Pick<EcommerceProduct, "title" | "price" | "status" | "inventoryQuantity">>,
  ): Promise<AdapterResult<void>> {
    if (!this.creds) {
      return notConfigured(
        "Shopify Partner App enrollment pending — see TODO(shopify-credential)",
      );
    }
    // TODO(shopify-credential): PUT ${baseUrl}/products/${externalId}.json
    // Body: { product: { title, status, variants: [{ price, inventory_quantity }] } }
    // Inventory quantity requires the inventory_levels endpoint — see
    // https://shopify.dev/docs/api/admin-rest/2026-04/resources/inventorylevel
    void externalId;
    void patch;
    return notConfigured(
      "Shopify updateProduct not yet wired — see TODO(shopify-credential)",
    );
  }

  async listOrders(filter?: OrderFilter): Promise<AdapterResult<EcommerceOrder[]>> {
    if (!this.creds) {
      return notConfigured(
        "Shopify Partner App enrollment pending — see TODO(shopify-credential)",
      );
    }
    // TODO(shopify-credential): GET ${baseUrl}/orders.json
    // Query: { status: "any" | "open" | "closed" | "cancelled", limit, created_at_min }
    // Map { id, name, email, customer.first_name + last_name, financial_status,
    //       fulfillment_status, total_price, line_items.length, source_name, created_at }
    // → EcommerceOrder. financial_status maps to our `status` enum
    // (pending|paid|fulfilled|refunded|cancelled).
    void filter;
    return notConfigured(
      "Shopify listOrders not yet wired — see TODO(shopify-credential)",
    );
  }

  async listCustomers(filter?: CustomerFilter): Promise<AdapterResult<EcommerceCustomer[]>> {
    if (!this.creds) {
      return notConfigured(
        "Shopify Partner App enrollment pending — see TODO(shopify-credential)",
      );
    }
    // TODO(shopify-credential): GET ${baseUrl}/customers.json
    // Query: { limit, created_at_min, fields: "id,email,first_name,last_name,accepts_marketing,total_spent,orders_count,tags,created_at" }
    void filter;
    return notConfigured(
      "Shopify listCustomers not yet wired — see TODO(shopify-credential)",
    );
  }

  async listCarts(filter?: CartFilter): Promise<AdapterResult<CartSnapshot[]>> {
    if (!this.creds) {
      return notConfigured(
        "Shopify Partner App enrollment pending — see TODO(shopify-credential)",
      );
    }
    // TODO(shopify-credential): GET ${baseUrl}/checkouts.json
    // Query: { status: "open", limit } — Shopify's abandoned-checkout endpoint.
    // Map { id, customer.email, line_items.length, subtotal_price, completed_at, updated_at }
    // → CartSnapshot. abandoned = (completed_at is null && updated_at > 1h ago).
    void filter;
    return notConfigured(
      "Shopify listCarts not yet wired — see TODO(shopify-credential)",
    );
  }

  async draftCampaign(spec: CampaignSpec): Promise<AdapterResult<{ draft_id: string }>> {
    // Shopify Email is a separate product surface and not in the year-2
    // scope. Marketing draft capability lives in Klaviyo / Attentive.
    void spec;
    return notSupported("write_campaign_draft");
  }

  async readFunnelAnalytics(
    range: { from: Date; to: Date },
  ): Promise<AdapterResult<FunnelMetrics>> {
    if (!this.creds) {
      return notConfigured(
        "Shopify Partner App enrollment pending — see TODO(shopify-credential)",
      );
    }
    // TODO(shopify-credential): POST ${baseUrl}/graphql.json with ShopifyQL query
    //   `FROM sales SHOW total_sales, orders, gross_sales SINCE :from UNTIL :to`
    // Plus a parallel query for sessions/conversion against the Shopify
    // Analytics report endpoints.
    void range;
    return notConfigured(
      "Shopify readFunnelAnalytics not yet wired — see TODO(shopify-credential)",
    );
  }

  async readAdPerformance(
    filter?: AdPerformanceFilter,
  ): Promise<AdapterResult<AdPerformanceRow[]>> {
    void filter;
    return notSupported("read_ad_performance");
  }

  async pauseAd(campaignExternalId: string): Promise<AdapterResult<void>> {
    void campaignExternalId;
    return notSupported("write_ad_pause");
  }

  async readEmailEngagement(
    filter?: EmailEngagementFilter,
  ): Promise<AdapterResult<EmailEngagementRow[]>> {
    void filter;
    return notSupported("read_email_engagement");
  }
}

/** Factory used by the registry. Returns a stub when no creds are supplied. */
export function createShopifyAdapter(creds: ShopifyCredentials | null): ShopifyAdapter {
  return new ShopifyAdapter(creds);
}
