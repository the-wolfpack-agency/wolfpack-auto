/**
 * DMS adapter types.
 *
 * The adapter framework abstracts every DMS (Cox/vAuto, DealerSocket, CDK,
 * Reynolds, Dealertrack, DealerCenter) behind a single typed surface so
 * downstream code (Wolfpack Assistant, action-registry, copilot) is DMS-
 * agnostic. This file defines the canonical entity shapes the adapters
 * return and the cross-cutting result/error union every adapter method uses.
 *
 * Why canonical entity types live here (and not in src/lib/dms/types.ts):
 *
 * `src/lib/dms/types.ts` models the RAW inbound feed payload (DMSVehicleRecord
 * — a permissively-typed bag of provider-specific keys like `VIN`/`vin`/`Vin`).
 * The shapes here (`DMSVehicle`, `DMSLead`, `DMSDeal`, `DMSServiceOrder`) are
 * the NORMALIZED canonical shapes the adapter returns to callers after
 * provider-specific mapping has happened. Two distinct concerns, two distinct
 * files. The `DMSProvider` enum IS reused from `src/lib/dms/types.ts` —
 * see `provider.ts` for the import bridge.
 *
 * Reserved scope (per the strategy doc at
 * `docs/wolfpack-assistant-overlay-strategy-2026-05-12.md`):
 *   - read_inventory / read_leads / read_deals / read_service_orders
 *   - write_inventory_update / write_lead_update / write_deal_status /
 *     write_service_appointment
 *   - read_fi_attach_rates / read_customer_history
 *
 * Capability declarations are READ-ONLY at the adapter level so the registry
 * can enforce "the dealer's adapter doesn't support write_deal_status" at
 * the route layer instead of letting the call go through and 500 at the
 * upstream DMS.
 */

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export type AdapterCapability =
  | "read_inventory"
  | "write_inventory_update"
  | "read_leads"
  | "write_lead_update"
  | "read_deals"
  | "write_deal_status"
  | "read_service_orders"
  | "write_service_appointment"
  | "read_fi_attach_rates"
  | "read_customer_history";

export const ALL_CAPABILITIES: ReadonlyArray<AdapterCapability> = Object.freeze([
  "read_inventory",
  "write_inventory_update",
  "read_leads",
  "write_lead_update",
  "read_deals",
  "write_deal_status",
  "read_service_orders",
  "write_service_appointment",
  "read_fi_attach_rates",
  "read_customer_history",
]);

// ---------------------------------------------------------------------------
// Provider enum — re-exported from src/lib/dms/types.ts so adapter callers
// have one place to import.
// ---------------------------------------------------------------------------

/**
 * Adapter-side provider slugs. Mirrors the CHECK constraint on
 * migration 079's `provider` column.
 *
 * NOTE: This is intentionally a string-literal union (not an enum) because
 * the adapter framework treats provider as a routing key, and we want to
 * be able to register new adapters without touching the type file. The
 * `DMSProvider` enum in `src/lib/dms/types.ts` is for the inbound-feed
 * normalizer and is kept distinct on purpose.
 */
export type DMSAdapterProvider =
  | "mock"
  | "cox_vauto"
  | "dealersocket"
  | "cdk"
  | "reynolds"
  | "dealertrack"
  | "dealercenter";

export const ALL_ADAPTER_PROVIDERS: ReadonlyArray<DMSAdapterProvider> = Object.freeze([
  "mock",
  "cox_vauto",
  "dealersocket",
  "cdk",
  "reynolds",
  "dealertrack",
  "dealercenter",
]);

// ---------------------------------------------------------------------------
// Result discriminated union
// ---------------------------------------------------------------------------

/**
 * Every adapter method returns an AdapterResult. Never throw — the call
 * sites must be able to surface "DMS unavailable" cleanly to the UI per
 * the graceful-degradation invariant from CLAUDE.md.
 */
export type AdapterResultError =
  | "not_supported"      // adapter does not declare this capability
  | "not_configured"     // credentials missing or revoked
  | "auth_failed"        // upstream auth rejected (rotated key, expired)
  | "rate_limited"       // upstream 429
  | "upstream_error";    // upstream 5xx or transport failure

export type AdapterResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AdapterResultError; detail?: string };

// ---------------------------------------------------------------------------
// Canonical entity shapes returned by the adapter
// ---------------------------------------------------------------------------

/**
 * Canonical vehicle shape the adapter returns.
 * Mirrors the inventory surface dealers actually care about — not the raw
 * 200-field DMS payload. Adapters MAY include more fields, but these are
 * the ones downstream code can rely on.
 */
export interface DMSVehicle {
  /** External DMS identifier (e.g. CDK row id, vAuto stock GUID). */
  externalId: string;
  vin: string;
  stockNumber: string | null;
  year: number | null;
  make: string;
  model: string;
  trim: string | null;
  bodyStyle: string | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  mileage: number | null;
  condition: "new" | "used" | "cpo" | "unknown";
  price: number | null;
  msrp: number | null;
  status: string | null;
  inStockDate: string | null; // ISO 8601
  /** Mock-adapter flag — surfaced in the UI so demo data is never confused with real data. */
  isMock?: boolean;
}

export interface DMSLead {
  externalId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  vehicleOfInterestVin: string | null;
  createdAt: string; // ISO 8601
  lastActivityAt: string | null; // ISO 8601
  isMock?: boolean;
}

export interface DMSDeal {
  externalId: string;
  customerName: string | null;
  vehicleVin: string;
  stockNumber: string | null;
  status: string;
  dealType: "retail" | "lease" | "wholesale" | "unknown";
  salePrice: number | null;
  fundedAt: string | null; // ISO 8601
  funded: boolean;
  createdAt: string; // ISO 8601
  isMock?: boolean;
}

export interface DMSServiceOrder {
  externalId: string;
  customerName: string | null;
  vehicleVin: string | null;
  status: "open" | "in_progress" | "complete" | "closed" | "unknown";
  serviceType: string | null;
  openedAt: string; // ISO 8601
  closedAt: string | null; // ISO 8601
  isMock?: boolean;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface VehicleFilter {
  vin?: string;
  stock?: string;
  limit?: number;
}

export interface LeadFilter {
  status?: string;
  since?: Date;
  limit?: number;
}

export interface DealFilter {
  funded?: boolean;
  since?: Date;
  limit?: number;
}

export interface ServiceOrderFilter {
  open?: boolean;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Adapter status snapshot (returned by ping)
// ---------------------------------------------------------------------------

export interface AdapterPingStatus {
  healthy: boolean;
  vendor_version?: string;
}

// ---------------------------------------------------------------------------
// Registry record (the row shape returned by `listConfiguredAdapters`)
// ---------------------------------------------------------------------------

export type AdapterCredentialStatus =
  | "pending"
  | "active"
  | "failed"
  | "revoked"
  | "rotating";

export interface ConfiguredAdapterRecord {
  id: string;
  dealerId: string;
  provider: DMSAdapterProvider;
  status: AdapterCredentialStatus;
  capabilitySet: AdapterCapability[];
  lastUsedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}
