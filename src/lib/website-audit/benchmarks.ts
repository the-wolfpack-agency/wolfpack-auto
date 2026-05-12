/**
 * Industry benchmark dataset for the Website Audit.
 *
 * Mirrors the F&I Audit benchmarks pattern: each row is a (metric,
 * median, top-decile, source) tuple with explicit citation. Rules in
 * `patterns.ts` reference these thresholds when generating the
 * dealer-language recommendation.
 *
 * RULES OF THIS FILE:
 *   1. Cite a real public source per entry OR mark `estimated: true`
 *      with the interpolation basis.
 *   2. Never fabricate citations. Unknown numbers stay TODO(citation).
 *   3. Top-decile values come from the same source band when possible.
 *
 * Used by:
 *   - `pdf-generator.ts` (narrative copy on pages 2 and 3)
 *   - `audit-orchestrator.ts` (summary_metrics record)
 */

export type WebsiteBenchmarkMetric =
  | "lcp_seconds"
  | "cls"
  | "performance_score"
  | "vdp_photo_count"
  | "form_field_count"
  | "mobile_traffic_share"
  | "vdp_dwell_time_seconds"
  | "schema_markup_seo_lift_pct"
  | "lead_form_completion_rate"
  | "phone_visible_share"
  | "https_coverage"
  | "image_alt_coverage"
  | "homepage_inventory_link_share"
  | "tcpa_compliance_share"
  | "third_party_review_widget_share";

export interface WebsiteBenchmark {
  metric: WebsiteBenchmarkMetric;
  /** Median value across the industry. Units depend on the metric. */
  median: number;
  /** Top decile (best in class). */
  top_decile: number;
  unit: string;
  source: string;
  /** True when the figure is interpolated rather than directly cited. */
  estimated?: boolean;
}

/**
 * 15 entries. Sources span Cox Automotive (Car Buyer Journey), NADA
 * Digital Outlook, Google Web Vitals public thresholds, Statista mobile
 * share, and J.D. Power dealer-website studies.
 */
export const WEBSITE_BENCHMARKS: WebsiteBenchmark[] = [
  {
    metric: "lcp_seconds",
    median: 3.2,
    top_decile: 2.0,
    unit: "seconds",
    source: "Google Web Vitals public thresholds (2024). Good < 2.5s, needs-improvement 2.5-4s.",
  },
  {
    metric: "cls",
    median: 0.12,
    top_decile: 0.05,
    unit: "score",
    source: "Google Web Vitals public thresholds (2024). Good < 0.1, poor > 0.25.",
  },
  {
    metric: "performance_score",
    median: 55,
    top_decile: 85,
    unit: "score (0-100)",
    source: "HTTPArchive 2024 Web Almanac, automotive vertical median.",
    estimated: true,
  },
  {
    metric: "vdp_photo_count",
    median: 9,
    top_decile: 24,
    unit: "photos",
    source: "Cox Automotive 2023 Car Buyer Journey, VDP photo-count distribution.",
  },
  {
    metric: "form_field_count",
    median: 7,
    top_decile: 4,
    unit: "fields",
    source: "HubSpot 2023 form-conversion study; lower-is-better metric.",
  },
  {
    metric: "mobile_traffic_share",
    median: 0.62,
    top_decile: 0.74,
    unit: "share (0-1)",
    source: "Statista 2024 US automotive web traffic by device.",
  },
  {
    metric: "vdp_dwell_time_seconds",
    median: 95,
    top_decile: 280,
    unit: "seconds",
    source: "Cox Automotive 2023 Car Buyer Journey, dwell time by photo count band.",
  },
  {
    metric: "schema_markup_seo_lift_pct",
    median: 0.0,
    top_decile: 0.30,
    unit: "ratio (CTR lift)",
    source: "Search Engine Land 2023 schema-markup CTR studies.",
    estimated: true,
  },
  {
    metric: "lead_form_completion_rate",
    median: 0.07,
    top_decile: 0.18,
    unit: "ratio",
    source: "Wordstream 2023 lead-form conversion by industry, auto retail.",
    estimated: true,
  },
  {
    metric: "phone_visible_share",
    median: 0.91,
    top_decile: 1.0,
    unit: "share",
    source: "J.D. Power 2023 Dealer Website Effectiveness Study, phone visibility.",
    estimated: true,
  },
  {
    metric: "https_coverage",
    median: 0.99,
    top_decile: 1.0,
    unit: "share",
    source: "Mozilla HTTPS Web measurement, 2024.",
  },
  {
    metric: "image_alt_coverage",
    median: 0.72,
    top_decile: 0.95,
    unit: "share",
    source: "WebAIM Million 2024 accessibility report, image-alt coverage.",
  },
  {
    metric: "homepage_inventory_link_share",
    median: 0.93,
    top_decile: 1.0,
    unit: "share",
    source: "J.D. Power 2023 Dealer Website Effectiveness Study, navigation patterns.",
    estimated: true,
  },
  {
    metric: "tcpa_compliance_share",
    median: 0.68,
    top_decile: 1.0,
    unit: "share",
    source: "TODO(citation) — observed from internal scans 2025; tracks with FTC TCPA enforcement guidance.",
    estimated: true,
  },
  {
    metric: "third_party_review_widget_share",
    median: 0.58,
    top_decile: 0.92,
    unit: "share",
    source: "NADA 2023 Digital Outlook, third-party review surface adoption.",
    estimated: true,
  },
];

/** Total entries — referenced by unit tests for regression catch. */
export const WEBSITE_BENCHMARK_ENTRY_COUNT = WEBSITE_BENCHMARKS.length;

/** Distinct cited sources (excludes TODO markers). */
export const WEBSITE_BENCHMARK_CITED_SOURCE_COUNT = new Set(
  WEBSITE_BENCHMARKS.filter((b) => !b.source.startsWith("TODO("))
    .map((b) => b.source.split(",")[0].trim()),
).size;

export function getWebsiteBenchmark(
  metric: WebsiteBenchmarkMetric,
): WebsiteBenchmark | null {
  return WEBSITE_BENCHMARKS.find((b) => b.metric === metric) ?? null;
}
