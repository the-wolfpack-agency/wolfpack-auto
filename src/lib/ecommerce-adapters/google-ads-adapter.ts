/**
 * Google Ads adapter — STUB pending Google Ads API approval.
 *
 * Year-2 ads-only capability set: read ad performance, pause campaigns.
 * Google Ads API auth uses OAuth 2 refresh-token flow + developer token +
 * login_customer_id (manager account) headers.
 *
 * Capabilities declared (ads-only):
 *   read_ad_performance, write_ad_pause.
 *
 * Public Google Ads API surface referenced:
 *   - Base:    https://googleads.googleapis.com/v16
 *   - Query:   POST /customers/{customer_id}/googleAds:search (GAQL)
 *   - Mutate:  POST /customers/{customer_id}/campaigns:mutate
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

export interface GoogleAdsCredentials {
  /** Developer token from Google Ads API Center. TODO(google-ads-credential): vault-stored. */
  developerToken: string;
  /** OAuth refresh token. TODO(google-ads-credential): vault-stored. */
  refreshToken: string;
  /** Manager account id (MCC), no dashes. */
  loginCustomerId: string;
  /** Target customer id (the advertiser account). */
  customerId: string;
  /** OAuth client id (Google Cloud Console). */
  clientId: string;
  /** OAuth client secret. TODO(google-ads-credential): vault-stored. */
  clientSecret: string;
}

const GOOGLE_ADS_BASE = "https://googleads.googleapis.com/v16";

export class GoogleAdsAdapter implements EcommerceAdapter {
  public readonly provider = "google_ads" as const;
  public readonly capabilities: ReadonlySet<EcommerceCapability>;

  private readonly creds: GoogleAdsCredentials | null;

  constructor(creds: GoogleAdsCredentials | null) {
    this.creds = creds;
    this.capabilities = new Set<EcommerceCapability>([
      "read_ad_performance",
      "write_ad_pause",
    ]);
  }

  async ping(): Promise<AdapterResult<AdapterPingStatus>> {
    if (!this.creds) {
      return notConfigured(
        "Google Ads API approval pending — see TODO(google-ads-credential)",
      );
    }
    // TODO(google-ads-credential): exchange refresh_token → bearer access_token
    // via POST https://oauth2.googleapis.com/token, then GET
    // ${GOOGLE_ADS_BASE}/customers/${customerId}/googleAds:search with a trivial
    // GAQL query like "SELECT customer.id FROM customer LIMIT 1".
    void GOOGLE_ADS_BASE;
    return notConfigured(
      "Google Ads ping not yet wired — see TODO(google-ads-credential)",
    );
  }

  async listProducts(filter?: ProductFilter): Promise<AdapterResult<EcommerceProduct[]>> {
    void filter;
    return notSupported("read_products");
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
    void filter;
    return notSupported("read_orders");
  }

  async listCustomers(filter?: CustomerFilter): Promise<AdapterResult<EcommerceCustomer[]>> {
    void filter;
    return notSupported("read_customers");
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
    if (!this.creds) {
      return notConfigured(
        "Google Ads API approval pending — see TODO(google-ads-credential)",
      );
    }
    // TODO(google-ads-credential): POST ${GOOGLE_ADS_BASE}/customers/${customerId}/googleAds:search
    // Headers: { Authorization: `Bearer ${access_token}`, "developer-token": developerToken, "login-customer-id": loginCustomerId }
    // GAQL: SELECT campaign.id, campaign.name, campaign.status, metrics.impressions,
    //              metrics.clicks, metrics.cost_micros, metrics.conversions,
    //              metrics.cost_per_conversion, metrics.value_per_conversion
    //       FROM campaign WHERE segments.date BETWEEN :from AND :to
    void filter;
    return notConfigured(
      "Google Ads readAdPerformance not yet wired — see TODO(google-ads-credential)",
    );
  }

  async pauseAd(campaignExternalId: string): Promise<AdapterResult<void>> {
    if (!this.creds) {
      return notConfigured(
        "Google Ads API approval pending — see TODO(google-ads-credential)",
      );
    }
    // TODO(google-ads-credential): POST ${GOOGLE_ADS_BASE}/customers/${customerId}/campaigns:mutate
    // Body: { operations: [{ update: { resourceName: `customers/${customerId}/campaigns/${campaignExternalId}`, status: "PAUSED" }, updateMask: "status" }] }
    void campaignExternalId;
    return notConfigured(
      "Google Ads pauseAd not yet wired — see TODO(google-ads-credential)",
    );
  }

  async readEmailEngagement(
    filter?: EmailEngagementFilter,
  ): Promise<AdapterResult<EmailEngagementRow[]>> {
    void filter;
    return notSupported("read_email_engagement");
  }
}

export function createGoogleAdsAdapter(creds: GoogleAdsCredentials | null): GoogleAdsAdapter {
  return new GoogleAdsAdapter(creds);
}
