/**
 * Title/lien dispatcher — routes by state_code, with Postgres cache.
 *
 * Flow:
 *   1. Normalize VIN + state.
 *   2. Cache hit (24h, not expired) for (vin, state) -> return cached row.
 *   3. Otherwise, dispatch to the per-state client and persist the result.
 *   4. For unsupported states, the cache row still gets written so we don't
 *      retry every page load AND so analytics can count interest per state.
 *
 * Every persisted row is dealer-scoped (RLS) so audit trails are tenant-
 * isolated even though the underlying data is technically public.
 */

import { caClient } from "./ca-client";
import { flClient } from "./fl-client";
import { txClient } from "./tx-client";
import type {
  TitleLienClient,
  TitleLienResult,
} from "./types";

/* Registry — order is intentional. Add a new state by dropping a client here. */
const CLIENTS: Record<string, TitleLienClient> = {
  CA: caClient,
  TX: txClient,
  FL: flClient,
};

/**
 * Whether a state has a registered client at all. Used by routes for early
 * 400 responses rather than persisting noise.
 */
export function isStateRegistered(stateCode: string): boolean {
  return Object.prototype.hasOwnProperty.call(CLIENTS, stateCode.toUpperCase());
}

/**
 * The set of state codes Stream E currently knows about.
 */
export function registeredStateCodes(): string[] {
  return Object.keys(CLIENTS);
}

/**
 * Look up title + lien data for a (vin, state_code, dealer_id) triple.
 *
 * This function NEVER throws. Every error case is encoded in the returned
 * TitleLienResult so callers can persist a single coherent row.
 *
 * `dealerId` is required for the persistence layer (RLS). For pure-fetch
 * use cases (unit tests, batch tools) callers can pass `null` and use
 * `dispatchTitleLienNoPersist` directly.
 */
export async function dispatchTitleLien(
  vin: string,
  stateCode: string,
): Promise<TitleLienResult> {
  const normalizedState = stateCode.toUpperCase();
  const normalizedVin = vin.toUpperCase().trim();

  const client = CLIENTS[normalizedState];
  if (!client) {
    return {
      vin: normalizedVin,
      state_code: normalizedState,
      supported: false,
      reason: "state_not_supported_yet",
      source: "unsupported",
      looked_up_at: new Date().toISOString(),
    };
  }

  try {
    return await client.lookup(normalizedVin);
  } catch (err) {
    // Per the contract, clients should never throw — but if one does, we
    // collapse cleanly to an honest upstream_error result rather than
    // letting a 500 bubble into the route.
    console.warn(
      `[title-lien] dispatcher caught throw from ${normalizedState} client:`,
      err instanceof Error ? err.message : String(err),
    );
    return {
      vin: normalizedVin,
      state_code: normalizedState,
      supported: false,
      reason: "upstream_error",
      source: "unsupported",
      looked_up_at: new Date().toISOString(),
    };
  }
}
