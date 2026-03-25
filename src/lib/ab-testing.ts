/**
 * Zero-dependency A/B testing engine.
 *
 * - Deterministic variant assignment via FNV-1a hash (same visitor always
 *   gets the same variant).
 * - Stores counts in Redis for speed with periodic flush to PostgreSQL.
 * - Falls back to an in-memory Map when Redis is unavailable.
 * - Statistical significance via chi-squared test — no external stats lib.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Variant = "a" | "b";

export interface TestResults {
  test_name: string;
  variant_a_views: number;
  variant_a_conversions: number;
  variant_b_views: number;
  variant_b_conversions: number;
  winner: Variant | null;
  confidence: number; // 0-1
}

// ---------------------------------------------------------------------------
// Deterministic hashing (FNV-1a, 32-bit)
// ---------------------------------------------------------------------------

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0; // multiply and stay unsigned 32-bit
  }
  return hash;
}

/**
 * Deterministic variant assignment: hashes `testName + visitorId` and maps
 * the result to "a" (even) or "b" (odd). Perfectly 50/50 over a large
 * population because FNV-1a distributes evenly across all bits.
 */
export function getVariant(testName: string, visitorId: string): Variant {
  const hash = fnv1a(`${testName}:${visitorId}`);
  return hash % 2 === 0 ? "a" : "b";
}

// ---------------------------------------------------------------------------
// Storage abstraction (Redis with in-memory fallback)
// ---------------------------------------------------------------------------

const REDIS_PREFIX = "wolfpack:ab:";

/** In-memory fallback for dev / single-instance deploys. */
const memStore = new Map<string, number>();

function redisKey(test: string, variant: Variant, type: "views" | "conv"): string {
  return `${REDIS_PREFIX}${test}:${variant}:${type}`;
}

async function getRedis(): Promise<import("ioredis").default | null> {
  try {
    const { redis } = await import("@/lib/redis");
    // Quick connectivity check — if Redis is unreachable, ioredis will throw.
    await redis.ping();
    return redis;
  } catch {
    return null;
  }
}

async function increment(key: string): Promise<void> {
  const r = await getRedis();
  if (r) {
    await r.incr(key);
  } else {
    memStore.set(key, (memStore.get(key) ?? 0) + 1);
  }
}

