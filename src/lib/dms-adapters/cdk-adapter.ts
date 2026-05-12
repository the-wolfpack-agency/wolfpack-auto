/**
 * CDK Global adapter — STUB pending enterprise partnership (year-two target).
 *
 * CDK has the most restrictive APIs of the major DMS vendors. Per the
 * strategy doc, browser-automation fallback may be required if API access
 * is not granted by Q3. Either way the adapter surface is the same — the
 * fallback is hidden behind the adapter boundary.
 *
 * Capabilities declared (read-only): read_inventory, read_leads, read_deals.
 * Write capabilities will be added when the partnership unlocks them.
 */

import type { DMSAdapter } from "./adapter-interface";
import { notConfigured, notSupported } from "./adapter-interface";
import type {
  AdapterCapability,
  AdapterPingStatus,
  AdapterResult,
  DealFilter,
  DMSDeal,
  DMSLead,
  DMSServiceOrder,
  DMSVehicle,
  LeadFilter,
  ServiceOrderFilter,
  VehicleFilter,
} from "./types";

export interface CDKCredentials {
  /** CDK partner API key. TODO(cdk-credential): wire from migration 079 vault. */
  apiKey: string;
  /** CDK store id. */
  storeId: string;
}

const CDK_BASE_URL = "https://partners.cdk.com/api";

export class CDKAdapter implements DMSAdapter {
  public readonly provider = "cdk" as const;
  public readonly capabilities: ReadonlySet<AdapterCapability>;

  private readonly creds: CDKCredentials | null;

  constructor(creds: CDKCredentials | null) {
    this.creds = creds;
    this.capabilities = new Set<AdapterCapability>([
      "read_inventory",
      "read_leads",
      "read_deals",
    ]);
  }

  async ping(): Promise<AdapterResult<AdapterPingStatus>> {
    if (!this.creds) {
      return notConfigured(
        "CDK partner enrollment pending — see TODO(cdk-credential)",
      );
    }
    // TODO(cdk-credential): GET ${CDK_BASE_URL}/health
    return notConfigured(
      "CDK partner enrollment pending — see TODO(cdk-credential)",
    );
  }

  async listVehicles(filter?: VehicleFilter): Promise<AdapterResult<DMSVehicle[]>> {
    if (!this.creds) {
      return notConfigured(
        "CDK partner enrollment pending — see TODO(cdk-credential)",
      );
    }
    // TODO(cdk-credential): GET ${CDK_BASE_URL}/inventory/v3/vehicles
    void filter;
    void CDK_BASE_URL;
    return notConfigured(
      "CDK inventory endpoint not yet wired — see TODO(cdk-credential)",
    );
  }

  async updateVehiclePrice(vin: string, newPrice: number): Promise<AdapterResult<void>> {
    void vin;
    void newPrice;
    return notSupported("write_inventory_update");
  }

  async listLeads(filter?: LeadFilter): Promise<AdapterResult<DMSLead[]>> {
    if (!this.creds) {
      return notConfigured(
        "CDK partner enrollment pending — see TODO(cdk-credential)",
      );
    }
    // TODO(cdk-credential): GET ${CDK_BASE_URL}/crm/leads/v1
    void filter;
    return notConfigured(
      "CDK leads endpoint not yet wired — see TODO(cdk-credential)",
    );
  }

  async updateLeadStatus(leadId: string, status: string): Promise<AdapterResult<void>> {
    void leadId;
    void status;
    return notSupported("write_lead_update");
  }

  async listDeals(filter?: DealFilter): Promise<AdapterResult<DMSDeal[]>> {
    if (!this.creds) {
      return notConfigured(
        "CDK partner enrollment pending — see TODO(cdk-credential)",
      );
    }
    // TODO(cdk-credential): GET ${CDK_BASE_URL}/deals/v2
    void filter;
    return notConfigured(
      "CDK deals endpoint not yet wired — see TODO(cdk-credential)",
    );
  }

  async listServiceOrders(
    filter?: ServiceOrderFilter,
  ): Promise<AdapterResult<DMSServiceOrder[]>> {
    void filter;
    return notSupported("read_service_orders");
  }
}

export function createCDKAdapter(creds: CDKCredentials | null): CDKAdapter {
  return new CDKAdapter(creds);
}
