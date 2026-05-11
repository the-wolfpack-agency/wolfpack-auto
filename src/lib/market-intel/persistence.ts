/**
 * Market Intelligence persistence layer.
 *
 * Writes:
 *   - market_value_snapshots         (append-only)
 *   - market_comparable_listings     (append-only)
 *   - vehicle_market_signals         (upsert on vehicle_id)
 *
 * Triple-write side effects (Qdrant + Neo4j) are best-effort and never block
 * the Postgres write — same contract as @/lib/triple-write.
 *
 * Every refresh emits:
 *   - analytics event(s) via @/lib/analytics-hooks
 *   - an audit_log row via @/lib/audit-log
 */

import {
  trackInventoryMarketIntel,
  trackPricing,
} from "@/lib/analytics-hooks";
import { auditLog } from "@/lib/audit-log";
import type {
  ComparableListing,
  MarketValue,
  TargetVehicle,
  VehicleMarketSignal,
} from "@/lib/market-intel/types";

/* ------------------------------------------------------------------ */
/*  Postgres                                                            */
/* ------------------------------------------------------------------ */

export async function insertMarketValueSnapshot(
  target: TargetVehicle,
  value: MarketValue,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const { query } = await import("@/lib/db");
    await query(
      `INSERT INTO market_value_snapshots
         (vehicle_id, dealer_id, source, market_value_cents, condition_grade,
          miles, zip_code, captured_at, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        target.vehicleId,
        target.dealerId,
        value.source,
        value.marketValueCents,
        value.conditionGrade,
        value.miles ?? null,
        value.zipCode ?? null,
        value.capturedAt,
        JSON.stringify(value.rawPayload ?? { isMock: value.isMock }),
      ],
    );
  } catch (err) {
    console.error("[market-intel] insertMarketValueSnapshot failed:", err);
  }
}

export async function insertComparableListings(
  target: TargetVehicle,
  comps: ComparableListing[],
): Promise<void> {
  if (!process.env.DATABASE_URL || comps.length === 0) return;
  try {
    const { query } = await import("@/lib/db");
    // One bulk INSERT to keep the round trip tight.
    const values: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    for (const c of comps) {
      values.push(
        `($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`,
      );
      params.push(
        target.vehicleId,
        target.dealerId,
        c.compSource,
        c.compVinOrId,
        c.compYear ?? null,
        c.compMake ?? null,
        c.compModel ?? null,
        c.compTrim ?? null,
        c.compPriceCents,
        c.compMiles ?? null,
        c.compDistanceMiles ?? null,
        c.compDealerName ?? null,
        c.compUrl ?? null,
        c.capturedAt,
        JSON.stringify({ isMock: c.isMock }),
      );
    }
    await query(
      `INSERT INTO market_comparable_listings
         (vehicle_id, dealer_id, comp_source, comp_vin_or_id, comp_year,
          comp_make, comp_model, comp_trim, comp_price_cents, comp_miles,
          comp_distance_miles, comp_dealer_name, comp_url, captured_at,
          raw_payload)
       VALUES ${values.join(", ")}`,
      params,
    );
  } catch (err) {
    console.error("[market-intel] insertComparableListings failed:", err);
  }
}

/**
 * Upsert the latest signal for a vehicle. UNIQUE (vehicle_id) means there
 * is always exactly one current signal per vehicle, while snapshots are
 * append-only for history.
 */
export async function upsertVehicleMarketSignal(
  signal: VehicleMarketSignal,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const { query } = await import("@/lib/db");
    await query(
      `INSERT INTO vehicle_market_signals
         (vehicle_id, dealer_id, days_on_lot, market_velocity_days_median,
          our_price_cents, market_value_cents, price_delta_cents,
          recommendation, confidence, rationale, comparables_count, generated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (vehicle_id) DO UPDATE SET
         dealer_id                   = EXCLUDED.dealer_id,
         days_on_lot                 = EXCLUDED.days_on_lot,
         market_velocity_days_median = EXCLUDED.market_velocity_days_median,
         our_price_cents             = EXCLUDED.our_price_cents,
         market_value_cents          = EXCLUDED.market_value_cents,
         price_delta_cents           = EXCLUDED.price_delta_cents,
         recommendation              = EXCLUDED.recommendation,
         confidence                  = EXCLUDED.confidence,
         rationale                   = EXCLUDED.rationale,
         comparables_count           = EXCLUDED.comparables_count,
         generated_at                = EXCLUDED.generated_at,
         updated_at                  = NOW()`,
      [
        signal.vehicleId,
        signal.dealerId,
        signal.daysOnLot,
        signal.marketVelocityDaysMedian,
        signal.ourPriceCents,
        signal.marketValueCents,
        signal.priceDeltaCents,
        signal.recommendation,
        signal.confidence,
        signal.rationale,
        signal.comparablesCount,
        signal.generatedAt,
      ],
    );
  } catch (err) {
    console.error("[market-intel] upsertVehicleMarketSignal failed:", err);
  }
}

/* ------------------------------------------------------------------ */
/*  Triple-write side effects (Qdrant + Neo4j)                          */
/* ------------------------------------------------------------------ */

const QDRANT_COLLECTION = "vehicle_market_signals";
const QDRANT_VECTOR_DIM = 8;

/**
 * Tiny deterministic vector built from numeric signal features. Lets the
 * Qdrant collection support semantic "vehicles in a similar market posture"
 * queries without pulling in a heavyweight embedding model on every refresh.
 */
function signalToVector(signal: VehicleMarketSignal): number[] {
  const v = signal.marketValueCents || 1;
  return [
    signal.daysOnLot / 365,
    (signal.marketVelocityDaysMedian ?? 30) / 365,
    Math.tanh(signal.priceDeltaCents / v),
    Math.tanh(signal.marketValueCents / 5_000_000),
    Math.tanh(signal.ourPriceCents / 5_000_000),
    signal.confidence,
    signal.comparablesCount / 20,
    recommendationToFloat(signal.recommendation),
  ];
}

function recommendationToFloat(r: VehicleMarketSignal["recommendation"]): number {
  switch (r) {
    case "REPRICE_DOWN": return -1;
    case "MOVE_TO_BACK_LOT": return -0.5;
    case "HOLD": return 0;
    case "MOVE_TO_LOT_FRONT": return 0.5;
    case "REPRICE_UP": return 1;
  }
}

export async function tripleWriteMarketSignal(
  signal: VehicleMarketSignal,
  target: TargetVehicle,
): Promise<void> {
  // Qdrant: vector of the vehicle's market posture for similar-vehicle queries.
  if (process.env.QDRANT_URL) {
    try {
      const { upsertPoints, createCollection } = await import("@/lib/qdrant-client");
      await createCollection(QDRANT_COLLECTION, QDRANT_VECTOR_DIM);
      await upsertPoints(QDRANT_COLLECTION, [
        {
          id: hash32(`${target.vehicleId}:${signal.generatedAt}`),
          vector: signalToVector(signal),
          payload: {
            vehicle_id: target.vehicleId,
            dealer_id: target.dealerId,
            vin: target.vin,
            year: target.year,
            make: target.make,
            model: target.model,
            recommendation: signal.recommendation,
            confidence: signal.confidence,
            price_delta_cents: signal.priceDeltaCents,
            market_value_cents: signal.marketValueCents,
            our_price_cents: signal.ourPriceCents,
            days_on_lot: signal.daysOnLot,
            generated_at: signal.generatedAt,
          },
        },
      ]);
    } catch (err) {
      console.warn("[market-intel] Qdrant write failed:", err);
    }
  }

  // Neo4j: vehicle-to-comparable + vehicle-to-recommendation cluster edges.
  const neoUrl = process.env.NEO4J_URI || process.env.NEO4J_URL;
  if (neoUrl) {
    try {
      const { executeNeo4jQueries } = await import("@/lib/neo4j-client");
      await executeNeo4jQueries([
        {
          statement: `
            MERGE (v:Vehicle {id: $vehicleId})
              SET v.dealer_id = $dealerId,
                  v.vin       = $vin,
                  v.year      = $year,
                  v.make      = $make,
                  v.model     = $model
            MERGE (c:MarketCluster {name: $cluster})
            MERGE (v)-[r:HAS_MARKET_POSTURE]->(c)
              SET r.confidence        = $confidence,
                  r.recommendation    = $recommendation,
                  r.price_delta_cents = $priceDelta,
                  r.days_on_lot       = $daysOnLot,
                  r.generated_at      = datetime($generatedAt)
          `,
          parameters: {
            vehicleId: target.vehicleId,
            dealerId: target.dealerId,
            vin: target.vin,
            year: target.year,
            make: target.make,
            model: target.model,
            cluster: signal.recommendation,
            confidence: signal.confidence,
            recommendation: signal.recommendation,
            priceDelta: signal.priceDeltaCents,
            daysOnLot: signal.daysOnLot,
            generatedAt: signal.generatedAt,
          },
        },
      ]);
    } catch (err) {
      console.warn("[market-intel] Neo4j write failed:", err);
    }
  }
}

function hash32(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/* ------------------------------------------------------------------ */
/*  Analytics + audit fan-out                                          */
/* ------------------------------------------------------------------ */

/**
 * Emit every analytics event tied to a single market-intel refresh.
 * Fire-and-forget: each emit is wrapped so failures don't bubble.
 */
export function emitRefreshAnalytics(
  signal: VehicleMarketSignal,
  value: MarketValue | null,
  comparablesCount: number,
): void {
  try {
    trackInventoryMarketIntel(
      "inventory.market_signal_generated",
      signal.dealerId,
      {
        vehicle_id: signal.vehicleId,
        recommendation: signal.recommendation,
        confidence: signal.confidence,
        comparables_count: comparablesCount,
      },
    );
    trackInventoryMarketIntel("inventory.price_recommended", signal.dealerId, {
      vehicle_id: signal.vehicleId,
      recommendation: signal.recommendation,
      price_delta_cents: signal.priceDeltaCents,
      market_value_cents: signal.marketValueCents,
      our_price_cents: signal.ourPriceCents,
      days_on_lot: signal.daysOnLot,
    });
    // Keep the legacy `pricing.*` event firing so existing dashboards that
    // already chart pricing recommendations keep working.
    trackPricing("pricing.recommendations_generated", signal.dealerId, {
      vehicle_id: signal.vehicleId,
      recommendation: signal.recommendation,
      confidence: signal.confidence,
      price_delta_cents: signal.priceDeltaCents,
      comparables_count: comparablesCount,
    });
    if (value) {
      trackInventoryMarketIntel(
        "inventory.market_snapshot_captured",
        signal.dealerId,
        {
          vehicle_id: signal.vehicleId,
          market_value_cents: value.marketValueCents,
          source: value.source,
          is_mock: value.isMock,
        },
      );
    }
  } catch (err) {
    console.error("[market-intel] emitRefreshAnalytics failed:", err);
  }
}

export async function auditRefresh(
  signal: VehicleMarketSignal,
  userId: string | undefined,
  via: "api" | "cron",
): Promise<void> {
  await auditLog(
    "market_intel.refresh",
    {
      vehicle_id: signal.vehicleId,
      dealer_id: signal.dealerId,
      recommendation: signal.recommendation,
      confidence: signal.confidence,
      via,
    },
    userId,
    signal.dealerId,
  );
}
