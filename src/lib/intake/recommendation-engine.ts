/**
 * Recommendation engine -- uses data stores for vehicle optimization.
 *
 * Three capabilities:
 *  1. Similar vehicles via Qdrant vector search
 *  2. Pricing recommendations via PostgreSQL comparables
 *  3. Inventory recommendations combining analytics + inventory data
 *
 * Every function degrades gracefully when a data store is unavailable.
 */

import { query } from "@/lib/db";
import { searchPoints, healthCheck, createCollection } from "@/lib/qdrant-client";
import { embedText, getVectorDimension } from "@/lib/embeddings";
import type { Vehicle } from "@/types/vehicle";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const VEHICLE_COLLECTION = "wolfpack_vehicles";
const SLOW_MOVER_DAYS = 60;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PricingRecommendation {
  suggested_price: number;
  market_position: "below" | "at" | "above";
  comparable_vehicles: Array<{
    vin: string;
    make: string;
    model: string;
    price: number;
  }>;
  reasoning: string;
}

export interface InventoryRecommendations {
  gaps: Array<{
    category: string;
    demand_signals: number;
    suggestion: string;
  }>;
  slow_movers: Array<{
    vin: string;
    days_on_lot: number;
    suggestion: string;
  }>;
  pricing_opportunities: Array<{
    vin: string;
    current_price: number;
    suggested_price: number;
    reasoning: string;
  }>;
}

/* ------------------------------------------------------------------ */
/*  1. Similar Vehicles (Qdrant vector search)                         */
/* ------------------------------------------------------------------ */

/**
 * Find vehicles similar to the given VIN using Qdrant vector similarity.
 *
 * Falls back to an empty array if Qdrant is unavailable.
 */
export async function getSimilarVehicles(
  vin: string,
  limit: number = 5,
): Promise<Partial<Vehicle>[]> {
  const healthy = await healthCheck();
  if (!healthy) return [];

  try {
    // Look up the vehicle to build a search query
    let searchText: string;

    try {
      const result = await query<{
        year: number;
        make: string;
        model: string;
        trim: string;
        body_style: string;
        exterior_color: string;
        fuel_type: string;
        drivetrain: string;
        price: number;
        features: string;
      }>(
        `SELECT year, make, model, trim, body_style, exterior_color,
                fuel_type, drivetrain, price, features
         FROM vehicles WHERE vin = $1 LIMIT 1`,
        [vin],
      );

      if (result.rows.length > 0) {
        const v = result.rows[0];
        const features = safeParseArray(v.features);
        searchText = [
          String(v.year),
          v.make,
          v.model,
          v.trim,
          v.body_style,
          v.exterior_color,
          v.fuel_type,
          v.drivetrain,
          `$${v.price}`,
          ...features,
        ].join(" ");
      } else {
        // Vehicle not in DB -- use VIN as search text
        searchText = vin;
      }
    } catch {
      searchText = vin;
    }

    const vector = await embedText(searchText);
    const results = await searchPoints(VEHICLE_COLLECTION, vector, limit + 1);

    // Filter out the source vehicle itself and map to Vehicle partials
    const vehicles: Partial<Vehicle>[] = [];
    for (const r of results) {
      const payload = r.payload;
      if (!payload) continue;

      const resultVin = String(payload.vin ?? "");
      if (resultVin === vin) continue;
      if (vehicles.length >= limit) break;

      vehicles.push({
        vin: resultVin,
        year: payload.year as number,
        make: payload.make as string,
        model: payload.model as string,
        trim: (payload.trim as string) ?? "",
        price: payload.price as number,
        mileage: (payload.mileage as number) ?? 0,
        exterior_color: (payload.exteriorColor as string) ?? (payload.exterior_color as string) ?? "",
        condition: (payload.condition as Vehicle["condition"]) ?? "used",
      });
    }

    return vehicles;
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  2. Pricing Recommendation (PostgreSQL comparables)                 */
/* ------------------------------------------------------------------ */

/**
 * Analyse comparable vehicles in the database to recommend a price.
 *
 * Comparables: same make/model, year +/- 2, mileage +/- 20K.
 */
export async function getPricingRecommendation(
  vehicle: Partial<Vehicle>,
): Promise<PricingRecommendation> {
  const defaultResult: PricingRecommendation = {
    suggested_price: vehicle.price ?? 0,
    market_position: "at",
    comparable_vehicles: [],
    reasoning: "Insufficient comparable vehicles to generate a recommendation.",
  };

  if (!vehicle.make || !vehicle.model || !vehicle.year || !vehicle.price) {
    return defaultResult;
  }

  try {
    const yearMin = vehicle.year - 2;
    const yearMax = vehicle.year + 2;
    const mileage = vehicle.mileage ?? 0;
    const mileageMin = Math.max(0, mileage - 20_000);
    const mileageMax = mileage + 20_000;

    const result = await query<{
      vin: string;
      make: string;
      model: string;
      price: number;
      year: number;
      mileage: number;
    }>(
      `SELECT vin, make, model, price, year, mileage
       FROM vehicles
       WHERE LOWER(make) = LOWER($1)
         AND LOWER(model) = LOWER($2)
         AND year BETWEEN $3 AND $4
         AND mileage BETWEEN $5 AND $6
         AND status = 'available'
         AND vin != $7
       ORDER BY ABS(year - $8) ASC, ABS(mileage - $9) ASC
       LIMIT 10`,
      [
        vehicle.make,
        vehicle.model,
        yearMin,
        yearMax,
        mileageMin,
        mileageMax,
        vehicle.vin ?? "",
        vehicle.year,
        mileage,
      ],
    );

    const comparables = result.rows;

    if (comparables.length < 2) {
      return defaultResult;
    }

    const prices = comparables.map((c) => c.price);
    const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const medianPrice = prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)];

    // Weight median more heavily than mean to reduce outlier influence
    const suggestedPrice = Math.round((medianPrice * 0.6 + avgPrice * 0.4) / 100) * 100;

    const priceDiffPct = ((vehicle.price - suggestedPrice) / suggestedPrice) * 100;
    let market_position: "below" | "at" | "above";
    if (priceDiffPct < -5) {
      market_position = "below";
    } else if (priceDiffPct > 5) {
      market_position = "above";
    } else {
      market_position = "at";
    }

    const reasoning = buildPricingReasoning(
      vehicle,
      suggestedPrice,
      market_position,
      comparables.length,
    );

    return {
      suggested_price: suggestedPrice,
      market_position,
      comparable_vehicles: comparables.slice(0, 5).map((c) => ({
        vin: c.vin,
        make: c.make,
        model: c.model,
        price: c.price,
      })),
      reasoning,
    };
  } catch {
    return defaultResult;
  }
}

