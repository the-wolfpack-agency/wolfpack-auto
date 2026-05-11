/**
 * Shared types for the modern lead intake pipeline.
 *
 * These types are deliberately small + structural so the pure
 * intake/enrichment/scoring/routing functions can be tested
 * without a database.
 */

export type LeadSourceType = "webhook" | "api" | "email" | "manual";

export interface LeadIntakePayload {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  vehicle_interest: string;
  source_name: string;
  source_type: LeadSourceType;
  /** Optional dealer-scoped UUID. If absent, intake assumes the route
   *  has already resolved the dealer via the source signing secret. */
  dealer_id?: string;
  /** Free-form attribution / payload extras (UTM, raw provider body). */
  raw?: Record<string, unknown>;
}

export interface NormalizedLead {
  id: string;
  dealer_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  vehicle_interest: string;
  source_name: string;
  source_type: LeadSourceType;
  created_at: string;
}

export interface IngestResult {
  lead: NormalizedLead;
  duplicate: boolean;
  matched_lead_id: string | null;
}

/** Public-data fields the enrichment pipeline tries to populate. */
export interface EnrichedFields {
  household_income_band?: string;
  estimated_credit_band?: string;
  property_owner?: boolean;
  vehicle_history_owned?: string[];
  geographic_distance_miles?: number;
  social_profiles?: string[];
  /** Free-form bag — providers can dump extras here. */
  extras?: Record<string, unknown>;
}

export interface EnrichmentResult {
  lead_id: string;
  dealer_id: string;
  enriched: EnrichedFields;
  /** 0.0 - 1.0 — how trustworthy the union of providers is. */
  confidence: number;
  sources: string[];
  generated_at: string;
}

export interface EnrichmentProvider {
  name: string;
  /** Returns enriched fields it managed to populate. Must never throw. */
  fetch(lead: NormalizedLead): Promise<Partial<EnrichedFields>>;
}

export interface ScoreFactor {
  name: string;
  weight: number;
  score: number;
  notes?: string;
}

export interface LeadScore {
  score: number; // 0..100
  factors: ScoreFactor[];
  tier: "hot" | "warm" | "cool" | "cold";
}

/** Minimal rep shape needed for routing — no full session/user import. */
export interface DealerUser {
  id: string;
  name: string;
  active: boolean;
  /** Brand / segment specializations (e.g. "Toyota", "EV", "Truck"). */
  specializations: string[];
  /** Current open lead count — lower = more available. */
  current_load: number;
  /** Historical conversion rate (0.0..1.0). */
  conversion_rate: number;
}

export interface RoutingFactor {
  user_id: string;
  total: number;
  specialization_match: number;
  load_penalty: number;
  performance_bonus: number;
}

export interface RoutingDecision {
  chosen_user_id: string | null;
  candidate_user_ids: string[];
  factors: RoutingFactor[];
  reason: string;
}
