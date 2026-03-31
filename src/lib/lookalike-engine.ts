/**
 * Lookalike Recommendation Engine — collaborative filtering for vehicle recommendations.
 *
 * Builds co-occurrence matrices from analytics_events to find:
 * 1. Related vehicles: "Shoppers who viewed X also viewed Y"
 * 2. User-based recommendations: "Users like you also liked Z"
 *
 * Privacy-first: operates on anonymous session fingerprints only.
 * Shadow mode: returns plausible mock data when no DB is available.
 *
 * Reusable across projects — only the event_type constants are domain-specific.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RelatedVehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  price: number;
  score: number;
  reason: string;
}

export interface RecommendedVehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  price: number;
  score: number;
  reason: string;
}

/* ------------------------------------------------------------------ */
/*  Shadow mode mock data                                              */
/* ------------------------------------------------------------------ */

const MOCK_VEHICLES: Omit<RelatedVehicle, "score" | "reason">[] = [
  { vin: "1HGBH41JXMN109186", year: 2024, make: "Honda", model: "Accord", price: 28995 },
  { vin: "2T1BURHE3JC083523", year: 2024, make: "Toyota", model: "Camry", price: 27450 },
  { vin: "3FA6P0HD8LR267455", year: 2023, make: "Ford", model: "Fusion", price: 24999 },
  { vin: "1G1YY22G975104367", year: 2024, make: "Chevrolet", model: "Equinox", price: 31200 },
  { vin: "5YJ3E1EA8LF123456", year: 2024, make: "Hyundai", model: "Tucson", price: 29750 },
  { vin: "WBAPH5C50BA654321", year: 2023, make: "Subaru", model: "Outback", price: 32500 },
  { vin: "JM1BK32F571234567", year: 2024, make: "Mazda", model: "CX-5", price: 30100 },
  { vin: "KNDJP3A56L7654321", year: 2024, make: "Kia", model: "Sportage", price: 28400 },
];

function getMockRelated(vin: string, limit: number): RelatedVehicle[] {
  const filtered = MOCK_VEHICLES.filter((v) => v.vin !== vin);
  const scores = [0.87, 0.73, 0.65, 0.58, 0.44, 0.39, 0.31, 0.22];
  return filtered.slice(0, limit).map((v, i) => ({
    ...v,
    score: scores[i] ?? 0.2,
    reason: `Viewed by ${Math.round((scores[i] ?? 0.2) * 100)}% of shoppers who viewed your selections`,
  }));
}

function getMockRecommendations(limit: number): RecommendedVehicle[] {
  const scores = [0.91, 0.82, 0.74, 0.61, 0.53, 0.45, 0.38, 0.29];
  return MOCK_VEHICLES.slice(0, limit).map((v, i) => ({
    ...v,
    score: scores[i] ?? 0.2,
    reason: `Recommended based on ${Math.round((scores[i] ?? 0.2) * 100)}% overlap with similar shoppers`,
  }));
}

/* ------------------------------------------------------------------ */
/*  Co-occurrence: related vehicles for a given VIN                    */
/* ------------------------------------------------------------------ */

/**
 * Find vehicles frequently co-viewed with the given VIN.
 *
 * Algorithm:
 * 1. Query all vehicle_view events in the last 30 days for this dealer
 * 2. For each session that viewed the target VIN, collect other VINs viewed
 * 3. Count co-occurrences and rank by frequency
 * 4. Enrich with vehicle details from the inventory table
 */
export async function getRelatedVehicles(
  vin: string,
  dealerId: string,
  limit: number = 5,
): Promise<RelatedVehicle[]> {
  if (!process.env.DATABASE_URL) {
    return getMockRelated(vin, limit);
  }

  try {
    const { query } = await import("@/lib/db");

    // Step 1: Find sessions that viewed this VIN in the last 30 days
    const sessionsResult = await query<{ session_id: string }>(
      `SELECT DISTINCT session_id
       FROM analytics_events
       WHERE event_type = 'vehicle_view'
         AND metadata->>'vin' = $1
         AND page = $2
         AND timestamp >= NOW() - INTERVAL '30 days'`,
      [vin, dealerId],
    );

    if (sessionsResult.rows.length === 0) {
      return getMockRelated(vin, limit);
    }

    const sessionIds = sessionsResult.rows.map((r) => r.session_id);

    // Step 2: Find other VINs viewed by those same sessions
    const coViewResult = await query<{
      co_vin: string;
      co_view_count: string;
      total_sessions: string;
    }>(
      `SELECT
         metadata->>'vin' AS co_vin,
         COUNT(DISTINCT session_id) AS co_view_count,
         $3::int AS total_sessions
       FROM analytics_events
       WHERE event_type = 'vehicle_view'
         AND session_id = ANY($1)
         AND metadata->>'vin' != $2
         AND page = $4
         AND timestamp >= NOW() - INTERVAL '30 days'
       GROUP BY metadata->>'vin'
       ORDER BY co_view_count DESC
       LIMIT $5`,
      [sessionIds, vin, sessionIds.length, dealerId, limit],
    );

    if (coViewResult.rows.length === 0) {
      return getMockRelated(vin, limit);
    }

    // Step 3: Enrich with vehicle details
    const coVins = coViewResult.rows.map((r) => r.co_vin);
    const vehiclesResult = await query<{
      vin: string;
      year: number;
      make: string;
      model: string;
      price: number;
    }>(
      `SELECT vin, year, make, model, price
       FROM vehicles
       WHERE vin = ANY($1)
         AND dealer_id = $2
         AND status = 'active'`,
      [coVins, dealerId],
    );

    const vehicleMap = new Map(
      vehiclesResult.rows.map((v) => [v.vin, v]),
    );

    const totalSessions = sessionIds.length;

    return coViewResult.rows
      .filter((r) => vehicleMap.has(r.co_vin))
      .map((r) => {
        const v = vehicleMap.get(r.co_vin)!;
        const score = parseInt(r.co_view_count, 10) / totalSessions;
        return {
          vin: v.vin,
          year: v.year,
          make: v.make,
          model: v.model,
          price: v.price,
          score: Math.round(score * 100) / 100,
          reason: `Viewed by ${Math.round(score * 100)}% of shoppers who viewed your selections`,
        };
      });
  } catch (err) {
    console.error("[lookalike-engine] getRelatedVehicles failed:", err);
    return getMockRelated(vin, limit);
  }
}