async function getCount(key: string): Promise<number> {
  const r = await getRedis();
  if (r) {
    const val = await r.get(key);
    return val ? parseInt(val, 10) : 0;
  }
  return memStore.get(key) ?? 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record an impression for the visitor's assigned variant.
 */
export async function trackImpression(
  testName: string,
  visitorId: string,
): Promise<Variant> {
  const variant = getVariant(testName, visitorId);
  await increment(redisKey(testName, variant, "views"));
  return variant;
}

/**
 * Record a conversion event for the visitor's assigned variant.
 */
export async function trackConversion(
  testName: string,
  visitorId: string,
): Promise<void> {
  const variant = getVariant(testName, visitorId);
  await increment(redisKey(testName, variant, "conv"));
}

/**
 * Retrieve aggregated results for a test including statistical significance.
 */
export async function getTestResults(testName: string): Promise<TestResults> {
  const [aViews, aConv, bViews, bConv] = await Promise.all([
    getCount(redisKey(testName, "a", "views")),
    getCount(redisKey(testName, "a", "conv")),
    getCount(redisKey(testName, "b", "views")),
    getCount(redisKey(testName, "b", "conv")),
  ]);

  const { winner, confidence } = chiSquaredTest(aViews, aConv, bViews, bConv);

  return {
    test_name: testName,
    variant_a_views: aViews,
    variant_a_conversions: aConv,
    variant_b_views: bViews,
    variant_b_conversions: bConv,
    winner,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// PostgreSQL flush (call periodically from a cron or background job)
// ---------------------------------------------------------------------------

/**
 * Flush current Redis counts into the PostgreSQL `ab_tests` table.
 * Useful for durability — call from a scheduled job.
 */
export async function flushToPostgres(
  testName: string,
  dealerId: string,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const results = await getTestResults(testName);

  try {
    const { query } = await import("@/lib/db");
    await query(
      `INSERT INTO ab_tests (dealer_id, test_name, variant_a, variant_b, conversions_a, conversions_b, winner, status)
       VALUES ($1, $2, 'a', 'b', $3, $4, $5, $6)
       ON CONFLICT (dealer_id, test_name)
       WHERE status = 'running'
       DO UPDATE SET
         conversions_a = EXCLUDED.conversions_a,
         conversions_b = EXCLUDED.conversions_b,
         winner        = EXCLUDED.winner,
         status        = EXCLUDED.status,
         ended_at      = CASE WHEN EXCLUDED.status = 'completed' THEN now() ELSE NULL END`,
      [
        dealerId,
        testName,
        results.variant_a_conversions,
        results.variant_b_conversions,
        results.winner,
        results.winner ? "completed" : "running",
      ],
    );
  } catch (err) {
    console.error("[ab-testing] Postgres flush failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Chi-squared test (pure math, zero dependencies)
// ---------------------------------------------------------------------------

/**
 * 2x2 chi-squared test for independence.
 *
 * Layout:
 *          Converted    Not Converted
 *   A      aConv        aViews-aConv
 *   B      bConv        bViews-bConv
 *
 * Returns the winning variant (or null) and the confidence level (0-1).
 * Auto-declares a winner at >= 0.95 confidence.
 */
function chiSquaredTest(
  aViews: number,
  aConv: number,
  bViews: number,
  bConv: number,
): { winner: Variant | null; confidence: number } {
  const total = aViews + bViews;

  // Need meaningful sample size
  if (total < 30 || aViews === 0 || bViews === 0) {
    return { winner: null, confidence: 0 };
  }

  const aNonConv = aViews - aConv;
  const bNonConv = bViews - bConv;
  const totalConv = aConv + bConv;
  const totalNonConv = aNonConv + bNonConv;

  // Expected values under H0 (independence)
  const eAConv = (aViews * totalConv) / total;
  const eANonConv = (aViews * totalNonConv) / total;
  const eBConv = (bViews * totalConv) / total;
  const eBNonConv = (bViews * totalNonConv) / total;

  // Guard against zero expected values
  if (eAConv === 0 || eANonConv === 0 || eBConv === 0 || eBNonConv === 0) {
    return { winner: null, confidence: 0 };
  }

  // Chi-squared statistic (1 degree of freedom)
  const chi2 =
    ((aConv - eAConv) ** 2) / eAConv +
    ((aNonConv - eANonConv) ** 2) / eANonConv +
    ((bConv - eBConv) ** 2) / eBConv +
    ((bNonConv - eBNonConv) ** 2) / eBNonConv;

  // Convert chi2 to p-value using the survival function of chi2(df=1).
  // For df=1: p = erfc(sqrt(chi2/2))  (complementary error function approx).
  const pValue = chi2SurvivalDf1(chi2);
  const confidence = Math.min(1, Math.max(0, 1 - pValue));

  // Determine which variant has a higher conversion rate
  const rateA = aViews > 0 ? aConv / aViews : 0;
  const rateB = bViews > 0 ? bConv / bViews : 0;

  const winner: Variant | null =
    confidence >= 0.95 ? (rateA >= rateB ? "a" : "b") : null;

  return { winner, confidence: Math.round(confidence * 10000) / 10000 };
}

/**
 * Survival function (1 - CDF) for chi-squared distribution with df = 1.
 * Uses the relationship: P(X > x) = erfc(sqrt(x/2)) for df=1.
 */
function chi2SurvivalDf1(x: number): number {
  if (x <= 0) return 1;
  return erfc(Math.sqrt(x / 2));
}

/**
 * Complementary error function approximation (Abramowitz & Stegun 7.1.26).
 * Accurate to ~1.5e-7.
 */
function erfc(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y =
    1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 1 - sign * y;
}
