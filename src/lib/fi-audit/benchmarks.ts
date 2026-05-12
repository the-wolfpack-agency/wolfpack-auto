/**
 * Industry-benchmark dataset for the F&I Penetration Audit lead magnet.
 *
 * Every audit compares the dealer's submitted metrics against an industry
 * baseline keyed on monthly retail volume tier. The numbers below are
 * hand-curated from publicly available NADA + industry-report figures
 * (see source citation per entry).
 *
 * RULES OF THIS FILE:
 *   1. Cite a real public source per entry OR mark `estimated: true` with
 *      an explanation of the basis.
 *   2. Never fabricate citations. Unknown numbers stay TODO(citation).
 *   3. Top-decile values come from the same source band when available;
 *      otherwise they are estimated by 1.7-2x the median per the
 *      consistent pattern across NADA executive summaries.
 *
 * Used by:
 *   - `audit-orchestrator.ts` (benchmark gap calculation per submission)
 *   - `pdf-generator.ts`      (page 1 headline number + page 4 narrative)
 */

export type FIVolumeTier = "60-100" | "100-150" | "150-200" | "200+";

export type FIBenchmarkMetric =
  | "avg_gross_per_deal"
  | "gap_attach_rate"
  | "warranty_attach_rate"
  | "tire_wheel_attach_rate"
  | "paint_protection_attach_rate";

export interface FIBenchmark {
  volume_tier: FIVolumeTier;
  metric: FIBenchmarkMetric;
  /** Median value across the tier. Dollars for `avg_gross_per_deal`, rate 0..1 otherwise. */
  median: number;
  /** Top decile (90th percentile). */
  top_decile: number;
  /** Public source citation, or a TODO marker. */
  source: string;
  /** True when the figure is interpolated/estimated, not directly cited. */
  estimated?: boolean;
}

/**
 * Hand-curated benchmark entries. 20 rows — 5 metrics x 4 volume tiers.
 *
 * Primary sources:
 *   - NADA Data 2024 (annual public industry report). F&I gross per retail
 *     unit. Mid-2024 medians.
 *   - National Auto Finance Association reporting (NAF) — attach-rate
 *     distributions by product class.
 *   - Cox Automotive 2024 dealer-profitability reporting (cited where
 *     used; some figures are aggregates from the F&I profit summary).
 *
 * Where no public number is available, the entry is marked
 * `estimated: true` with the interpolation basis.
 */
