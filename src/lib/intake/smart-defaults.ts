/**
 * Smart defaults — reduces form filling by suggesting values based on
 * existing inventory, vehicle specs, and dealer patterns.
 *
 * Queries PostgreSQL for similar vehicles at the same dealer to derive
 * price suggestions, common features, and appropriate condition/status.
 */

import { query } from "@/lib/db";
import { generateListing } from "@/lib/intake/listing-generator";
import type { Vehicle, VehicleCondition, VehicleStatus } from "@/types/vehicle";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SmartDefaults {
  suggested_price: number | null;
  suggested_features: string[];
  suggested_description: string;
  suggested_condition: VehicleCondition;
  suggested_status: VehicleStatus;
  confidence: number;
}

/* ------------------------------------------------------------------ */
/*  Similar vehicle query                                              */
/* ------------------------------------------------------------------ */

interface SimilarVehicleRow {
  [key: string]: unknown;
  price: number;
  features: string[] | string;
  description: string;
  mileage: number;
  year: number;
}

async function findSimilarVehicles(
  make: string,
  model: string,
  year: number,
  dealerId: string,
): Promise<SimilarVehicleRow[]> {
  try {
    const result = await query<SimilarVehicleRow>(
      `SELECT price, features, description, mileage, year
       FROM vehicles
       WHERE dealer_id = $1
         AND LOWER(make) = LOWER($2)
         AND LOWER(model) = LOWER($3)
         AND year BETWEEN $4 AND $5
         AND status != 'sold'
       ORDER BY ABS(year - $6), created_at DESC
       LIMIT 10`,
      [dealerId, make, model, year - 2, year + 2, year],
    );
    return result.rows;
  } catch {
    // Database unavailable — return empty set
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Price suggestion                                                   */
/* ------------------------------------------------------------------ */

function suggestPrice(similar: SimilarVehicleRow[]): number | null {
  if (similar.length === 0) return null;

  const prices = similar
    .map((v) => v.price)
    .filter((p) => p > 0)
    .sort((a, b) => a - b);

  if (prices.length === 0) return null;

  // Median price
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 === 0
    ? Math.round((prices[mid - 1] + prices[mid]) / 2)
    : prices[mid];
}

/* ------------------------------------------------------------------ */
/*  Feature aggregation                                                */
/* ------------------------------------------------------------------ */

function suggestFeatures(similar: SimilarVehicleRow[]): string[] {
  if (similar.length === 0) return [];

  const featureCounts = new Map<string, number>();

  for (const vehicle of similar) {
    const features = Array.isArray(vehicle.features)
      ? vehicle.features
      : typeof vehicle.features === "string"
        ? JSON.parse(vehicle.features) as string[]
        : [];

    for (const feature of features) {
      const normalized = feature.trim();
      if (normalized) {
        featureCounts.set(normalized, (featureCounts.get(normalized) ?? 0) + 1);
      }
    }
  }

  // Return features that appear in at least 30% of similar vehicles
  const threshold = Math.max(1, Math.floor(similar.length * 0.3));
  return Array.from(featureCounts.entries())
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([feature]) => feature);
}

/* ------------------------------------------------------------------ */
/*  Condition inference                                                */
/* ------------------------------------------------------------------ */

function inferCondition(year: number | undefined, mileage: number | undefined): VehicleCondition {
  const currentYear = new Date().getFullYear();

  if (year && (year === currentYear || year === currentYear + 1)) {
    // Current or next model year with very low or no mileage is likely new
    if (!mileage || mileage < 200) {
      return "new";
    }
  }

  return "used";
}

/* ------------------------------------------------------------------ */
/*  Confidence scoring                                                 */
/* ------------------------------------------------------------------ */

function calculateConfidence(similar: SimilarVehicleRow[], partial: Partial<Vehicle>): number {
  let score = 0;

  // More similar vehicles = higher confidence
  if (similar.length >= 5) score += 0.4;
  else if (similar.length >= 3) score += 0.3;
  else if (similar.length >= 1) score += 0.15;

  // More input data = higher confidence
  if (partial.make) score += 0.1;
  if (partial.model) score += 0.1;
  if (partial.year) score += 0.1;
  if (partial.trim) score += 0.05;
  if (partial.mileage) score += 0.05;
  if (partial.engine) score += 0.05;
  if (partial.drivetrain) score += 0.05;
  if (partial.fuel_type) score += 0.05;
  if (partial.body_style) score += 0.05;

  return Math.min(1, Math.round(score * 100) / 100);
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Generate intelligent defaults for a partially-filled vehicle record.
 *
 * Queries the dealer's existing inventory for similar vehicles to suggest
 * pricing, features, description, condition, and status. Uses the listing
 * generator for AI or template-based description generation.
 *
 * @param partial  Partially-filled vehicle data (from VIN decode or manual entry)
 * @param dealerId Dealer identifier for scoping similar vehicle queries
 */
export async function getSmartDefaults(
  partial: Partial<Vehicle>,
  dealerId: string,
): Promise<SmartDefaults> {
  // Find similar vehicles at this dealer
  const similar =
    partial.make && partial.model && partial.year
      ? await findSimilarVehicles(partial.make, partial.model, partial.year, dealerId)
      : [];

  // Price suggestion from similar vehicles
  const suggested_price = suggestPrice(similar);

  // Common features across similar vehicles
  const suggested_features = suggestFeatures(similar);

  // Merge suggested features into partial for better description generation
  const enriched: Partial<Vehicle> = {
    ...partial,
    features:
      partial.features && partial.features.length > 0
        ? partial.features
        : suggested_features.slice(0, 8),
    price: partial.price ?? suggested_price ?? 0,
  };

  // Generate listing description
  const listing = await generateListing(enriched);
  const suggested_description = listing.description;

  // Condition and status
  const suggested_condition = inferCondition(partial.year, partial.mileage);
  const suggested_status: VehicleStatus = "available";

  // Confidence score
  const confidence = calculateConfidence(similar, partial);

  return {
    suggested_price,
    suggested_features,
    suggested_description,
    suggested_condition,
    suggested_status,
    confidence,
  };
}
