/**
 * Auction Live Feed — wholesale-channel integration layer.
 *
 * Provides plug-replaceable adapters over auction houses (Manheim / Adesa /
 * ACV) plus a SimulatorAdapter that is the default in dev/test environments
 * (real adapters require credentials we don't ship in this repo).
 *
 * Two consumers downstream:
 *   1. Trade-in valuator → uses recent-sale benchmarks (p25/p50/p75) to refine
 *      the appraisal range. Exposed via getTradeBenchmark().
 *   2. Wholesale acquisition desk → scoreAcquisitionOpportunities() compares
 *      upcoming auction listings against the dealer's market retail and
 *      writes scored opportunities to auction_acquisition_opportunities.
 *
 * All DB writes are guarded so the module returns sensible defaults when
 * DATABASE_URL is unset (shadow mode). Triple-write fan-out is fire-and-forget
 * and never blocks the primary PG path.
 */

import { estimateMarketPrice, type VehicleCondition } from "@/lib/market-pricing";
import { trackServerEvent } from "@/lib/analytics";

/* ========================================================================== */
/*  Types                                                                      */
/* ========================================================================== */

export type AuctionSourceType = "manheim" | "adesa" | "acv" | "simulator";

export interface AuctionSourceRecord {
  id: string;
  name: string;
  type: AuctionSourceType;
  api_endpoint: string | null;
  active: boolean;
}

export interface AuctionListing {
  source_listing_id: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  mileage: number;
  condition_grade: number;
  reserve_price_cents: number | null;
  current_bid_cents: number | null;
  sale_price_cents: number | null;
  location: string | null;
  sale_at: string;
  status: "upcoming" | "live" | "sold" | "no_sale";
  payload?: Record<string, unknown>;
}

export interface AuctionAdapterPullResult {
  upcoming: AuctionListing[];
  results: AuctionListing[];
}

export interface AuctionSourceAdapter {
  readonly type: AuctionSourceType;
  pullUpcoming(): Promise<AuctionListing[]>;
  pullLiveResults(): Promise<AuctionListing[]>;
  verifySignature(payload: string, signature: string): boolean;
}

export interface SyncResult {
  source_id: string;
  source_type: AuctionSourceType;
  upserted: number;
  errors: number;
}

export interface ScoreResult {
  dealer_id: string;
  scored: number;
  inserted: number;
  updated: number;
}

export interface TradeBenchmark {
  vin_pattern: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  mileage_band: string;
  p25_cents: number;
  p50_cents: number;
  p75_cents: number;
  sample_size: number;
  last_updated_at: string;
}

/* ========================================================================== */
/*  VIN-pattern helpers                                                        */
/* ========================================================================== */

/**
 * Mileage bands for benchmark grouping. Banded so a 67k Camry compares against
 * peers in the 50–75k band rather than every Camry ever sold.
 */
export function mileageBand(mileage: number): string {
  if (mileage < 25_000) return "0-25k";
  if (mileage < 50_000) return "25-50k";
  if (mileage < 75_000) return "50-75k";
  if (mileage < 100_000) return "75-100k";
  if (mileage < 150_000) return "100-150k";
  return "150k+";
}

export function buildVinPattern(
  year: number,
  make: string,
  model: string,
  trim: string | null,
  mileage: number,
): string {
  const parts = [
    String(year),
    make.trim().toLowerCase(),
    model.trim().toLowerCase(),
    (trim ?? "").trim().toLowerCase(),
    mileageBand(mileage),
  ];
  return parts.join("|");
}

/* ========================================================================== */
/*  Adapters                                                                   */
/* ========================================================================== */

/**
 * Synthetic listings adapter — drives the entire feature without external
 * credentials. Generates a deterministic-ish set so tests can pin specific
 * VINs.
 */
export class SimulatorAdapter implements AuctionSourceAdapter {
  readonly type: AuctionSourceType = "simulator";

  constructor(private readonly seedListings?: AuctionListing[]) {}

