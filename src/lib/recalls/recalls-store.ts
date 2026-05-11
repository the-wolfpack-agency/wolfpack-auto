/**
 * Postgres persistence for the recalls + TSB awareness module.
 *
 * Thin wrapper around `@/lib/db.query`. Lives separately from route handlers
 * per the convention: business logic in `src/lib/<domain>/`, routes stay thin.
 *
 * All functions short-circuit cleanly when DATABASE_URL is unset (shadow
 * mode), returning sensible empty shapes so the routes can still respond.
 */

import { query } from "@/lib/db";
import {
  classifySeverity,
  fetchRecallsForVehicle,
} from "./nhtsa-recalls-client";
import { resolveForVehicle } from "./vehicle-recall-resolver";
import { getTSBProvider } from "./tsb-providers";
import type {
  NHTSARecallApiRecord,
  RecallRecord,
  RecallStatus,
  TSBRecord,
  VehicleForRecallLookup,
  VehicleRecallReport,
} from "./types";

/* ------------------------------------------------------------------ */
/*  Vehicle lookup                                                      */
/* ------------------------------------------------------------------ */

/**
 * Load a tenant-scoped vehicle (by UUID id OR VIN). Returns null if no match.
 * The route accepts an `[id]` segment that can be either, so we try both.
 */
export async function loadVehicle(
  dealerId: string,
  idOrVin: string,
): Promise<VehicleForRecallLookup | null> {
  if (!process.env.DATABASE_URL) return null;

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idOrVin,
    );

  const result = await query<{
    id: string;
    make: string;
    model: string;
    year: number;
  }>(
    isUuid
      ? `SELECT id, make, model, year FROM vehicles
           WHERE dealer_id = $1 AND id = $2 LIMIT 1`
      : `SELECT id, make, model, year FROM vehicles
           WHERE dealer_id = $1 AND vin = $2 LIMIT 1`,
    [dealerId, isUuid ? idOrVin : idOrVin.toUpperCase()],
  );

  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    make: row.make,
    model: row.model,
    year: row.year,
  };
}

/* ------------------------------------------------------------------ */
/*  Recall + TSB upsert                                                 */
/* ------------------------------------------------------------------ */

/**
 * Upsert a parsed NHTSA recall record into the cache.
 * Returns the canonical row id.
 */
