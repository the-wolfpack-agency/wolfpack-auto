/**
 * Cox Automotive / vAuto adapter — STUB pending Cox Marketplace partner
 * enrollment.
 *
 * Per the strategy doc (`docs/wolfpack-assistant-overlay-strategy-2026-05-12.md`),
 * Cox/vAuto is the year-one first-target adapter because Cox has the most
 * accessible APIs of the major DMS vendors. Partner enrollment is in flight
 * (TODO(cox-api-key) markers below show where the real API key + endpoint
 * shape will plug in).
 *
 * Until enrollment is approved, every method returns
 * `{ ok: false, error: "not_configured", detail: "..." }`. The structured
 * request shape is sketched in each method so the swap-in is mechanical
 * when the credential arrives.
 *
 * Public Cox API surface referenced (subject to change post-enrollment):
 *   - Inventory:      https://api.coxautoinc.com/inventory/v1/vehicles
 *   - Leads (vinSolutions): https://api.coxautoinc.com/vinsolutions/v2/leads
 *   - Deals:          https://api.coxautoinc.com/manheim/v1/transactions
 *
 * Capabilities declared at year-one scope: read_inventory, read_leads,
 * read_deals. Write operations require a higher-tier partner agreement
 * and are intentionally NOT declared so the registry short-circuits them.
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

// ---------------------------------------------------------------------------
// Credential shape (post-enrollment)
// ---------------------------------------------------------------------------

export interface CoxVAutoCredentials {
  /** Cox Marketplace API key. TODO(cox-api-key): wire from migration 079 vault. */
  apiKey: string;
  /** Dealer's Cox dealer code (e.g. "vauto:01234"). */
  dealerCode: string;
  /** Optional sandbox-vs-production switch. */
  environment?: "sandbox" | "production";
}

const COX_BASE_URL_PROD = "https://api.coxautoinc.com";
// const COX_BASE_URL_SANDBOX = "https://sandbox.api.coxautoinc.com"; // TODO(cox-api-key): confirm sandbox URL

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class CoxVAutoAdapter implements DMSAdapter {
  public readonly provider = "cox_vauto" as const;
  public readonly capabilities: ReadonlySet<AdapterCapability>;

  private readonly creds: CoxVAutoCredentials | null;

  constructor(creds: CoxVAutoCredentials | null) {
    this.creds = creds;
    // Year-one read-only scope. write_* capabilities deliberately omitted —
    // see the strategy doc.
    this.capabilities = new Set<AdapterCapability>([
      "read_inventory",
      "read_leads",
      "read_deals",
    ]);
  }

  async ping(): Promise<AdapterResult<AdapterPingStatus>> {
    if (!this.creds) {
      return notConfigured(
        "Cox Marketplace partner enrollment pending — see TODO(cox-api-key)",
      );
    }
    // TODO(cox-api-key): GET ${baseUrl}/healthz with apiKey header. The Cox
    // health endpoint is documented in the partner portal post-enrollment.
    return notConfigured(
      "Cox Marketplace partner enrollment pending — see TODO(cox-api-key)",
    );
  }

  async listVehicles(filter?: VehicleFilter): Promise<AdapterResult<DMSVehicle[]>> {
    if (!this.creds) {
      return notConfigured(
        "Cox Marketplace partner enrollment pending — see TODO(cox-api-key)",
      );
    }
    // TODO(cox-api-key): GET ${COX_BASE_URL_PROD}/inventory/v1/vehicles
    // Headers: { "X-Api-Key": this.creds.apiKey, "X-Dealer-Code": this.creds.dealerCode }
    // Query:   { vin?, stock?, limit? } — Cox naming matches our filter shape.
    // Response shape — map { VIN, StockNo, Year, Make, Model, ListPrice, ... }
    // into DMSVehicle via a normalizer (or extend src/lib/dms/normalizer.ts).
    void filter;
    void COX_BASE_URL_PROD;
    return notConfigured(
      "Cox listVehicles endpoint not yet wired — see TODO(cox-api-key)",
    );
  }

  async updateVehiclePrice(vin: string, newPrice: number): Promise<AdapterResult<void>> {
    // Year-one read-only scope. Capability not declared, so this should be
    // caught upstream. Belt-and-suspenders: short-circuit here as well.
    void vin;
    void newPrice;
    return notSupported("write_inventory_update");
  }

  async listLeads(filter?: LeadFilter): Promise<AdapterResult<DMSLead[]>> {
    if (!this.creds) {
      return notConfigured(
        "Cox Marketplace partner enrollment pending — see TODO(cox-api-key)",
      );
    }
    // TODO(cox-api-key): GET ${COX_BASE_URL_PROD}/vinsolutions/v2/leads
    // Headers: { "X-Api-Key": apiKey, "X-Dealer-Code": dealerCode }
    // Query:   { status?, since? as ISO, limit? }
    // Response shape — map { LeadId, FirstName, LastName, Email, ... } → DMSLead.
    void filter;
    return notConfigured(
      "Cox listLeads endpoint not yet wired — see TODO(cox-api-key)",
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
        "Cox Marketplace partner enrollment pending — see TODO(cox-api-key)",
      );
    }
    // TODO(cox-api-key): GET ${COX_BASE_URL_PROD}/manheim/v1/transactions
    // Headers: { "X-Api-Key": apiKey, "X-Dealer-Code": dealerCode }
    // Query:   { funded?, since? as ISO, limit? }
    void filter;
    return notConfigured(
      "Cox listDeals endpoint not yet wired — see TODO(cox-api-key)",
    );
  }

  async listServiceOrders(
    filter?: ServiceOrderFilter,
  ): Promise<AdapterResult<DMSServiceOrder[]>> {
    void filter;
    return notSupported("read_service_orders");
  }
}

/** Factory used by the registry. Returns a stub when no creds are supplied. */
export function createCoxVAutoAdapter(creds: CoxVAutoCredentials | null): CoxVAutoAdapter {
  return new CoxVAutoAdapter(creds);
}