function buildPricingReasoning(
  vehicle: Partial<Vehicle>,
  suggested: number,
  position: "below" | "at" | "above",
  comparableCount: number,
): string {
  const price = vehicle.price ?? 0;
  const diff = Math.abs(price - suggested);

  if (position === "at") {
    return `Your price of $${price.toLocaleString()} is in line with the market. Based on ${comparableCount} comparable ${vehicle.make} ${vehicle.model} vehicles, the suggested price is $${suggested.toLocaleString()}.`;
  }

  if (position === "below") {
    return `Your price of $${price.toLocaleString()} is $${diff.toLocaleString()} below market average. Based on ${comparableCount} comparable vehicles, consider raising to $${suggested.toLocaleString()} to maximize margin.`;
  }

  return `Your price of $${price.toLocaleString()} is $${diff.toLocaleString()} above market average. Based on ${comparableCount} comparable vehicles, consider adjusting to $${suggested.toLocaleString()} for faster turnover.`;
}

/* ------------------------------------------------------------------ */
/*  3. Inventory Recommendations (analytics + inventory data)          */
/* ------------------------------------------------------------------ */

/**
 * Generate inventory optimization recommendations for a dealer.
 *
 * Combines:
 *  - Search behaviour data (what shoppers are looking for)
 *  - Current inventory (what you have)
 *  - Time on lot (what is not selling)
 */
export async function getInventoryRecommendations(
  dealerId: string,
): Promise<InventoryRecommendations> {
  const [gaps, slowMovers, pricingOps] = await Promise.all([
    detectInventoryGaps(dealerId),
    findSlowMovers(dealerId),
    findPricingOpportunities(dealerId),
  ]);

  return {
    gaps,
    slow_movers: slowMovers,
    pricing_opportunities: pricingOps,
  };
}

/* ------------------------------------------------------------------ */
/*  Gap detection                                                      */
/* ------------------------------------------------------------------ */

/**
 * Detect inventory gaps by comparing search demand against current stock.
 *
 * Looks at recent search queries (analytics_events) and compares them
 * against available inventory body styles and makes.
 */
