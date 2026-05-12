/**
 * BigCommerce adapter — STUB pending BigCommerce App Marketplace enrollment.
 *
 * BigCommerce v3 REST API + v2 legacy endpoints. Auth via X-Auth-Token
 * header from a store-installed app.
 *
 * Capabilities declared (no ads, no campaign drafting, no analytics — those
 * are not first-class on BigCommerce):
 *   read_products, write_product_update, read_orders, read_customers.
 *
 * Public BigCommerce API surface referenced:
 *   - v3 Catalog:   https://api.bigcommerce.com/stores/{hash}/v3/catalog/products
 *   - v2 Orders:    https://api.bigcommerce.com/stores/{hash}/v2/orders
 *   - v3 Customers: https://api.bigcommerce.com/stores/{hash}/v3/customers
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

export interface BigCommerceCredentials {
  /** BigCommerce store hash, e.g. "abc123". */
  storeHash: string;
  /** X-Auth-Token from the installed app. TODO(bigcommerce-credential): vault-stored. */
  authToken: string;
  /** X-Auth-Client (app id). TODO(bigcommerce-credential): vault-stored. */
  clientId: string;
}

const BC_BASE = "https://api.bigcommerce.com/stores";

export class BigCommerceAdapter implements EcommerceAdapter {
  public readonly provider = "bigcommerce" as const;
  public readonly capabilities: ReadonlySet<EcommerceCapability>;

  private readonly creds: BigCommerceCredentials | null;

  constructor(creds: BigCommerceCredentials | null) {
    this.creds = creds;
    this.capabilities = new Set<EcommerceCapability>([
      "read_products",
      "write_product_update",
      "read_orders",
      "read_customers",
    ]);
  }

  private base(): string {
    return `${BC_BASE}/${this.creds?.storeHash ?? "example"}`;
  }

  async ping(): Promise<AdapterResult<AdapterPingStatus>> {
    if (!this.creds) {
      return notConfigured(
        "BigCommerce app enrollment pending — see TODO(bigcommerce-credential)",
      );
    }
    // TODO(bigcommerce-credential): GET ${base}/v2/store.json with
    //   X-Auth-Token, X-Auth-Client, Accept: application/json.
    void this.base();
    return notConfigured(
      "BigCommerce ping not yet wired — see TODO(bigcommerce-credential)",
    );
  }

  async listProducts(filter?: ProductFilter): Promise<AdapterResult<EcommerceProduct[]>> {
    if (!this.creds) {
      return notConfigured(
        "BigCommerce app enrollment pending — see TODO(bigcommerce-credential)",
      );
    }
    // TODO(bigcommerce-credential): GET ${base}/v3/catalog/products
    // Query: { limit, sku, include_fields: "name,sku,price,inventory_level,is_visible" }
    // Map { id, sku, name, brand_id (lookup), type, is_visible (→ active/draft),
    //       price, inventory_level } → EcommerceProduct.
    void filter;
    return notConfigured(
      "BigCommerce listProducts not yet wired — see TODO(bigcommerce-credential)",
    );
  }

  async updateProduct(
    externalId: string,
    patch: Partial<Pick<EcommerceProduct, "title" | "price" | "status" | "inventoryQuantity">>,
  ): Promise<AdapterResult<void>> {
    if (!this.creds) {
      return notConfigured(
        "BigCommerce app enrollment pending — see TODO(bigcommerce-credential)",
      );
    }
    // TODO(bigcommerce-credential): PUT ${base}/v3/catalog/products/${externalId}
    // Body: { name, price, inventory_level, is_visible }
    void externalId;
    void patch;
    return notConfigured(
      "BigCommerce updateProduct not yet wired — see TODO(bigcommerce-credential)",
    );
  }

  async listOrders(filter?: OrderFilter): Promise<AdapterResult<EcommerceOrder[]>> {
    if (!this.creds) {
      return notConfigured(
        "BigCommerce app enrollment pending — see TODO(bigcommerce-credential)",
      );
    }
    // TODO(bigcommerce-credential): GET ${base}/v2/orders
    // Query: { limit, status_id, min_date_created (ISO) }
    void filter;
    return notConfigured(
      "BigCommerce listOrders not yet wired — see TODO(bigcommerce-credential)",
    );
  }

  async listCustomers(filter?: CustomerFilter): Promise<AdapterResult<EcommerceCustomer[]>> {
    if (!this.creds) {
      return notConfigured(
        "BigCommerce app enrollment pending — see TODO(bigcommerce-credential)",
      );
    }
    // TODO(bigcommerce-credential): GET ${base}/v3/customers
    // Query: { limit, date_created:min, include: "addresses,formfields" }
    void filter;
    return notConfigured(
      "BigCommerce listCustomers not yet wired — see TODO(bigcommerce-credential)",
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

export function createBigCommerceAdapter(
  creds: BigCommerceCredentials | null,
): BigCommerceAdapter {
  return new BigCommerceAdapter(creds);
}