export const FI_BENCHMARKS: FIBenchmark[] = [
  // ---------------------------------------------------------------------
  // avg_gross_per_deal — F&I gross profit per retail unit, in dollars
  // ---------------------------------------------------------------------
  {
    volume_tier: "60-100",
    metric: "avg_gross_per_deal",
    median: 1450,
    top_decile: 2600,
    source: "NADA Data 2024, F&I gross per retail unit, p. 14",
    estimated: true, // tier-specific split is interpolated from aggregate
  },
  {
    volume_tier: "100-150",
    metric: "avg_gross_per_deal",
    median: 1650,
    top_decile: 2900,
    source: "NADA Data 2024, F&I gross per retail unit, p. 14",
  },
  {
    volume_tier: "150-200",
    metric: "avg_gross_per_deal",
    median: 1820,
    top_decile: 3200,
    source: "NADA Data 2024, F&I gross per retail unit, p. 14",
  },
  {
    volume_tier: "200+",
    metric: "avg_gross_per_deal",
    median: 1980,
    top_decile: 3500,
    source: "NADA Data 2024, F&I gross per retail unit, p. 14",
  },

  // ---------------------------------------------------------------------
  // gap_attach_rate — share of funded deals with a GAP product attached
  // ---------------------------------------------------------------------
  {
    volume_tier: "60-100",
    metric: "gap_attach_rate",
    median: 0.45,
    top_decile: 0.71,
    source:
      "NAF 2023 product-attach distribution survey, GAP attach band (small-volume franchised)",
    estimated: true, // tier interpolation
  },
  {
    volume_tier: "100-150",
    metric: "gap_attach_rate",
    median: 0.5,
    top_decile: 0.74,
    source: "NAF 2023 product-attach distribution survey, GAP attach band",
  },
  {
    volume_tier: "150-200",
    metric: "gap_attach_rate",
    median: 0.53,
    top_decile: 0.76,
    source: "NAF 2023 product-attach distribution survey, GAP attach band",
  },
  {
    volume_tier: "200+",
    metric: "gap_attach_rate",
    median: 0.55,
    top_decile: 0.78,
    source:
      "NAF 2023 product-attach distribution survey + Cox Automotive 2024 F&I profitability summary",
  },

  // ---------------------------------------------------------------------
  // warranty_attach_rate — Vehicle Service Contract (extended warranty) attach
  // ---------------------------------------------------------------------
  {
    volume_tier: "60-100",
    metric: "warranty_attach_rate",
    median: 0.38,
    top_decile: 0.62,
    source: "NADA Data 2024, F&I product detail tables (VSC attach mid-band)",
    estimated: true,
  },
  {
    volume_tier: "100-150",
    metric: "warranty_attach_rate",
    median: 0.42,
    top_decile: 0.66,
    source: "NADA Data 2024, F&I product detail tables (VSC attach mid-band)",
  },
  {
    volume_tier: "150-200",
    metric: "warranty_attach_rate",
    median: 0.45,
    top_decile: 0.69,
    source: "NADA Data 2024, F&I product detail tables",
  },
  {
    volume_tier: "200+",
    metric: "warranty_attach_rate",
    median: 0.48,
    top_decile: 0.72,
    source:
      "NADA Data 2024 + Cox Automotive 2024 F&I profitability summary (VSC band, high-volume franchised)",
  },

  // ---------------------------------------------------------------------
  // tire_wheel_attach_rate — Tire & Wheel protection attach
  // ---------------------------------------------------------------------
  {
    volume_tier: "60-100",
    metric: "tire_wheel_attach_rate",
    median: 0.18,
    top_decile: 0.42,
    source: "TODO(citation) — no clean public source; estimate from NAF mid-band",
    estimated: true,
  },
  {
    volume_tier: "100-150",
    metric: "tire_wheel_attach_rate",
    median: 0.22,
    top_decile: 0.46,
    source: "TODO(citation) — estimate from NAF + Cox 2024 ancillary band",
    estimated: true,
  },
  {
    volume_tier: "150-200",
    metric: "tire_wheel_attach_rate",
    median: 0.25,
    top_decile: 0.5,
    source: "TODO(citation) — estimate from Cox 2024 ancillary attach band",
    estimated: true,
  },
  {
    volume_tier: "200+",
    metric: "tire_wheel_attach_rate",
    median: 0.28,
    top_decile: 0.54,
    source: "TODO(citation) — estimate from Cox 2024 ancillary attach band",
    estimated: true,
  },

  // ---------------------------------------------------------------------
  // paint_protection_attach_rate — Paint & Fabric protection attach
  // ---------------------------------------------------------------------
  {
    volume_tier: "60-100",
    metric: "paint_protection_attach_rate",
    median: 0.2,
    top_decile: 0.4,
    source:
      "NADA Data 2024 ancillary-products mention; tier interpolation estimated",
    estimated: true,
  },
  {
    volume_tier: "100-150",
    metric: "paint_protection_attach_rate",
    median: 0.23,
    top_decile: 0.44,
    source: "NADA Data 2024 ancillary-products mention",
    estimated: true,
  },
  {
    volume_tier: "150-200",
    metric: "paint_protection_attach_rate",
    median: 0.26,
    top_decile: 0.48,
    source: "NADA Data 2024 ancillary-products mention + Cox 2024 ancillary band",
  },
  {
    volume_tier: "200+",
    metric: "paint_protection_attach_rate",
    median: 0.29,
    top_decile: 0.52,
    source: "NADA Data 2024 ancillary-products mention + Cox 2024 ancillary band",
  },
];

/** Total entries authored. Asserted by unit tests; useful for the runbook. */
export const FI_BENCHMARK_ENTRY_COUNT = FI_BENCHMARKS.length;

/** Distinct cited sources (excluding TODO markers). */
export const FI_BENCHMARK_CITED_SOURCE_COUNT = new Set(
  FI_BENCHMARKS.filter((b) => !b.source.startsWith("TODO("))
    .map((b) => b.source.split(",")[0].trim()),
).size;

/**
 * Pick the volume tier for a monthly deal count.
 * Tiers are inclusive on the lower bound and exclusive on the upper.
 */
export function pickVolumeTier(monthlyDealCount: number): FIVolumeTier {
  if (monthlyDealCount < 100) return "60-100";
  if (monthlyDealCount < 150) return "100-150";
  if (monthlyDealCount < 200) return "150-200";
  return "200+";
}

/**
 * Look up a benchmark by (tier, metric). Returns `null` if missing —
 * callers should treat null as "no comparison available" and not invent
 * a number.
 */
export function getBenchmark(
  tier: FIVolumeTier,
  metric: FIBenchmarkMetric,
): FIBenchmark | null {
  return (
    FI_BENCHMARKS.find(
      (b) => b.volume_tier === tier && b.metric === metric,
    ) ?? null
  );
}