  async pullUpcoming(): Promise<AuctionListing[]> {
    if (this.seedListings) {
      return this.seedListings.filter((l) => l.status === "upcoming" || l.status === "live");
    }
    return defaultSimulatorUpcoming();
  }

  async pullLiveResults(): Promise<AuctionListing[]> {
    if (this.seedListings) {
      return this.seedListings.filter((l) => l.status === "sold" || l.status === "no_sale");
    }
    return defaultSimulatorResults();
  }

  verifySignature(_payload: string, _signature: string): boolean {
    return true;
  }
}

class NotConfiguredAdapter implements AuctionSourceAdapter {
  constructor(public readonly type: AuctionSourceType) {}
  async pullUpcoming(): Promise<AuctionListing[]> {
    throw new Error(`${this.type} adapter not configured — credentials required`);
  }
  async pullLiveResults(): Promise<AuctionListing[]> {
    throw new Error(`${this.type} adapter not configured — credentials required`);
  }
  verifySignature(_payload: string, _signature: string): boolean {
    return false;
  }
}

/** Manheim adapter skeleton. Throws until credentials wired in. */
export class ManheimAdapter extends NotConfiguredAdapter {
  constructor() { super("manheim"); }
}

/** Adesa adapter skeleton. Throws until credentials wired in. */
export class AdesaAdapter extends NotConfiguredAdapter {
  constructor() { super("adesa"); }
}

/** ACV Auctions adapter skeleton. Throws until credentials wired in. */
export class AcvAdapter extends NotConfiguredAdapter {
  constructor() { super("acv"); }
}

export function adapterFor(type: AuctionSourceType): AuctionSourceAdapter {
  switch (type) {
    case "simulator": return new SimulatorAdapter();
    case "manheim":   return new ManheimAdapter();
    case "adesa":     return new AdesaAdapter();
    case "acv":       return new AcvAdapter();
  }
}

/* ========================================================================== */
/*  Default simulator data                                                     */
/* ========================================================================== */

function defaultSimulatorUpcoming(): AuctionListing[] {
  const base = Date.now() + 24 * 60 * 60 * 1000;
  return [
    {
      source_listing_id: "SIM-UP-1001",
      vin: "1HGCV1F34LA000001",
      year: 2021,
      make: "Honda",
      model: "Accord",
      trim: "EX",
      mileage: 42_000,
      condition_grade: 4.0,
      reserve_price_cents: 1_650_000,
      current_bid_cents: 1_500_000,
      sale_price_cents: null,
      location: "Pittsburgh PA",
      sale_at: new Date(base).toISOString(),
      status: "upcoming",
    },
    {
      source_listing_id: "SIM-UP-1002",
      vin: "5TFDY5F10LX000002",
      year: 2020,
      make: "Toyota",
      model: "Tundra",
      trim: "SR5",
      mileage: 68_000,
      condition_grade: 3.5,
      reserve_price_cents: 2_900_000,
      current_bid_cents: 2_700_000,
      sale_price_cents: null,
      location: "Atlanta GA",
      sale_at: new Date(base + 6 * 60 * 60 * 1000).toISOString(),
      status: "upcoming",
    },
    {
      source_listing_id: "SIM-UP-1003",
      vin: "3FA6P0HD0KR000003",
      year: 2022,
      make: "Ford",
      model: "F-150",
      trim: "XLT",
      mileage: 31_000,
      condition_grade: 4.5,
      reserve_price_cents: 3_400_000,
      current_bid_cents: 3_300_000,
      sale_price_cents: null,
      location: "Dallas TX",
      sale_at: new Date(base + 12 * 60 * 60 * 1000).toISOString(),
      status: "upcoming",
    },
  ];
}

