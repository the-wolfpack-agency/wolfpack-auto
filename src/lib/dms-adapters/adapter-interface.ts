/**
 * DMS adapter contract.
 *
 * Every adapter (mock, Cox/vAuto, DealerSocket, CDK, Reynolds, etc.) implements
 * this interface. The contract is intentionally narrow — only the operations
 * the overlay product needs in year one. Per the strategy doc
 * (`docs/wolfpack-assistant-overlay-strategy-2026-05-12.md`), Cox/vAuto +
 * DealerSocket are the year-one accessible-API targets; CDK + Reynolds may
 * require browser-automation fallbacks, but they still implement this same
 * interface — the fallback is hidden behind the adapter boundary.
 *
 * Adapter authors MUST:
 *   - Return `AdapterResult<T>` from every method (never throw on auth, rate
 *     limit, or upstream-5xx — those are routine and the call site must be
 *     able to surface them cleanly to the UI).
 *   - Declare a capability set so the registry can short-circuit
 *     "not_supported" responses before the upstream call.
 *   - Be safe to instantiate without credentials (e.g. for `ping()`
 *     attempts during the dealer-admin connect-DMS wizard).
 *
 * Adapter authors MAY throw on programmer errors (bad args, schema drift,
 * etc.) — those are bugs and should be loud.
 */

import type {
  AdapterCapability,
  AdapterPingStatus,
  AdapterResult,
  DealFilter,
  DMSAdapterProvider,
  DMSDeal,
  DMSLead,
  DMSServiceOrder,
  DMSVehicle,
  LeadFilter,
  ServiceOrderFilter,
  VehicleFilter,
} from "./types";

export interface DMSAdapter {
  /** Provider slug — matches the migration 079 CHECK constraint. */
  readonly provider: DMSAdapterProvider;

  /** Static set of capabilities this adapter actually implements. */
  readonly capabilities: ReadonlySet<AdapterCapability>;

  /** Test the configured credentials work. Returns adapter status. */
  ping(): Promise<AdapterResult<AdapterPingStatus>>;

  // Inventory --------------------------------------------------------------
  listVehicles(filter?: VehicleFilter): Promise<AdapterResult<DMSVehicle[]>>;
  updateVehiclePrice(vin: string, newPrice: number): Promise<AdapterResult<void>>;

  // Leads ------------------------------------------------------------------
  listLeads(filter?: LeadFilter): Promise<AdapterResult<DMSLead[]>>;
  updateLeadStatus(leadId: string, status: string): Promise<AdapterResult<void>>;

  // Deals ------------------------------------------------------------------
  listDeals(filter?: DealFilter): Promise<AdapterResult<DMSDeal[]>>;

  // Service ---------------------------------------------------------------
  listServiceOrders(
    filter?: ServiceOrderFilter,
  ): Promise<AdapterResult<DMSServiceOrder[]>>;
}

// ---------------------------------------------------------------------------
// Helpers — every adapter shares these
// ---------------------------------------------------------------------------

/**
 * Build a `not_supported` result when the adapter's capability set lacks
 * the requested operation. Centralised here so every adapter speaks the
 * same error shape.
 */
export function notSupported<T>(capability: AdapterCapability): AdapterResult<T> {
  return {
    ok: false,
    error: "not_supported",
    detail: `Adapter does not declare capability: ${capability}`,
  };
}

/**
 * Build a `not_configured` result when the adapter is missing credentials
 * or a stub is in place pending partner enrollment.
 */
export function notConfigured<T>(detail: string): AdapterResult<T> {
  return { ok: false, error: "not_configured", detail };
}

/**
 * Build an `upstream_error` result. Use when the DMS responds with 5xx,
 * times out, or returns an unexpected schema.
 */
export function upstreamError<T>(detail: string): AdapterResult<T> {
  return { ok: false, error: "upstream_error", detail };
}
