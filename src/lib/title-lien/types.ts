/**
 * Shared types for the state title/lien lookup module.
 *
 * Goals per Stream E:
 *   - Honest mode. If a state has no truly free public API, we mark it
 *     `supported: false` with a structured reason rather than mocking data.
 *   - One canonical response shape across all state clients.
 */

export type TitleLienReason =
  | "state_not_supported_yet"
  | "paid_subscription_required"
  | "api_unavailable"
  | "vin_not_found"
  | "upstream_error"
  | "service_not_configured";

/**
 * Canonical title/lien response shape returned by every state client.
 *
 * `supported: true` + populated fields = real data (or honest cache).
 * `supported: false` = no usable free API for this state; UI shows
 * "We can't pull title data for {state} yet" rather than fake data.
 */
export interface TitleLienResult {
  vin: string;
  state_code: string;
  supported: boolean;
  reason?: TitleLienReason;
  has_lien?: boolean;
  lienholder_name?: string | null;
  title_status?: string | null;
  /** Raw provider payload for forensic / audit purposes. */
  raw?: Record<string, unknown>;
  /** Provenance: which client produced the row. */
  source:
    | "ca_dmv"
    | "tx_dmv"
    | "fl_flhsmv"
    | "unsupported"
    | "cache";
  /** When the data was fetched (server time). */
  looked_up_at: string;
}

/**
 * Per-state-client contract. Every concrete client returns the same shape.
 */
export interface TitleLienClient {
  /** Two-letter state code this client handles, e.g. "FL". */
  state_code: string;
  /** Whether this state currently has a real, free, working API. */
  supported: boolean;
  /**
   * Perform a fresh lookup. Throws nothing — every error case must be
   * encoded in the returned `TitleLienResult` so the caller can persist
   * it cleanly.
   */
  lookup(vin: string): Promise<TitleLienResult>;
}
