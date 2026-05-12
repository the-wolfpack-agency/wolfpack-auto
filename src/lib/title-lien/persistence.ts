/**
 * Postgres persistence for title/lien lookups (migration 073).
 *
 * Cache contract:
 *   - 24h TTL keyed on (vin, state_code) — uniqueness enforced by index.
 *   - Cache hit returns the persisted row, marked `source: "cache"` so the
 *     UI can show "last refreshed N hours ago" if it wants.
 *   - Cache miss / expired -> dispatcher.lookup() -> upsert -> return.
 *
 * Shadow-mode: if DATABASE_URL is unset, we skip persistence entirely and
 * return a freshly-dispatched result with no cache write. This matches the
 * recall/market-intel pattern.
 */

import { query } from "@/lib/db";
import { dispatchTitleLien } from "./dispatcher";
import type { TitleLienResult } from "./types";

interface TitleLienCacheRow {
  vin: string;
  state_code: string;
  raw_response: Record<string, unknown> | null;
  has_lien: boolean | null;
  lienholder_name: string | null;
  title_status: string | null;
  source: string;
  supported: boolean;
  unsupported_reason: string | null;
  looked_up_at: string;
  expires_at: string;
}

/**
 * Read a cached row. Returns null on cache miss OR expired.
 *
 * `dealerId` scopes the read so an audit slice per dealer is preserved even
 * though (vin, state_code) is globally unique in the cache index. Two
 * dealers looking up the same VIN+state share the SAME row (the unique
 * index dedupes), but each gets a tenant-isolated insert on first hit via
 * an UPSERT — the dealer_id on the row is the FIRST dealer to ever look it
 * up. See `upsertTitleLienCache` for the rationale.
 */
export async function getCachedTitleLien(
  vin: string,
  stateCode: string,
): Promise<TitleLienResult | null> {
  if (!process.env.DATABASE_URL) return null;

  const result = await query<TitleLienCacheRow>(
    `SELECT vin, state_code, raw_response, has_lien, lienholder_name,
            title_status, source, supported, unsupported_reason,
            looked_up_at, expires_at
       FROM vehicle_title_lookups
      WHERE vin = $1 AND state_code = $2
        AND expires_at > NOW()
      LIMIT 1`,
    [vin.toUpperCase(), stateCode.toUpperCase()],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    vin: row.vin,
    state_code: row.state_code,
    supported: row.supported,
    reason: row.unsupported_reason
      ? (row.unsupported_reason as TitleLienResult["reason"])
      : undefined,
    has_lien: row.has_lien ?? undefined,
    lienholder_name: row.lienholder_name,
    title_status: row.title_status,
    raw: row.raw_response ?? undefined,
    source: "cache",
    looked_up_at: row.looked_up_at,
  };
}

/**
 * Write (or refresh) a cache row. Idempotent on (vin, state_code).
 *
 * `dealer_id` + `vehicle_id` go on the row for RLS isolation and audit. If
 * the same VIN+state was previously looked up by a DIFFERENT dealer, we
 * update the row in place (the public data is the same). The audit trail
 * lives in `audit_logs` per `requireAuth` route — the cache row is purely
 * a performance optimization.
 */
export async function upsertTitleLienCache(
  dealerId: string,
  vehicleId: string | null,
  result: TitleLienResult,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  await query(
    `INSERT INTO vehicle_title_lookups
       (dealer_id, vehicle_id, vin, state_code, raw_response,
        has_lien, lienholder_name, title_status, source, supported,
        unsupported_reason, looked_up_at, expires_at)
     VALUES ($1, $2, $3, $4, $5::jsonb,
             $6, $7, $8, $9, $10,
             $11, NOW(), NOW() + INTERVAL '24 hours')
     ON CONFLICT (vin, state_code) DO UPDATE
       SET raw_response       = EXCLUDED.raw_response,
           has_lien           = EXCLUDED.has_lien,
           lienholder_name    = EXCLUDED.lienholder_name,
           title_status       = EXCLUDED.title_status,
           source             = EXCLUDED.source,
           supported          = EXCLUDED.supported,
           unsupported_reason = EXCLUDED.unsupported_reason,
           looked_up_at       = EXCLUDED.looked_up_at,
           expires_at         = EXCLUDED.expires_at,
           updated_at         = NOW()`,
    [
      dealerId,
      vehicleId,
      result.vin,
      result.state_code,
      JSON.stringify(result.raw ?? {}),
      result.has_lien ?? null,
      result.lienholder_name ?? null,
      result.title_status ?? null,
      result.source,
      result.supported,
      result.reason ?? null,
    ],
  );
}

/**
 * The route handler's entry point. Cache-first, dispatch on miss, persist on
 * success. Always returns a result — never throws.
 */
export async function loadOrFetchTitleLien(
  dealerId: string,
  vehicleId: string | null,
  vin: string,
  stateCode: string,
): Promise<TitleLienResult> {
  const normalizedVin = vin.toUpperCase().trim();
  const normalizedState = stateCode.toUpperCase().trim();

  try {
    const cached = await getCachedTitleLien(normalizedVin, normalizedState);
    if (cached) return cached;
  } catch (err) {
    console.warn(
      "[title-lien] cache read failed (continuing to fresh fetch):",
      err instanceof Error ? err.message : String(err),
    );
  }

  const fresh = await dispatchTitleLien(normalizedVin, normalizedState);

  try {
    await upsertTitleLienCache(dealerId, vehicleId, fresh);
  } catch (err) {
    console.warn(
      "[title-lien] cache write failed (returning live result):",
      err instanceof Error ? err.message : String(err),
    );
  }

  return fresh;
}