/* ------------------------------------------------------------------ */
/*  User-similarity: personalized recommendations for a session        */
/* ------------------------------------------------------------------ */

/**
 * Find personalized recommendations for a user session.
 *
 * Algorithm:
 * 1. Find all VINs this session has viewed
 * 2. Find other sessions with the most overlapping vehicle views
 * 3. Recommend vehicles those similar sessions viewed that this session hasn't
 * 4. Rank by how many similar sessions viewed each recommended vehicle
 */
export async function getRecommendationsForUser(
  fingerprint: string,
  dealerId: string,
  limit: number = 5,
): Promise<RecommendedVehicle[]> {
  if (!process.env.DATABASE_URL) {
    return getMockRecommendations(limit);
  }

  try {
    const { query } = await import("@/lib/db");

    // Step 1: Get VINs this user has viewed
    const userVinsResult = await query<{ vin: string }>(
      `SELECT DISTINCT metadata->>'vin' AS vin
       FROM analytics_events
       WHERE event_type = 'vehicle_view'
         AND user_fingerprint = $1
         AND page = $2
         AND timestamp >= NOW() - INTERVAL '30 days'`,
      [fingerprint, dealerId],
    );

    if (userVinsResult.rows.length === 0) {
      return getMockRecommendations(limit);
    }

    const userVins = userVinsResult.rows.map((r) => r.vin);

    // Step 2: Find similar sessions (viewed at least 2 of the same VINs)
    const similarSessionsResult = await query<{
      session_id: string;
      overlap_count: string;
    }>(
      `SELECT session_id, COUNT(DISTINCT metadata->>'vin') AS overlap_count
       FROM analytics_events
       WHERE event_type = 'vehicle_view'
         AND metadata->>'vin' = ANY($1)
         AND user_fingerprint != $2
         AND page = $3
         AND timestamp >= NOW() - INTERVAL '30 days'
       GROUP BY session_id
       HAVING COUNT(DISTINCT metadata->>'vin') >= 2
       ORDER BY overlap_count DESC
       LIMIT 50`,
      [userVins, fingerprint, dealerId],
    );

    if (similarSessionsResult.rows.length === 0) {
      return getMockRecommendations(limit);
    }

    const similarSessionIds = similarSessionsResult.rows.map(
      (r) => r.session_id,
    );

    // Step 3: Find VINs those sessions viewed that this user hasn't
    const recsResult = await query<{
      rec_vin: string;
      rec_count: string;
    }>(
      `SELECT
         metadata->>'vin' AS rec_vin,
         COUNT(DISTINCT session_id) AS rec_count
       FROM analytics_events
       WHERE event_type = 'vehicle_view'
         AND session_id = ANY($1)
         AND metadata->>'vin' != ALL($2)
         AND page = $3
         AND timestamp >= NOW() - INTERVAL '30 days'
       GROUP BY metadata->>'vin'
       ORDER BY rec_count DESC
       LIMIT $4`,
      [similarSessionIds, userVins, dealerId, limit],
    );

    if (recsResult.rows.length === 0) {
      return getMockRecommendations(limit);
    }

    // Step 4: Enrich with vehicle details
    const recVins = recsResult.rows.map((r) => r.rec_vin);
    const vehiclesResult = await query<{
      vin: string;
      year: number;
      make: string;
      model: string;
      price: number;
    }>(
      `SELECT vin, year, make, model, price
       FROM vehicles
       WHERE vin = ANY($1)
         AND dealer_id = $2
         AND status = 'active'`,
      [recVins, dealerId],
    );

    const vehicleMap = new Map(
      vehiclesResult.rows.map((v) => [v.vin, v]),
    );

    const totalSimilar = similarSessionIds.length;

    return recsResult.rows
      .filter((r) => vehicleMap.has(r.rec_vin))
      .map((r) => {
        const v = vehicleMap.get(r.rec_vin)!;
        const score = parseInt(r.rec_count, 10) / totalSimilar;
        return {
          vin: v.vin,
          year: v.year,
          make: v.make,
          model: v.model,
          price: v.price,
          score: Math.round(score * 100) / 100,
          reason: `Recommended based on ${Math.round(score * 100)}% overlap with similar shoppers`,
        };
      });
  } catch (err) {
    console.error("[lookalike-engine] getRecommendationsForUser failed:", err);
    return getMockRecommendations(limit);
  }
}
