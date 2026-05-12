/**
 * Klaviyo adapter — STUB pending Klaviyo Private App enrollment.
 *
 * Email-marketing specialist. Year-2 retail-marketing capability set:
 * customer segments, campaign drafts, email engagement analytics. Klaviyo
 * Private App auth uses the "Klaviyo-API-Key" header with a `pk_` token.
 *
 * Capabilities declared (email-only — Klaviyo does not own products/orders):
 *   read_customers, write_campaign_draft, read_email_engagement.
 *
 * Public Klaviyo API surface referenced:
 *   - Base:        https://a.klaviyo.com/api
 *   - Profiles:    GET  /profiles
 *   - Campaigns:   POST /campaigns (draft)
 *   - Metrics:     GET  /metric-aggregates (open/click rates)
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

export interface KlaviyoCredentials {
  /** Klaviyo Private API key, format "pk_xxxxx". TODO(klaviyo-credential): vault-stored. */
  privateKey: string;
  /** Klaviyo API revision header, e.g. "2026-04-15". */
  apiRevision?: string;
}

const KLAVIYO_BASE = "https://a.klaviyo.com/api";
const DEFAULT_REVISION = "2026-04-15";

export class KlaviyoAdapter implements EcommerceAdapter {
  public readonly provider = "klaviyo" as const;
  public readonly capabilities: ReadonlySet<EcommerceCapability>;

  private readonly creds: KlaviyoCredentials | null;

  constructor(creds: KlaviyoCredentials | null) {
    this.creds = creds;
    this.capabilities = new Set<EcommerceCapability>([
      "read_customers",
      "write_campaign_draft",
      "read_email_engagement",
    ]);
  }

  async ping(): Promise<AdapterResult<AdapterPingStatus>> {
    if (!this.creds) {
      return notConfigured(
        "Klaviyo Private App enrollment pending — see TODO(klaviyo-credential)",
      );
    }
    // TODO(klaviyo-credential): GET ${KLAVIYO_BASE}/accounts/
    // Headers: { "Authorization": `Klaviyo-API-Key ${privateKey}`, "revision": revision }
    void KLAVIYO_BASE;
    void DEFAULT_REVISION;
    return notConfigured(
      "Klaviyo ping not yet wired — see TODO(klaviyo-credential)",
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
    if (!this.creds) {
      return notConfigured(
        "Klaviyo Private App enrollment pending — see TODO(klaviyo-credential)",
      );
    }
    // TODO(klaviyo-credential): GET ${KLAVIYO_BASE}/profiles
    // Map { data[].attributes.{email,first_name,last_name,properties,...} } → EcommerceCustomer.
    void filter;
    return notConfigured(
      "Klaviyo listCustomers not yet wired — see TODO(klaviyo-credential)",
    );
  }

  async listCarts(filter?: CartFilter): Promise<AdapterResult<CartSnapshot[]>> {
    void filter;
    return notSupported("read_carts");
  }

  async draftCampaign(spec: CampaignSpec): Promise<AdapterResult<{ draft_id: string }>> {
    if (!this.creds) {
      return notConfigured(
        "Klaviyo Private App enrollment pending — see TODO(klaviyo-credential)",
      );
    }
    // TODO(klaviyo-credential): POST ${KLAVIYO_BASE}/campaigns
    // Body: { data: { type: "campaign", attributes: {
    //   name, audiences: { included: [segment_id] },
    //   send_strategy: { method: "static", datetime: sendAt },
    //   campaign-messages: { data: [{ type: "campaign-message", attributes: {
    //     definition: { channel: "email", label: name, content: { subject, body } }
    //   }}]}
    // }}}
    void spec;
    return notConfigured(
      "Klaviyo draftCampaign not yet wired — see TODO(klaviyo-credential)",
    );
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
    if (!this.creds) {
      return notConfigured(
        "Klaviyo Private App enrollment pending — see TODO(klaviyo-credential)",
      );
    }
    // TODO(klaviyo-credential): POST ${KLAVIYO_BASE}/metric-aggregates
    // Body: { data: { type: "metric-aggregate", attributes: {
    //   metric_id, measurements: ["count"], interval: "week", filter: ["greater-or-equal(datetime, :since)"]
    // }}}
    // Issue one call each for "Received Email", "Opened Email", "Clicked Email",
    // "Unsubscribed", "Bounced" and zip into EmailEngagementRow[].
    void filter;
    return notConfigured(
      "Klaviyo readEmailEngagement not yet wired — see TODO(klaviyo-credential)",
    );
  }
}

export function createKlaviyoAdapter(creds: KlaviyoCredentials | null): KlaviyoAdapter {
  return new KlaviyoAdapter(creds);
}
