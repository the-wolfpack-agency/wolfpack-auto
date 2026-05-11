/**
 * Shared types for the recalls + TSB awareness module.
 *
 * Keep these isolated from the rest of the codebase so we can iterate on
 * shapes without rippling into unrelated callers.
 */

export type RecallSeverity = "minor" | "moderate" | "critical";
export type RecallStatus = "open" | "resolved" | "dismissed_by_owner";

/** Canonical recall row as stored in our `recalls` cache. */
export interface RecallRecord {
  id: string;
  nhtsa_campaign_id: string;
  make: string;
  model: string;
  year_from: number;
  year_to: number;
  description: string;
  severity: RecallSeverity;
  remedy_summary: string;
  announced_at: string | null;
  fetched_at: string;
}

/** Canonical TSB row as stored in our `tsbs` cache. */
export interface TSBRecord {
  id: string;
  manufacturer: string;
  bulletin_id: string;
  year_from: number;
  year_to: number;
  models: string[];
  description: string;
  recommended_action: string;
  published_at: string | null;
  fetched_at: string;
}

/** Provider-shaped TSB payload (before we upsert it into our cache). */
export interface TSB {
  manufacturer: string;
  bulletin_id: string;
  year_from: number;
  year_to: number;
  models: string[];
  description: string;
  recommended_action: string;
  published_at: string | null;
  /**
   * Provenance flag. Honesty rule (per CLAUDE.md):
   *   "mock"      — synthetic data from MockTSBProvider
   *   "alldata"   — paid partnership, NOT IMPLEMENTED
   *   "mitchell1" — paid partnership, NOT IMPLEMENTED
   *   "identifix" — paid partnership, NOT IMPLEMENTED
   */
  source: "mock" | "alldata" | "mitchell1" | "identifix";
}

/** Raw NHTSA API result row (subset we use). */
export interface NHTSARecallApiRecord {
  Manufacturer: string;
  NHTSACampaignNumber: string;
  Component: string;
  Summary: string;
  Consequence: string;
  Remedy: string;
  ReportReceivedDate: string;
  ModelYear: string;
  Make: string;
  Model: string;
}

/** Minimal vehicle shape the resolver needs. */
export interface VehicleForRecallLookup {
  id: string;
  make: string;
  model: string;
  year: number;
}

/** Combined response sent back from /api/admin/vehicles/[id]/recalls. */
export interface VehicleRecallReport {
  vehicle: VehicleForRecallLookup;
  open_recalls: Array<RecallRecord & { status: RecallStatus; resolved_at: string | null }>;
  tsbs: TSBRecord[];
  recall_count: number;
  tsb_count: number;
  checked_at: string;
}