function defaultSimulatorResults(): AuctionListing[] {
  const base = Date.now() - 5 * 24 * 60 * 60 * 1000;
  // 6 sold Accords with realistic spread → benchmark engine has sample_size>=5
  const accords: AuctionListing[] = [];
  const prices = [1_550_000, 1_600_000, 1_650_000, 1_700_000, 1_780_000, 1_820_000];
  for (let i = 0; i < prices.length; i++) {
    accords.push({
      source_listing_id: `SIM-RES-ACC-${i}`,
      vin: `1HGCV1F34LA10000${i}`,
      year: 2021,
      make: "Honda",
      model: "Accord",
      trim: "EX",
      mileage: 40_000 + i * 1_000,
      condition_grade: 4.0,
      reserve_price_cents: 1_500_000,
      current_bid_cents: prices[i],
      sale_price_cents: prices[i],
      location: "Pittsburgh PA",
      sale_at: new Date(base + i * 60 * 60 * 1000).toISOString(),
      status: "sold",
    });
  }
  return accords;
}

/* ========================================================================== */
/*  Sync                                                                       */
/* ========================================================================== */

/**
 * Pull from every active source, upsert listings, and refresh benchmarks.
 *
 * adapterOverride lets tests inject a SimulatorAdapter even when the DB row
 * lists a different type — production callers will pass undefined.
 */
export async function syncAllSources(
  adapterOverride?: AuctionSourceAdapter,
): Promise<SyncResult[]> {
  await trackServerEvent("auction.sync_started", {
    overridden: adapterOverride ? 1 : 0,
  });

  if (!process.env.DATABASE_URL) {
    await trackServerEvent("auction.sync_completed", {
      sources: 0,
      upserted: 0,
      reason: "no_database",
    });
    return [];
  }

  const { query } = await import("@/lib/db");
  const sources = await query<AuctionSourceRecord>(
    `SELECT id, name, type, api_endpoint, active
       FROM auction_sources
      WHERE active = TRUE`,
  );

  const results: SyncResult[] = [];

  for (const source of sources.rows) {
    const adapter = adapterOverride ?? adapterFor(source.type);
    let upserted = 0;
    let errors = 0;

    try {
      const upcoming = await adapter.pullUpcoming();
      const live = await adapter.pullLiveResults();
      const all = [...upcoming, ...live];

      for (const listing of all) {
        try {
          await query(
            `INSERT INTO auction_listings (
               source_id, source_listing_id, vin, year, make, model, trim,
               mileage, condition_grade, reserve_price_cents, current_bid_cents,
               sale_price_cents, location, sale_at, status, payload
             ) VALUES (
               $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
             )
             ON CONFLICT (source_id, source_listing_id) DO UPDATE
               SET status              = EXCLUDED.status,
                   current_bid_cents   = EXCLUDED.current_bid_cents,
                   sale_price_cents    = EXCLUDED.sale_price_cents,
                   payload             = EXCLUDED.payload,
                   updated_at          = NOW()`,
            [
              source.id, listing.source_listing_id, listing.vin, listing.year,
              listing.make, listing.model, listing.trim, listing.mileage,
              listing.condition_grade, listing.reserve_price_cents,
              listing.current_bid_cents, listing.sale_price_cents,
              listing.location, listing.sale_at, listing.status,
              JSON.stringify(listing.payload ?? {}),
            ],
          );
          upserted++;
        } catch (err) {
          errors++;
          console.error("[auction-feed] upsert failed:", err instanceof Error ? err.message : err);
        }
      }
    } catch (err) {
      errors++;
      console.error("[auction-feed] adapter pull failed:", err instanceof Error ? err.message : err);
    }

    results.push({
      source_id: source.id,
      source_type: source.type,
      upserted,
      errors,
    });
  }

  // Recompute benchmarks once all sources are sucked in.
  await recomputeBenchmarks();

  await trackServerEvent("auction.sync_completed", {
    sources: results.length,
    upserted: results.reduce((a, r) => a + r.upserted, 0),
    errors: results.reduce((a, r) => a + r.errors, 0),
  });

  return results;
}

/* ========================================================================== */
/*  Benchmarks                                                                 */
/* ========================================================================== */

const BENCHMARK_LOOKBACK_DAYS = 90;
const BENCHMARK_MIN_SAMPLE = 5;