export async function upsertRecallFromNHTSA(
  rec: NHTSARecallApiRecord,
): Promise<string | null> {
  if (!process.env.DATABASE_URL) return null;

  const year = parseInt(String(rec.ModelYear), 10);
  if (!Number.isFinite(year)) return null;

  const severity = classifySeverity(rec);

  const result = await query<{ id: string }>(
    `INSERT INTO recalls (
       nhtsa_campaign_id, make, model, year_from, year_to,
       description, severity, remedy_summary, announced_at, fetched_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, NOW(), NOW())
     ON CONFLICT (nhtsa_campaign_id) DO UPDATE SET
       make            = EXCLUDED.make,
       model           = EXCLUDED.model,
       year_from       = LEAST(recalls.year_from, EXCLUDED.year_from),
       year_to         = GREATEST(recalls.year_to, EXCLUDED.year_to),
       description     = EXCLUDED.description,
       severity        = EXCLUDED.severity,
       remedy_summary  = EXCLUDED.remedy_summary,
       announced_at    = COALESCE(recalls.announced_at, EXCLUDED.announced_at),
       fetched_at      = NOW(),
       updated_at      = NOW()
     RETURNING id`,
    [
      rec.NHTSACampaignNumber,
      (rec.Make ?? "").trim(),
      (rec.Model ?? "").trim(),
      year,
      rec.Summary ?? "",
      severity,
      rec.Remedy ?? "",
      rec.ReportReceivedDate ? new Date(rec.ReportReceivedDate) : null,
    ],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Upsert a TSB row.
 */
export async function upsertTSB(t: {
  manufacturer: string;
  bulletin_id: string;
  year_from: number;
  year_to: number;
  models: string[];
  description: string;
  recommended_action: string;
  published_at: string | null;
}): Promise<string | null> {
  if (!process.env.DATABASE_URL) return null;

  const result = await query<{ id: string }>(
    `INSERT INTO tsbs (
       manufacturer, bulletin_id, year_from, year_to,
       models, description, recommended_action, published_at, fetched_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
     ON CONFLICT (manufacturer, bulletin_id) DO UPDATE SET
       year_from           = EXCLUDED.year_from,
       year_to             = EXCLUDED.year_to,
       models              = EXCLUDED.models,
       description         = EXCLUDED.description,
       recommended_action  = EXCLUDED.recommended_action,
       published_at        = COALESCE(tsbs.published_at, EXCLUDED.published_at),
       fetched_at          = NOW(),
       updated_at          = NOW()
     RETURNING id`,
    [
      t.manufacturer,
      t.bulletin_id,
      t.year_from,
      t.year_to,
      t.models,
      t.description,
      t.recommended_action,
      t.published_at,
    ],
  );
  return result.rows[0]?.id ?? null;
}

/* ------------------------------------------------------------------ */
/*  Per-vehicle report                                                  */
/* ------------------------------------------------------------------ */

/**
 * Build the per-vehicle recall + TSB report:
 *   1. Hit NHTSA (24h-cached) for this exact (make, model, year).
 *   2. Upsert anything new into the recalls table.
 *   3. Query the cache for ALL recalls matching this vehicle.
 *   4. Query the TSB cache for ALL TSBs matching this vehicle.
 *   5. Pull the per-vehicle resolution state.
 *   6. Insert a recall_check_history audit row.
 *
 * Returns a typed report. If DATABASE_URL is unset, returns a shadow report
 * built purely from the resolver + provider in-memory state.
 */
export async function buildVehicleRecallReport(
  dealerId: string,
  vehicle: VehicleForRecallLookup,
): Promise<VehicleRecallReport> {
  // ---- 1. Live NHTSA pull (cached at the fetch layer) ----
  const nhtsaRecords = await fetchRecallsForVehicle(
    vehicle.make,
    vehicle.model,
    vehicle.year,
  );

  // ---- 2. Upsert any new NHTSA records ----
  if (process.env.DATABASE_URL) {
    for (const r of nhtsaRecords) {
      try {
        await upsertRecallFromNHTSA(r);
      } catch (err) {
        console.error("[recalls-store] upsertRecallFromNHTSA failed:", err);
      }
    }
  }

  // ---- 3 + 4. Read back from cache (the resolver does the join in-memory) ----
  let cachedRecalls: RecallRecord[] = [];
  let cachedTsbs: TSBRecord[] = [];
  let statuses: Map<string, { status: RecallStatus; resolved_at: string | null }> = new Map();

  if (process.env.DATABASE_URL) {
    const [recallsRes, tsbsRes, statusRes] = await Promise.all([
      query<RecallRecord>(
        `SELECT id, nhtsa_campaign_id, make, model, year_from, year_to,
                description, severity, remedy_summary,
                announced_at, fetched_at
           FROM recalls
          WHERE LOWER(make)  = LOWER($1)
            AND LOWER(model) = LOWER($2)
            AND $3::int BETWEEN year_from AND year_to
          ORDER BY
            CASE severity
              WHEN 'critical' THEN 0
              WHEN 'moderate' THEN 1
              WHEN 'minor'    THEN 2
              ELSE 3
            END,
            announced_at DESC NULLS LAST`,
        [vehicle.make, vehicle.model, vehicle.year],
      ),
      query<TSBRecord>(
        `SELECT id, manufacturer, bulletin_id, year_from, year_to,
                models, description, recommended_action,
                published_at, fetched_at
           FROM tsbs
          WHERE LOWER(manufacturer) = LOWER($1)
            AND $2::int BETWEEN year_from AND year_to
            AND EXISTS (
              SELECT 1 FROM unnest(models) m WHERE LOWER(m) = LOWER($3)
            )
          ORDER BY published_at DESC NULLS LAST`,
        [vehicle.make, vehicle.year, vehicle.model],
      ),
      query<{ recall_id: string; status: RecallStatus; resolved_at: string | null }>(
        `SELECT recall_id, status, resolved_at
           FROM vehicle_recall_status
          WHERE dealer_id = $1 AND vehicle_id = $2`,
        [dealerId, vehicle.id],
      ),
    ]);

    cachedRecalls = recallsRes.rows;
    cachedTsbs = tsbsRes.rows;
    statuses = new Map(
      statusRes.rows.map((r) => [r.recall_id, { status: r.status, resolved_at: r.resolved_at }]),
    );
  } else {
    // Shadow mode — fall back to provider + resolver
    const provider = getTSBProvider();
    const tsbsRaw = await provider.fetchTsbs(
      vehicle.make,
      vehicle.year,
      vehicle.model,
    );
    cachedTsbs = tsbsRaw.map((t, i) => ({
      id: `shadow-tsb-${i}`,
      manufacturer: t.manufacturer,
      bulletin_id: t.bulletin_id,
      year_from: t.year_from,
      year_to: t.year_to,
      models: t.models,
      description: t.description,
      recommended_action: t.recommended_action,
      published_at: t.published_at,
      fetched_at: new Date().toISOString(),
    }));
    cachedRecalls = nhtsaRecords.map((r, i) => ({
      id: `shadow-recall-${i}`,
      nhtsa_campaign_id: r.NHTSACampaignNumber,
      make: r.Make ?? vehicle.make,
      model: r.Model ?? vehicle.model,
      year_from: parseInt(String(r.ModelYear), 10) || vehicle.year,
      year_to: parseInt(String(r.ModelYear), 10) || vehicle.year,
      description: r.Summary ?? "",
      severity: classifySeverity(r),
      remedy_summary: r.Remedy ?? "",
      announced_at: r.ReportReceivedDate ?? null,
      fetched_at: new Date().toISOString(),
    }));
  }

  // ---- 5. Use the pure resolver to defensively re-filter (defense in depth) ----
  const resolved = resolveForVehicle(vehicle, {
    recalls: cachedRecalls,
    tsbs: cachedTsbs,
  });

  // ---- 6. Attach per-vehicle resolution state ----
  const openRecalls = resolved.recalls.map((r) => {
    const s = statuses.get(r.id);
    return {
      ...r,
      status: s?.status ?? ("open" as RecallStatus),
      resolved_at: s?.resolved_at ?? null,
    };
  });
  const openOnly = openRecalls.filter((r) => r.status === "open");

  // ---- 7. Log the check ----
  const checkedAt = new Date().toISOString();
  if (process.env.DATABASE_URL) {
    try {
      await query(
        `INSERT INTO recall_check_history
           (vehicle_id, dealer_id, checked_at, recall_count, tsb_count)
         VALUES ($1, $2, NOW(), $3, $4)`,
        [vehicle.id, dealerId, openOnly.length, resolved.tsbs.length],
      );
    } catch (err) {
      console.error("[recalls-store] check history insert failed:", err);
    }
  }

  return {
    vehicle,
    open_recalls: openRecalls,
    tsbs: resolved.tsbs,
    recall_count: openOnly.length,
    tsb_count: resolved.tsbs.length,
    checked_at: checkedAt,
  };
}

/* ------------------------------------------------------------------ */
/*  Per-vehicle status mutation                                         */
/* ------------------------------------------------------------------ */

export async function setRecallStatus(
  dealerId: string,
  vehicleId: string,
  recallId: string,
  status: RecallStatus,
  userId: string,
  notes: string,
): Promise<{ status: RecallStatus; resolved_at: string | null }> {
  if (!process.env.DATABASE_URL) {
    return {
      status,
      resolved_at:
        status === "resolved" || status === "dismissed_by_owner"
          ? new Date().toISOString()
          : null,
    };
  }

  const resolvedAt =
    status === "resolved" || status === "dismissed_by_owner" ? new Date() : null;

  const result = await query<{ status: RecallStatus; resolved_at: string | null }>(
    `INSERT INTO vehicle_recall_status
       (vehicle_id, dealer_id, recall_id, status, resolved_at, resolved_by_user_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (dealer_id, vehicle_id, recall_id) DO UPDATE SET
       status              = EXCLUDED.status,
       resolved_at         = EXCLUDED.resolved_at,
       resolved_by_user_id = EXCLUDED.resolved_by_user_id,
       notes               = EXCLUDED.notes,
       updated_at          = NOW()
     RETURNING status, resolved_at`,
    [vehicleId, dealerId, recallId, status, resolvedAt, userId, notes],
  );

  return result.rows[0];
}

/* ------------------------------------------------------------------ */
/*  Weekly refresh (cron entrypoint)                                    */
/* ------------------------------------------------------------------ */

const REFRESH_MAKES: Array<{ make: string; models: string[] }> = [
  { make: "Toyota", models: ["Camry", "Corolla", "RAV4", "Highlander", "Tacoma", "Tundra"] },
  { make: "Honda", models: ["Civic", "Accord", "CR-V", "Pilot", "Odyssey"] },
  { make: "Ford", models: ["F-150", "Escape", "Explorer", "Expedition", "Mustang"] },
  { make: "Chevrolet", models: ["Silverado", "Equinox", "Tahoe", "Suburban", "Malibu"] },
  { make: "Nissan", models: ["Altima", "Rogue", "Sentra", "Pathfinder"] },
];

/**
 * Refresh the recall + TSB caches. Idempotent: uses ON CONFLICT upsert so
 * re-running the cron just bumps `fetched_at`.
 *
 * Returns counts so the cron can return a JSON summary.
 */
export async function refreshRecallsAndTSBs(): Promise<{
  recalls_fetched: number;
  recalls_upserted: number;
  tsbs_upserted: number;
}> {
  let recallsFetched = 0;
  let recallsUpserted = 0;
  let tsbsUpserted = 0;

  const now = new Date().getUTCFullYear();
  const yearStart = now - 9;
  const yearEnd = now + 1;

  const provider = getTSBProvider();

  for (const { make, models } of REFRESH_MAKES) {
    for (const model of models) {
      for (let year = yearStart; year <= yearEnd; year++) {
        // eslint-disable-next-line no-await-in-loop
        const recs = await fetchRecallsForVehicle(make, model, year);
        recallsFetched += recs.length;
        for (const r of recs) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const id = await upsertRecallFromNHTSA(r);
            if (id) recallsUpserted++;
          } catch (err) {
            console.error("[recalls-store] refresh upsert failed:", err);
          }
        }

        // TSB upsert (mock today; honest about it)
        try {
          // eslint-disable-next-line no-await-in-loop
          const tsbs = await provider.fetchTsbs(make, year, model);
          for (const t of tsbs) {
            try {
              // eslint-disable-next-line no-await-in-loop
              const id = await upsertTSB({
                manufacturer: t.manufacturer,
                bulletin_id: t.bulletin_id,
                year_from: t.year_from,
                year_to: t.year_to,
                models: t.models,
                description: t.description,
                recommended_action: t.recommended_action,
                published_at: t.published_at,
              });
              if (id) tsbsUpserted++;
            } catch (err) {
              console.error("[recalls-store] refresh tsb upsert failed:", err);
            }
          }
        } catch (err) {
          // Mock should never throw; paid stubs will. Log + continue.
          console.warn(
            "[recalls-store] TSB provider unavailable:",
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    }
  }

  return {
    recalls_fetched: recallsFetched,
    recalls_upserted: recallsUpserted,
    tsbs_upserted: tsbsUpserted,
  };
}
