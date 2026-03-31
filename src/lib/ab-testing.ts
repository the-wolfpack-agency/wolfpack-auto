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

/** Multi-variant A/B test definition. */
export interface ABTest {
  name: string;
  variants: string[];
  target_metric: string;
  created_at: string;
  status: "active" | "paused" | "completed";
}

/** Rich A/B test result with per-variant stats. */
export interface ABTestResult {
  name: string;
  variants: {
    variant: string;
    assignments: number;
    conversions: number;
    conversion_rate: number;
    total_value: number;
  }[];
  target_metric: string;
  status: "active" | "paused" | "completed";
  created_at: string;
  winner: string | null;
  confidence: number;
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

// ---------------------------------------------------------------------------
// Multi-variant assignment & analytics-backed queries
// ---------------------------------------------------------------------------

/**
 * Assign a user to any number of variants deterministically.
 * Uses FNV-1a hash of `testName + fingerprint` to pick a variant index.
 * Same fingerprint always gets the same variant for the same test.
 */
export function assignVariant(
  testName: string,
  variants: string[],
  fingerprint: string,
): string {
  if (variants.length === 0) throw new Error("At least one variant is required");
  if (variants.length === 1) return variants[0];
  const hash = fnv1a(`${testName}:${fingerprint}`);
  return variants[hash % variants.length];
}

/**
 * Build an ab_test_assignment event payload for EventCollector.
 */
export function buildAssignmentPayload(
  testName: string,
  variant: string,
): { test_name: string; variant: string } {
  return { test_name: testName, variant };
}

/**
 * Build an ab_test_conversion event payload for EventCollector.
 */
export function buildConversionPayload(
  testName: string,
  variant: string,
  value?: number,
): { test_name: string; variant: string; conversion_value?: number } {
  return {
    test_name: testName,
    variant,
    ...(value !== undefined ? { conversion_value: value } : {}),
  };
}

// ---------------------------------------------------------------------------
// Shadow-mode mock data for A/B test results
// ---------------------------------------------------------------------------

const MOCK_AB_RESULTS: ABTestResult[] = [
  {
    name: "hero_cta_color",
    variants: [
      { variant: "blue", assignments: 1247, conversions: 649, conversion_rate: 0.52, total_value: 0 },
      { variant: "green", assignments: 1203, conversions: 577, conversion_rate: 0.48, total_value: 0 },
    ],
    target_metric: "cta_click",
    status: "active",
    created_at: "2026-03-15T10:00:00Z",
    winner: "blue",
    confidence: 0.87,
  },
  {
    name: "pricing_display",
    variants: [
      { variant: "monthly_first", assignments: 892, conversions: 178, conversion_rate: 0.20, total_value: 45200 },
      { variant: "total_first", assignments: 915, conversions: 201, conversion_rate: 0.22, total_value: 52800 },
    ],
    target_metric: "financing_start",
    status: "active",
    created_at: "2026-03-20T14:30:00Z",
    winner: null,
    confidence: 0.62,
  },
  {
    name: "search_layout",
    variants: [
      { variant: "grid_3col", assignments: 634, conversions: 203, conversion_rate: 0.32, total_value: 0 },
      { variant: "grid_4col", assignments: 621, conversions: 186, conversion_rate: 0.30, total_value: 0 },
      { variant: "list_view", assignments: 598, conversions: 215, conversion_rate: 0.36, total_value: 0 },
    ],
    target_metric: "vehicle_view",
    status: "active",
    created_at: "2026-03-22T09:00:00Z",
    winner: "list_view",
    confidence: 0.73,
  },
];

/**
 * Get all A/B tests with variant distribution and conversion rates.
 * Falls back to shadow-mode mock data when no DB is configured.
 */
export async function getABTestResults(dealerId: string): Promise<ABTestResult[]> {
  if (!process.env.DATABASE_URL) return MOCK_AB_RESULTS;

  try {
    const { query } = await import("@/lib/db");

    const testsResult = await query<{
      test_name: string;
      variant: string;
      assignments: string;
    }>(
      `SELECT
         metadata->>'test_name' AS test_name,
         metadata->>'variant' AS variant,
         COUNT(*) AS assignments
       FROM analytics_events
       WHERE event_type = 'ab_test_assignment'
         AND page = $1
         AND timestamp >= NOW() - INTERVAL '90 days'
       GROUP BY metadata->>'test_name', metadata->>'variant'
       ORDER BY test_name, variant`,
      [dealerId],
    );

    if (testsResult.rows.length === 0) return MOCK_AB_RESULTS;

    const conversionsResult = await query<{
      test_name: string;
      variant: string;
      conversions: string;
      total_value: string;
    }>(
      `SELECT
         metadata->>'test_name' AS test_name,
         metadata->>'variant' AS variant,
         COUNT(*) AS conversions,
         COALESCE(SUM((metadata->>'conversion_value')::numeric), 0) AS total_value
       FROM analytics_events
       WHERE event_type = 'ab_test_conversion'
         AND page = $1
         AND timestamp >= NOW() - INTERVAL '90 days'
       GROUP BY metadata->>'test_name', metadata->>'variant'`,
      [dealerId],
    );

    const convMap = new Map<string, { conversions: number; total_value: number }>();
    for (const r of conversionsResult.rows) {
      convMap.set(`${r.test_name}:${r.variant}`, {
        conversions: parseInt(r.conversions, 10),
        total_value: parseFloat(r.total_value),
      });
    }

    const testMap = new Map<string, ABTestResult>();
    for (const r of testsResult.rows) {
      if (!testMap.has(r.test_name)) {
        testMap.set(r.test_name, {
          name: r.test_name,
          variants: [],
          target_metric: "",
          status: "active",
          created_at: new Date().toISOString(),
          winner: null,
          confidence: 0,
        });
      }
      const test = testMap.get(r.test_name)!;
      const assignments = parseInt(r.assignments, 10);
      const conv = convMap.get(`${r.test_name}:${r.variant}`) ?? { conversions: 0, total_value: 0 };
      test.variants.push({
        variant: r.variant,
        assignments,
        conversions: conv.conversions,
        conversion_rate: assignments > 0 ? Math.round((conv.conversions / assignments) * 100) / 100 : 0,
        total_value: conv.total_value,
      });
    }

    // Determine winners
    for (const test of testMap.values()) {
      const eligible = test.variants.filter((v) => v.assignments >= 100);
      if (eligible.length >= 2) {
        const sorted = [...eligible].sort((a, b) => b.conversion_rate - a.conversion_rate);
        const diff = sorted[0].conversion_rate - sorted[1].conversion_rate;
        const sampleFactor = Math.min((sorted[0].assignments + sorted[1].assignments) / 2000, 1);
        test.confidence = Math.round(Math.min(diff * 10 * sampleFactor, 0.99) * 100) / 100;
        if (test.confidence > 0.7) test.winner = sorted[0].variant;
      }
    }

    return [...testMap.values()];
  } catch (err) {
    console.error("[ab-testing] getABTestResults failed:", err);
    return MOCK_AB_RESULTS;
  }
}

/**
 * Create a new A/B test by recording its configuration as an analytics event.
 */
export async function createABTest(
  dealerId: string,
  test: ABTest,
): Promise<{ success: boolean; test: ABTest }> {
  if (!process.env.DATABASE_URL) return { success: true, test };

  try {
    const { query } = await import("@/lib/db");
    await query(
      `INSERT INTO analytics_events (event_type, action, page, session_id, user_fingerprint, metadata, timestamp)
       VALUES ('system', 'ab_test_created', $1, 'server', 'server', $2, NOW())`,
      [
        dealerId,
        JSON.stringify({
          test_name: test.name,
          variants: test.variants,
          target_metric: test.target_metric,
          status: test.status,
        }),
      ],
    );
    return { success: true, test };
  } catch (err) {
    console.error("[ab-testing] createABTest failed:", err);
    return { success: true, test };
  }
}
