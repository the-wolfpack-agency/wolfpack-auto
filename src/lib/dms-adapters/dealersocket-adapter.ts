/**
 * DealerSocket adapter — STUB pending partner enrollment.
 *
 * Year-one second-target after Cox/vAuto. DealerSocket APIs require a
 * signed partner agreement; while that is in flight every method returns
 * `not_configured`. The endpoint shapes sketched in TODO(dealersocket-credential)
 * markers are pulled from DealerSocket's public developer-portal docs.
 *
 * Capabilities declared: read_inventory, read_leads, read_deals.
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

export interface DealerSocketCredentials {
  /** DealerSocket OAuth client id. TODO(dealersocket-credential): wire from migration 079 vault. */
  clientId: string;
  /** DealerSocket OAuth client secret. TODO(dealersocket-credential): vault-stored. */
  clientSecret: string;
  /** DealerSocket dealer GUID. */
  dealerGuid: string;
}

const DEALERSOCKET_BASE_URL = "https://api.dealersocket.com";

export class DealerSocketAdapter implements DMSAdapter {
  public readonly provider = "dealersocket" as const;
  public readonly capabilities: ReadonlySet<AdapterCapability>;

  private readonly creds: DealerSocketCredentials | null;

  constructor(creds: DealerSocketCredentials | null) {
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
        "DealerSocket partner enrollment pending — see TODO(dealersocket-credential)",
      );
    }
    // TODO(dealersocket-credential): POST ${DEALERSOCKET_BASE_URL}/oauth/token then GET /healthz.
    return notConfigured(
      "DealerSocket partner enrollment pending — see TODO(dealersocket-credential)",
    );
  }

  async listVehicles(filter?: VehicleFilter): Promise<AdapterResult<DMSVehicle[]>> {
    if (!this.creds) {
      return notConfigured(
        "DealerSocket partner enrollment pending — see TODO(dealersocket-credential)",
      );
    }
    // TODO(dealersocket-credential): GET ${DEALERSOCKET_BASE_URL}/idms/inventory/v1/vehicles
    // Auth via OAuth2 client_credentials grant.
    void filter;
    void DEALERSOCKET_BASE_URL;
    return notConfigured(
      "DealerSocket inventory endpoint not yet wired — see TODO(dealersocket-credential)",
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
        "DealerSocket partner enrollment pending — see TODO(dealersocket-credential)",
      );
    }
    // TODO(dealersocket-credential): GET ${DEALERSOCKET_BASE_URL}/crm/leads/v1
    void filter;
    return notConfigured(
      "DealerSocket leads endpoint not yet wired — see TODO(dealersocket-credential)",
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
        "DealerSocket partner enrollment pending — see TODO(dealersocket-credential)",
      );
    }
    // TODO(dealersocket-credential): GET ${DEALERSOCKET_BASE_URL}/dms/deals/v1
    void filter;
    return notConfigured(
      "DealerSocket deals endpoint not yet wired — see TODO(dealersocket-credential)",
    );
  }

  async listServiceOrders(
    filter?: ServiceOrderFilter,
  ): Promise<AdapterResult<DMSServiceOrder[]>> {
    void filter;
    return notSupported("read_service_orders");
  }
}

export function createDealerSocketAdapter(
  creds: DealerSocketCredentials | null,
): DealerSocketAdapter {
  return new DealerSocketAdapter(creds);
}