/**
 * Aggregate sold listings within the lookback window into p25/p50/p75 tuples
 * keyed on (year, make, model, trim, mileage_band). Sample sizes below the
 * minimum are skipped — better no benchmark than a noisy one.
 */
export async function recomputeBenchmarks(): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;

  const { query } = await import("@/lib/db");

  const since = new Date(
    Date.now() - BENCHMARK_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const sales = await query<{
    year: number;
    make: string;
    model: string;
    trim: string | null;
    mileage: number;
    sale_price_cents: string | number;
  }>(
    `SELECT year, make, model, trim, mileage, sale_price_cents
       FROM auction_listings
      WHERE status = 'sold'
        AND sale_price_cents IS NOT NULL
        AND sale_at >= $1`,
    [since],
  );

  // Group by VIN pattern
  const groups = new Map<string, {
    year: number;
    make: string;
    model: string;
    trim: string | null;
    mileage_band: string;
    prices: number[];
  }>();

  for (const row of sales.rows) {
    const band = mileageBand(row.mileage);
    const pattern = buildVinPattern(row.year, row.make, row.model, row.trim, row.mileage);
    const price = Number(row.sale_price_cents);
    if (!Number.isFinite(price) || price <= 0) continue;
    const existing = groups.get(pattern);
    if (existing) {
      existing.prices.push(price);
    } else {
      groups.set(pattern, {
        year: row.year,
        make: row.make,
        model: row.model,
        trim: row.trim,
        mileage_band: band,
        prices: [price],
      });
    }
  }

  let written = 0;
  for (const [pattern, group] of groups.entries()) {
    if (group.prices.length < BENCHMARK_MIN_SAMPLE) continue;
    const sorted = [...group.prices].sort((a, b) => a - b);
    const p25 = percentile(sorted, 0.25);
    const p50 = percentile(sorted, 0.50);
    const p75 = percentile(sorted, 0.75);

    try {
      await query(
        `INSERT INTO auction_trade_benchmarks (
           vin_pattern, year, make, model, trim, mileage_band,
           p25_cents, p50_cents, p75_cents, sample_size, last_updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
         ON CONFLICT (vin_pattern) DO UPDATE
           SET p25_cents = EXCLUDED.p25_cents,
               p50_cents = EXCLUDED.p50_cents,
               p75_cents = EXCLUDED.p75_cents,
               sample_size = EXCLUDED.sample_size,
               last_updated_at = NOW()`,
        [
          pattern, group.year, group.make, group.model, group.trim,
          group.mileage_band, p25, p50, p75, group.prices.length,
        ],
      );
      written++;
    } catch (err) {
      console.error("[auction-feed] benchmark upsert failed:", err instanceof Error ? err.message : err);
    }
  }

  return written;
}

/** Lookup p25/p50/p75 for a given vehicle. Returns null when no benchmark. */
export async function getTradeBenchmark(
  year: number,
  make: string,
  model: string,
  trim: string | null,
  mileage: number,
): Promise<TradeBenchmark | null> {
  if (!process.env.DATABASE_URL) {
    return computeBenchmarkFromMemory(year, make, model, trim, mileage);
  }

  const { query } = await import("@/lib/db");
  const pattern = buildVinPattern(year, make, model, trim, mileage);

  const result = await query<TradeBenchmark>(
    `SELECT vin_pattern, year, make, model, trim, mileage_band,
            p25_cents, p50_cents, p75_cents, sample_size, last_updated_at
       FROM auction_trade_benchmarks
      WHERE vin_pattern = $1
      LIMIT 1`,
    [pattern],
  );

  if (result.rows.length > 0) return result.rows[0];

  // Fallback — same year/make/model, any trim/band
  const fallback = await query<TradeBenchmark>(
    `SELECT vin_pattern, year, make, model, trim, mileage_band,
            p25_cents, p50_cents, p75_cents, sample_size, last_updated_at
       FROM auction_trade_benchmarks
      WHERE year = $1 AND lower(make) = lower($2) AND lower(model) = lower($3)
      ORDER BY sample_size DESC
      LIMIT 1`,
    [year, make, model],
  );

  return fallback.rows[0] ?? null;
}

