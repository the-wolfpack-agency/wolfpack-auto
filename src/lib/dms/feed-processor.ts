/**
 * DMS feed processor — full sync pipeline.
 *
 * Orchestrates: normalize -> validate VINs -> diff inventory ->
 * upsert DB -> invalidate cache -> return results.
 *
 * Idempotent and safe to re-run.
 */

import { query } from "@/lib/db";
import { cacheInvalidate } from "@/lib/cache";
import { normalizeVehicle } from "./normalizer";
import { validateVIN } from "./vin-decoder";
import type { DMSProvider, DMSVehicleRecord, DMSFeedResult, DMSFeedError } from "./types";

// ---------------------------------------------------------------------------
// Feed processing
// ---------------------------------------------------------------------------

/**
 * Process a batch of DMS vehicle records for a dealer.
 *
 * Steps:
 *  1. Normalise each record (provider-aware field mapping)
 *  2. Validate VINs
 *  3. Diff against existing inventory
 *  4. Upsert new/changed vehicles, remove stale ones
 *  5. Invalidate cache
 *
 * Idempotent: running twice with the same data produces the same result.
 */
export async function processFeed(
  dealerId: string,
  provider: DMSProvider,
  records: DMSVehicleRecord[],
  syncType: "full" | "incremental" | "upload" = "full",
): Promise<DMSFeedResult> {
  const startTime = Date.now();
  const errors: DMSFeedError[] = [];
  const warnings: string[] = [];

  let added = 0;
  let updated = 0;
  let removed = 0;
  let skipped = 0;

  const processedVINs: Set<string> = new Set();

  // ------------------------------------------------------------------
  // Step 1 + 2: Normalise and validate each record
  // ------------------------------------------------------------------

  for (const raw of records) {
    const normResult = normalizeVehicle(raw, provider);

    if (normResult.errors.length > 0 || !normResult.vehicle) {
      const rawVin = raw.vin ?? raw.VIN ?? raw.Vin ?? null;
      errors.push({
        vin: typeof rawVin === "string" ? rawVin : null,
        field: null,
        message: normResult.errors.join("; "),
      });
      skipped++;
      continue;
    }

    if (normResult.warnings.length > 0) {
      warnings.push(...normResult.warnings.map(
        (w) => `[${normResult.vehicle!.vin}] ${w}`,
      ));
    }

    const vehicle = normResult.vehicle;
    const vin = vehicle.vin!;

    // VIN validation
    const vinResult = validateVIN(vin);
    if (!vinResult.valid) {
      errors.push({
        vin,
        field: "vin",
        message: `VIN validation failed: ${vinResult.errors.join("; ")}`,
      });
      skipped++;
      continue;
    }

    // Duplicate within batch
    if (processedVINs.has(vin)) {
      warnings.push(`[${vin}] Duplicate in feed batch, using last occurrence`);
    }
    processedVINs.add(vin);

    // ------------------------------------------------------------------
    // Step 3 + 4: Upsert into database
    // ------------------------------------------------------------------

    try {
      const existing = await query<{ id: string }>(
        `SELECT id FROM vehicles WHERE dealer_id = $1 AND vin = $2`,
        [dealerId, vin],
      );

      if (existing.rows.length > 0) {
        // Update existing vehicle
        await query(
          `UPDATE vehicles SET
            stock_number    = $3,
            year            = $4,
            make            = $5,
            model           = $6,
            trim            = $7,
            body_style      = $8,
            exterior_color  = $9,
            interior_color  = $10,
            engine          = $11,
            transmission    = $12,
            drivetrain      = $13,
            fuel_type       = $14,
            mpg_city        = $15,
            mpg_highway     = $16,
            msrp            = $17,
            price           = $18,
            internet_price  = $19,
            condition       = $20,
            mileage         = $21,
            status          = $22,
            photos          = $23,
            photo_count     = $24,
            description     = $25,
            features        = $26,
            updated_at      = now()
          WHERE dealer_id = $1 AND vin = $2`,
          [
            dealerId,
            vin,
            vehicle.stock_number ?? "",
            vehicle.year,
            vehicle.make,
            vehicle.model,
            vehicle.trim ?? "",
            vehicle.body_style ?? "",
            vehicle.exterior_color ?? "",
            vehicle.interior_color ?? "",
            vehicle.engine ?? "",
            vehicle.transmission ?? "automatic",
            vehicle.drivetrain ?? "fwd",
            vehicle.fuel_type ?? "gasoline",
            vehicle.mpg_city ?? null,
            vehicle.mpg_highway ?? null,
            vehicle.msrp ?? null,
            vehicle.price,
            vehicle.internet_price ?? null,
            vehicle.condition ?? "used",
            vehicle.mileage ?? 0,
            vehicle.status ?? "available",
            JSON.stringify(vehicle.photos ?? []),
            vehicle.photo_count ?? 0,
            vehicle.description ?? "",
            JSON.stringify(vehicle.features ?? []),
          ],
        );
        updated++;
      } else {
        // Insert new vehicle
        await query(
          `INSERT INTO vehicles (
            dealer_id, vin, stock_number, year, make, model, trim,
            body_style, exterior_color, interior_color, engine,
            transmission, drivetrain, fuel_type, mpg_city, mpg_highway,
            msrp, price, internet_price, condition, mileage, status,
            photos, photo_count, description, features
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11,
            $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21, $22,
            $23, $24, $25, $26
          )`,
          [
            dealerId,
            vin,
            vehicle.stock_number ?? "",
            vehicle.year,
            vehicle.make,
            vehicle.model,
            vehicle.trim ?? "",
            vehicle.body_style ?? "",
            vehicle.exterior_color ?? "",
            vehicle.interior_color ?? "",
            vehicle.engine ?? "",
            vehicle.transmission ?? "automatic",
            vehicle.drivetrain ?? "fwd",
            vehicle.fuel_type ?? "gasoline",
            vehicle.mpg_city ?? null,
            vehicle.mpg_highway ?? null,
            vehicle.msrp ?? null,
            vehicle.price,
            vehicle.internet_price ?? null,
            vehicle.condition ?? "used",
            vehicle.mileage ?? 0,
            vehicle.status ?? "available",
            JSON.stringify(vehicle.photos ?? []),
            vehicle.photo_count ?? 0,
            vehicle.description ?? "",
            JSON.stringify(vehicle.features ?? []),
          ],
        );
        added++;
      }
    } catch (err) {
      errors.push({
        vin,
        field: null,
        message: `Database error: ${err instanceof Error ? err.message : String(err)}`,
      });
      skipped++;
    }
  }

  // ------------------------------------------------------------------
  // Step 5: Remove stale vehicles (full sync only)
  // ------------------------------------------------------------------

  if (syncType === "full" && processedVINs.size > 0) {
    try {
      const existingResult = await query<{ vin: string }>(
        `SELECT vin FROM vehicles WHERE dealer_id = $1 AND status = 'available'`,
        [dealerId],
      );

      const staleVINs = existingResult.rows
        .map((r) => r.vin)
        .filter((v) => !processedVINs.has(v));

      if (staleVINs.length > 0) {
        // Mark as sold rather than hard-deleting (preserves history)
        const placeholders = staleVINs.map((_, i) => `$${i + 2}`).join(", ");
        await query(
          `UPDATE vehicles
           SET status = 'sold', updated_at = now()
           WHERE dealer_id = $1 AND vin IN (${placeholders})`,
          [dealerId, ...staleVINs],
        );
        removed = staleVINs.length;
      }
    } catch (err) {
      warnings.push(
        `Failed to remove stale inventory: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // Step 6: Invalidate cache
  // ------------------------------------------------------------------

  try {
    await cacheInvalidate(`inventory:dealer:${dealerId}:*`);
    await cacheInvalidate(`vehicle:dealer:${dealerId}:*`);
  } catch {
    // Non-fatal — cache will expire naturally
    warnings.push("Cache invalidation failed; entries will expire on TTL");
  }

  // ------------------------------------------------------------------
  // Step 7: Log feed result
  // ------------------------------------------------------------------

  const result: DMSFeedResult = {
    dealer_id: dealerId,
    provider,
    sync_type: syncType,
    vehicles_received: records.length,
    vehicles_added: added,
    vehicles_updated: updated,
    vehicles_removed: removed,
    vehicles_skipped: skipped,
    errors,
    warnings,
    sync_duration_ms: Date.now() - startTime,
    synced_at: new Date().toISOString(),
  };

  // Persist feed log
  try {
    await query(
      `INSERT INTO dms_feed_logs (
        dealer_id, provider, sync_type,
        vehicles_received, vehicles_added, vehicles_updated,
        vehicles_removed, vehicles_skipped, error_count,
        duration_ms, synced_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        dealerId,
        provider,
        syncType,
        records.length,
        added,
        updated,
        removed,
        skipped,
        errors.length,
        result.sync_duration_ms,
        result.synced_at,
      ],
    );
  } catch {
    // Non-fatal — the sync itself succeeded
    warnings.push("Failed to persist feed log");
  }

  return result;
}
