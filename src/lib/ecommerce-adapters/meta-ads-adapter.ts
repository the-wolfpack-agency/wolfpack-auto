/**
 * Meta Ads (Facebook + Instagram) adapter — STUB pending Meta Marketing
 * API app review.
 *
 * Year-2 ads-only capability set: read ad performance, pause campaigns.
 * Meta Marketing API auth uses long-lived system-user access tokens.
 *
 * Capabilities declared (ads-only — Meta is not a commerce / catalog source
 * in our use case):
 *   read_ad_performance, write_ad_pause.
 *
 * Public Meta Marketing API surface referenced:
 *   - Base:        https://graph.facebook.com/v19.0
 *   - Ad accounts: GET  /act_{ad_account_id}/campaigns
 *   - Insights:    GET  /act_{ad_account_id}/insights
 *   - Pause:       POST /{campaign_id}?status=PAUSED
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

export interface MetaAdsCredentials {
  /** System-user access token. TODO(meta-ads-credential): vault-stored. */
  accessToken: string;
  /** Meta Ad Account id (without the "act_" prefix). */
  adAccountId: string;
  /** Graph API version. */
  apiVersion?: string;
}

const META_BASE = "https://graph.facebook.com";
const DEFAULT_VERSION = "v19.0";

export class MetaAdsAdapter implements EcommerceAdapter {
  public readonly provider = "meta_ads" as const;
  public readonly capabilities: ReadonlySet<EcommerceCapability>;

  private readonly creds: MetaAdsCredentials | null;

  constructor(creds: MetaAdsCredentials | null) {
    this.creds = creds;
    this.capabilities = new Set<EcommerceCapability>([
      "read_ad_performance",
      "write_ad_pause",
    ]);
  }

  private base(): string {
    const v = this.creds?.apiVersion ?? DEFAULT_VERSION;
    return `${META_BASE}/${v}`;
  }

  async ping(): Promise<AdapterResult<AdapterPingStatus>> {
    if (!this.creds) {
      return notConfigured(
        "Meta Marketing API app review pending — see TODO(meta-ads-credential)",
      );
    }
    // TODO(meta-ads-credential): GET ${base}/me?access_token=...
    void this.base();
    return notConfigured(
      "Meta Ads ping not yet wired — see TODO(meta-ads-credential)",
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
        "Meta Marketing API app review pending — see TODO(meta-ads-credential)",
      );
    }
    // TODO(meta-ads-credential):
    // GET ${base}/act_${adAccountId}/insights?fields=campaign_id,campaign_name,impressions,clicks,spend,actions,cpa,purchase_roas&time_range={since,until}
    // Followed by GET ${base}/act_${adAccountId}/campaigns?fields=status to fill in status.
    void filter;
    return notConfigured(
      "Meta Ads readAdPerformance not yet wired — see TODO(meta-ads-credential)",
    );
  }

  async pauseAd(campaignExternalId: string): Promise<AdapterResult<void>> {
    if (!this.creds) {
      return notConfigured(
        "Meta Marketing API app review pending — see TODO(meta-ads-credential)",
      );
    }
    // TODO(meta-ads-credential): POST ${base}/${campaignExternalId}?status=PAUSED&access_token=...
    void campaignExternalId;
    return notConfigured(
      "Meta Ads pauseAd not yet wired — see TODO(meta-ads-credential)",
    );
  }

  async readEmailEngagement(
    filter?: EmailEngagementFilter,
  ): Promise<AdapterResult<EmailEngagementRow[]>> {
    void filter;
    return notSupported("read_email_engagement");
  }
}

export function createMetaAdsAdapter(creds: MetaAdsCredentials | null): MetaAdsAdapter {
  return new MetaAdsAdapter(creds);
}
