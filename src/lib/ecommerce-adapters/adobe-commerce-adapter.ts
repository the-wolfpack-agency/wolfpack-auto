/**
 * Adobe Commerce (formerly Magento) adapter — STUB pending integration
 * approval. Adobe Commerce Web API surface uses OAuth1 (admin) or bearer
 * tokens issued from admin-token endpoints. Year-2 enterprise retail
 * target.
 *
 * Capabilities declared (read-only year-2 scope — write APIs require a
 * higher-tier agreement and complex token lifecycle):
 *   read_products, read_orders, read_customers.
 *
 * Public Adobe Commerce surface referenced:
 *   - Admin token: POST {baseUrl}/rest/V1/integration/admin/token
 *   - Products:    GET  {baseUrl}/rest/V1/products
 *   - Orders:      GET  {baseUrl}/rest/V1/orders
 *   - Customers:   GET  {baseUrl}/rest/V1/customers/search
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

export interface AdobeCommerceCredentials {
  /** Base URL of the Commerce instance, e.g. "https://shop.example.com". */
  baseUrl: string;
  /** Admin bearer token (issued by admin/token endpoint). TODO(adobe-commerce-credential): vault-stored. */
  adminBearerToken: string;
}

export class AdobeCommerceAdapter implements EcommerceAdapter {
  public readonly provider = "adobe_commerce" as const;
  public readonly capabilities: ReadonlySet<EcommerceCapability>;

  private readonly creds: AdobeCommerceCredentials | null;

  constructor(creds: AdobeCommerceCredentials | null) {
    this.creds = creds;
    this.capabilities = new Set<EcommerceCapability>([
      "read_products",
      "read_orders",
      "read_customers",
    ]);
  }

  async ping(): Promise<AdapterResult<AdapterPingStatus>> {
    if (!this.creds) {
      return notConfigured(
        "Adobe Commerce integration pending — see TODO(adobe-commerce-credential)",
      );
    }
    // TODO(adobe-commerce-credential): GET ${baseUrl}/rest/V1/store/storeConfigs
    // Headers: { Authorization: `Bearer ${adminBearerToken}` }
    return notConfigured(
      "Adobe Commerce ping not yet wired — see TODO(adobe-commerce-credential)",
    );
  }

  async listProducts(filter?: ProductFilter): Promise<AdapterResult<EcommerceProduct[]>> {
    if (!this.creds) {
      return notConfigured(
        "Adobe Commerce integration pending — see TODO(adobe-commerce-credential)",
      );
    }
    // TODO(adobe-commerce-credential): GET ${baseUrl}/rest/V1/products
    // Query: { "searchCriteria[pageSize]": limit, "searchCriteria[filterGroups][0][filters][0][field]": "sku", ... }
    // Map { id, sku, name, status, price, extension_attributes.stock_item.qty }
    // → EcommerceProduct.
    void filter;
    return notConfigured(
      "Adobe Commerce listProducts not yet wired — see TODO(adobe-commerce-credential)",
    );
  }

  async updateProduct(
    externalId: string,
    patch: Partial<Pick<EcommerceProduct, "title" | "price" | "status" | "inventoryQuantity">>,
  ): Promise<AdapterResult<void>> {
    void externalId;
    void patch;
    return notSupported("write_product_update");
  }

  async listOrders(filter?: OrderFilter): Promise<AdapterResult<EcommerceOrder[]>> {
    if (!this.creds) {
      return notConfigured(
        "Adobe Commerce integration pending — see TODO(adobe-commerce-credential)",
      );
    }
    // TODO(adobe-commerce-credential): GET ${baseUrl}/rest/V1/orders
    void filter;
    return notConfigured(
      "Adobe Commerce listOrders not yet wired — see TODO(adobe-commerce-credential)",
    );
  }

  async listCustomers(filter?: CustomerFilter): Promise<AdapterResult<EcommerceCustomer[]>> {
    if (!this.creds) {
      return notConfigured(
        "Adobe Commerce integration pending — see TODO(adobe-commerce-credential)",
      );
    }
    // TODO(adobe-commerce-credential): GET ${baseUrl}/rest/V1/customers/search
    void filter;
    return notConfigured(
      "Adobe Commerce listCustomers not yet wired — see TODO(adobe-commerce-credential)",
    );
  }

  async listCarts(filter?: CartFilter): Promise<AdapterResult<CartSnapshot[]>> {
    void filter;
    return notSupported("read_carts");
  }

  async draftCampaign(spec: CampaignSpec): Promise<AdapterResult<{ draft_id: string }>> {
    void spec;
    return notSupported("write_campaign_draft");
  }

  async readFunnelAnalytics(
    range: { from: Date; to: Date },
  ): Promise<AdapterResult<FunnelMetrics>> {
    void range;
    return notSupported("read_funnel_analytics");
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

export function createAdobeCommerceAdapter(
  creds: AdobeCommerceCredentials | null,
): AdobeCommerceAdapter {
  return new AdobeCommerceAdapter(creds);
}
