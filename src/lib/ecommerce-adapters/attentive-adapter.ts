/**
 * Attentive adapter — STUB pending Attentive Partner enrollment.
 *
 * SMS marketing specialist. Year-2 retail-marketing capability set:
 * subscriber list / campaign draft. Auth uses bearer tokens issued from
 * the Attentive App.
 *
 * Capabilities declared (SMS-only):
 *   read_customers, write_campaign_draft.
 *
 * Public Attentive API surface referenced:
 *   - Base:         https://api.attentivemobile.com/v1
 *   - Subscribers:  GET  /subscribers
 *   - Campaigns:    POST /campaigns (draft)
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

export interface AttentiveCredentials {
  /** Attentive App API token. TODO(attentive-credential): vault-stored. */
  apiToken: string;
}

const ATTENTIVE_BASE = "https://api.attentivemobile.com/v1";

export class AttentiveAdapter implements EcommerceAdapter {
  public readonly provider = "attentive" as const;
  public readonly capabilities: ReadonlySet<EcommerceCapability>;

  private readonly creds: AttentiveCredentials | null;

  constructor(creds: AttentiveCredentials | null) {
    this.creds = creds;
    this.capabilities = new Set<EcommerceCapability>([
      "read_customers",
      "write_campaign_draft",
    ]);
  }

  async ping(): Promise<AdapterResult<AdapterPingStatus>> {
    if (!this.creds) {
      return notConfigured(
        "Attentive Partner enrollment pending — see TODO(attentive-credential)",
      );
    }
    // TODO(attentive-credential): GET ${ATTENTIVE_BASE}/me
    // Headers: { Authorization: `Bearer ${apiToken}` }
    void ATTENTIVE_BASE;
    return notConfigured(
      "Attentive ping not yet wired — see TODO(attentive-credential)",
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
        "Attentive Partner enrollment pending — see TODO(attentive-credential)",
      );
    }
    // TODO(attentive-credential): GET ${ATTENTIVE_BASE}/subscriptions
    // Map { phone, email, externalIdentifiers, subscriptionType, ... } → EcommerceCustomer.
    void filter;
    return notConfigured(
      "Attentive listCustomers not yet wired — see TODO(attentive-credential)",
    );
  }

  async listCarts(filter?: CartFilter): Promise<AdapterResult<CartSnapshot[]>> {
    void filter;
    return notSupported("read_carts");
  }

  async draftCampaign(spec: CampaignSpec): Promise<AdapterResult<{ draft_id: string }>> {
    if (!this.creds) {
      return notConfigured(
        "Attentive Partner enrollment pending — see TODO(attentive-credential)",
      );
    }
    if (spec.channel !== "sms" && spec.channel !== "email") {
      return notSupported("write_campaign_draft");
    }
    // TODO(attentive-credential): POST ${ATTENTIVE_BASE}/campaigns
    // Body: { name, segmentId: spec.segment, content: { body: spec.body }, scheduledAt: spec.sendAt }
    return notConfigured(
      "Attentive draftCampaign not yet wired — see TODO(attentive-credential)",
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
    void filter;
    return notSupported("read_email_engagement");
  }
}

export function createAttentiveAdapter(creds: AttentiveCredentials | null): AttentiveAdapter {
  return new AttentiveAdapter(creds);
}