/**
 * In-memory fallback used when DATABASE_URL is unset (shadow/test). Returns a
 * synthetic benchmark derived from market-pricing so trade-in-valuator's
 * downstream consumers always have *something* to call against.
 */
function computeBenchmarkFromMemory(
  year: number,
  make: string,
  model: string,
  trim: string | null,
  mileage: number,
): TradeBenchmark {
  const condition: VehicleCondition = "good";
  const estimate = estimateMarketPrice(make, model, year, mileage, condition);
  const center = estimate.estimatedPrice * 100; // cents
  return {
    vin_pattern: buildVinPattern(year, make, model, trim, mileage),
    year, make, model, trim,
    mileage_band: mileageBand(mileage),
    p25_cents: Math.round(center * 0.92),
    p50_cents: Math.round(center),
    p75_cents: Math.round(center * 1.08),
    sample_size: 0,
    last_updated_at: new Date().toISOString(),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return Math.round(sorted[0]);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return Math.round(sorted[lo]);
  const frac = idx - lo;
  return Math.round(sorted[lo] * (1 - frac) + sorted[hi] * frac);
}

/* ========================================================================== */
/*  Acquisition opportunity scoring                                            */
/* ========================================================================== */

/**
 * Score upcoming listings against the dealer's market retail to identify
 * profitable wholesale buys. opportunity_score is a 0–100 number combining:
 *   * predicted gross (% of retail)
 *   * condition_grade (auction quality)
 *   * recency to sale (urgency)
 */
export async function scoreAcquisitionOpportunities(
  dealerId: string,
): Promise<ScoreResult> {
  const result: ScoreResult = {
    dealer_id: dealerId,
    scored: 0,
    inserted: 0,
    updated: 0,
  };

  if (!process.env.DATABASE_URL) {
    await trackServerEvent("auction.opportunities_scored", {
      dealer_id: dealerId,
      scored: 0,
      reason: "no_database",
    });
    return result;
  }

  const { query } = await import("@/lib/db");

  const upcoming = await query<{
    id: string;
    vin: string;
    year: number;
    make: string;
    model: string;
    trim: string | null;
    mileage: number;
    condition_grade: number | null;
    reserve_price_cents: string | number | null;
    current_bid_cents: string | number | null;
    sale_at: string;
  }>(
    `SELECT id, vin, year, make, model, trim, mileage, condition_grade,
            reserve_price_cents, current_bid_cents, sale_at
       FROM auction_listings
      WHERE status IN ('upcoming','live')
      ORDER BY sale_at ASC
      LIMIT 500`,
  );

  for (const lot of upcoming.rows) {
    const retail = estimateMarketPrice(
      lot.make, lot.model, lot.year, lot.mileage, "good",
    );
    const retailCents = retail.estimatedPrice * 100;
    const reserveCents = Number(lot.reserve_price_cents ?? lot.current_bid_cents ?? 0);
    if (retailCents <= 0) continue;

    const grossCents = retailCents - reserveCents;
    const grossPct = grossCents / retailCents;
    const condition = lot.condition_grade ?? 3.0;
    const conditionFactor = condition / 5;

    // Score: 60% gross margin, 40% condition. Floor 0, cap 100.
    let score = grossPct * 60 + conditionFactor * 40;
    score = Math.max(0, Math.min(100, score));
    const suggestedMaxBid = Math.round(retailCents * 0.85);

    const upsert = await query<{ inserted: boolean }>(
      `INSERT INTO auction_acquisition_opportunities (
         dealer_id, listing_id, opportunity_score, suggested_max_bid_cents,
         predicted_retail_cents, predicted_gross_cents, evidence, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'open')
       ON CONFLICT (dealer_id, listing_id) DO UPDATE
         SET opportunity_score       = EXCLUDED.opportunity_score,
             suggested_max_bid_cents = EXCLUDED.suggested_max_bid_cents,
             predicted_retail_cents  = EXCLUDED.predicted_retail_cents,
             predicted_gross_cents   = EXCLUDED.predicted_gross_cents,
             evidence                = EXCLUDED.evidence,
             updated_at              = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        dealerId, lot.id, Number(score.toFixed(2)),
        suggestedMaxBid, retailCents, grossCents,
        JSON.stringify({
          retail_estimate: retail,
          reserve_cents: reserveCents,
          condition_grade: condition,
        }),
      ],
    );

    result.scored++;
    if (upsert.rows[0]?.inserted) result.inserted++;
    else result.updated++;

    // Triple-write opportunity event (fire-and-forget).
    void writeOpportunityToSecondaryStores(dealerId, lot.id, score, retailCents).catch(() => {});
  }

  await trackServerEvent("auction.opportunities_scored", {
    dealer_id: dealerId,
    scored: result.scored,
    inserted: result.inserted,
    updated: result.updated,
  });

  return result;
}

async function writeOpportunityToSecondaryStores(
  dealerId: string,
  listingId: string,
  score: number,
  retailCents: number,
): Promise<void> {
  // Qdrant + Neo4j — best-effort. Wrap each in its own try so one failing
  // never stops the other. Module-import inside try keeps test envs clean.
  try {
    if (process.env.QDRANT_URL) {
      const { upsertPoints, createCollection } = await import("@/lib/qdrant-client");
      const COLL = "wolfpack_auction_opportunities";
      await createCollection(COLL, 4);
      await upsertPoints(COLL, [{
        id: hashId(`${dealerId}:${listingId}`),
        vector: [0, 0, 0, 0],
        payload: { dealer_id: dealerId, listing_id: listingId, score, retail_cents: retailCents },
      }]);
    }
  } catch (err) {
    console.warn("[auction-feed] qdrant write failed:", err instanceof Error ? err.message : err);
  }
  try {
    if (process.env.NEO4J_URI || process.env.NEO4J_URL) {
      const { executeNeo4jQueries } = await import("@/lib/neo4j-client");
      await executeNeo4jQueries([{
        statement: `MERGE (d:Dealer {id:$dealerId})
                    MERGE (l:AuctionListing {id:$listingId})
                    MERGE (d)-[r:CONSIDERS]->(l)
                    SET r.score = $score, r.retail_cents = $retail`,
        parameters: { dealerId, listingId, score, retail: retailCents },
      }]);
    }
  } catch (err) {
    console.warn("[auction-feed] neo4j write failed:", err instanceof Error ? err.message : err);
  }
}

function hashId(raw: string): number {
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/* ========================================================================== */
/*  Action handler                                                             */
/* ========================================================================== */

export type OpportunityAction = "bid" | "won" | "lost" | "dismiss";

const ACTION_TO_STATUS: Record<OpportunityAction, string> = {
  bid: "bidding",
  won: "won",
  lost: "lost",
  dismiss: "dismissed",
};

export async function handleOpportunityAction(
  dealerId: string,
  opportunityId: string,
  action: OpportunityAction,
): Promise<{ ok: boolean; status: string | null }> {
  const newStatus = ACTION_TO_STATUS[action];
  if (!newStatus) return { ok: false, status: null };

  if (!process.env.DATABASE_URL) {
    await trackServerEvent("auction.opportunity_action", {
      dealer_id: dealerId, opportunity_id: opportunityId, action, ok: 0,
    });
    return { ok: true, status: newStatus };
  }

  const { query } = await import("@/lib/db");
  const update = await query(
    `UPDATE auction_acquisition_opportunities
        SET status = $1, updated_at = NOW()
      WHERE id = $2 AND dealer_id = $3`,
    [newStatus, opportunityId, dealerId],
  );

  await trackServerEvent("auction.opportunity_action", {
    dealer_id: dealerId, opportunity_id: opportunityId, action,
    ok: update.rowCount ? 1 : 0,
  });

  return { ok: (update.rowCount ?? 0) > 0, status: newStatus };
}