async function detectInventoryGaps(
  dealerId: string,
): Promise<Array<{ category: string; demand_signals: number; suggestion: string }>> {
  try {
    // Popular body styles searched but underrepresented in inventory
    const searchDemand = await query<{ category: string; searches: string }>(
      `SELECT
         COALESCE(metadata->>'body_style', metadata->>'search_category', 'unknown') AS category,
         COUNT(*)::text AS searches
       FROM analytics_events
       WHERE event_type = 'search'
         AND timestamp > NOW() - INTERVAL '30 days'
       GROUP BY category
       ORDER BY COUNT(*) DESC
       LIMIT 10`,
      [],
    );

    const inventoryCount = await query<{ body_style: string; count: string }>(
      `SELECT body_style, COUNT(*)::text AS count
       FROM vehicles
       WHERE dealer_id = $1 AND status = 'available'
       GROUP BY body_style`,
      [dealerId],
    );

    const stockMap = new Map<string, number>();
    for (const row of inventoryCount.rows) {
      stockMap.set(row.body_style.toLowerCase(), parseInt(row.count, 10));
    }

    const gaps: Array<{ category: string; demand_signals: number; suggestion: string }> = [];

    for (const row of searchDemand.rows) {
      const category = row.category;
      if (category === "unknown") continue;
      const searches = parseInt(row.searches, 10);
      const inStock = stockMap.get(category.toLowerCase()) ?? 0;

      // High demand, low stock
      if (searches > 5 && inStock < 3) {
        gaps.push({
          category,
          demand_signals: searches,
          suggestion: `${searches} searches for "${category}" in the last 30 days but only ${inStock} in stock. Consider acquiring more ${category} inventory.`,
        });
      }
    }

    return gaps;
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Slow movers                                                        */
/* ------------------------------------------------------------------ */

async function findSlowMovers(
  dealerId: string,
): Promise<Array<{ vin: string; days_on_lot: number; suggestion: string }>> {
  try {
    const result = await query<{
      vin: string;
      make: string;
      model: string;
      year: number;
      price: number;
      days_on_lot: number;
    }>(
      `SELECT
         vin, make, model, year, price,
         EXTRACT(EPOCH FROM (NOW() - created_at))::int / 86400 AS days_on_lot
       FROM vehicles
       WHERE dealer_id = $1
         AND status = 'available'
         AND EXTRACT(EPOCH FROM (NOW() - created_at))::int / 86400 > $2
       ORDER BY days_on_lot DESC
       LIMIT 10`,
      [dealerId, SLOW_MOVER_DAYS],
    );

    return result.rows.map((v) => {
      const priceCut = Math.round(v.price * 0.05 / 100) * 100;
      return {
        vin: v.vin,
        days_on_lot: v.days_on_lot,
        suggestion: `${v.year} ${v.make} ${v.model} has been on the lot for ${v.days_on_lot} days. Consider a $${priceCut.toLocaleString()} price reduction or feature in promotions.`,
      };
    });
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Pricing opportunities                                              */
/* ------------------------------------------------------------------ */

async function findPricingOpportunities(
  dealerId: string,
): Promise<Array<{ vin: string; current_price: number; suggested_price: number; reasoning: string }>> {
  try {
    // Find vehicles priced significantly different from comparable inventory
    const result = await query<{
      vin: string;
      make: string;
      model: string;
      year: number;
      price: number;
      mileage: number;
      avg_comparable_price: number;
    }>(
      `WITH comparables AS (
         SELECT
           v1.vin,
           v1.make,
           v1.model,
           v1.year,
           v1.price,
           v1.mileage,
           AVG(v2.price) AS avg_comparable_price
         FROM vehicles v1
         JOIN vehicles v2
           ON LOWER(v1.make) = LOWER(v2.make)
           AND LOWER(v1.model) = LOWER(v2.model)
           AND v2.year BETWEEN v1.year - 2 AND v1.year + 2
           AND v2.vin != v1.vin
           AND v2.status = 'available'
         WHERE v1.dealer_id = $1
           AND v1.status = 'available'
         GROUP BY v1.vin, v1.make, v1.model, v1.year, v1.price, v1.mileage
         HAVING COUNT(v2.vin) >= 2
       )
       SELECT *
       FROM comparables
       WHERE ABS(price - avg_comparable_price) / avg_comparable_price > 0.10
       ORDER BY ABS(price - avg_comparable_price) DESC
       LIMIT 10`,
      [dealerId],
    );

    return result.rows.map((v) => {
      const suggested = Math.round(v.avg_comparable_price / 100) * 100;
      const direction = v.price > suggested ? "above" : "below";
      return {
        vin: v.vin,
        current_price: v.price,
        suggested_price: suggested,
        reasoning: `${v.year} ${v.make} ${v.model} is priced ${direction} market average ($${suggested.toLocaleString()}) based on ${v.year - 2}-${v.year + 2} comparables.`,
      };
    });
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function safeParseArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}
