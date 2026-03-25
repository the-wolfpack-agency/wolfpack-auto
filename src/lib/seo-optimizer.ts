/**
 * Learning-based SEO Optimizer — zero-token pattern matching and statistical
 * analysis over seo_metrics to surface actionable improvements.
 *
 * NO LLM calls. All insights are derived from numeric thresholds and
 * string-pattern heuristics.
 */

import { query } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PagePerformance {
  page_path: string;
  title_tag: string;
  meta_description: string;
  impressions: number;
  clicks: number;
  ctr: number;
  avg_position: number;
}

export interface ImprovementSuggestion {
  page_path: string;
  issue: string;
  suggestion: string;
  estimated_impact: "high" | "medium" | "low";
}

export interface KeywordInsight {
  keyword: string;
  pages: number;
  total_clicks: number;
  avg_position: number;
}

export type PerformanceTier = "top" | "growing" | "underperforming" | "new";

export interface TieredPage {
  page_path: string;
  tier: PerformanceTier;
  impressions: number;
  clicks: number;
  ctr: number;
  avg_position: number;
}

export interface SEOReport {
  dealer_id: string;
  generated_at: string;
  total_pages: number;
  pages_by_tier: Record<PerformanceTier, number>;
  top_pages: TieredPage[];
  underperforming_pages: TieredPage[];
  suggestions: ImprovementSuggestion[];
  keyword_insights: KeywordInsight[];
}

// ---------------------------------------------------------------------------
// Thresholds (tuned from industry benchmarks)
// ---------------------------------------------------------------------------

const CTR_GOOD = 0.05; // 5%+ CTR = performing well
const CTR_LOW = 0.02; // <2% CTR with impressions = underperforming
const IMPRESSIONS_MIN = 10; // Minimum impressions to evaluate
const POSITION_GOOD = 10; // Top 10 average position
const TITLE_MIN_LENGTH = 30;
const TITLE_MAX_LENGTH = 60;
const DESC_MIN_LENGTH = 100;
const DESC_MAX_LENGTH = 160;

// ---------------------------------------------------------------------------
// Analysis functions
// ---------------------------------------------------------------------------

/**
 * Fetch all page metrics for a dealer and compute CTR.
 */
export async function analyzePerformance(
  dealerId: string,
): Promise<PagePerformance[]> {
  const result = await query<{
    page_path: string;
    title_tag: string;
    meta_description: string;
    impressions: number;
    clicks: number;
    avg_position: number;
  }>(
    `SELECT page_path, title_tag, meta_description, impressions, clicks, avg_position
     FROM seo_metrics
     WHERE dealer_id = $1
     ORDER BY impressions DESC`,
    [dealerId],
  );

  return result.rows.map((row) => ({
    ...row,
    ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
  }));
}

/**
 * Compare high-performing vs low-performing pages and generate
 * actionable suggestions based on pattern differences.
 */
export async function suggestImprovements(
  dealerId: string,
): Promise<ImprovementSuggestion[]> {
  const pages = await analyzePerformance(dealerId);
  const suggestions: ImprovementSuggestion[] = [];

  for (const page of pages) {
    // Skip pages with too few impressions to evaluate
    if (page.impressions < IMPRESSIONS_MIN) continue;

    // Title length checks
    if (page.title_tag.length < TITLE_MIN_LENGTH) {
      suggestions.push({
        page_path: page.page_path,
        issue: `Title tag too short (${page.title_tag.length} chars)`,
        suggestion: `Expand title to ${TITLE_MIN_LENGTH}-${TITLE_MAX_LENGTH} characters. Include year, make, model, and location.`,
        estimated_impact: "high",
      });
    } else if (page.title_tag.length > TITLE_MAX_LENGTH) {
      suggestions.push({
        page_path: page.page_path,
        issue: `Title tag too long (${page.title_tag.length} chars) — may be truncated in SERPs`,
        suggestion: `Shorten title to under ${TITLE_MAX_LENGTH} characters. Keep the most important keywords at the start.`,
        estimated_impact: "medium",
      });
    }

    // Meta description length checks
    if (page.meta_description.length < DESC_MIN_LENGTH) {
      suggestions.push({
        page_path: page.page_path,
        issue: `Meta description too short (${page.meta_description.length} chars)`,
        suggestion: `Expand description to ${DESC_MIN_LENGTH}-${DESC_MAX_LENGTH} characters. Include price, key features, and a call-to-action.`,
        estimated_impact: "high",
      });
    } else if (page.meta_description.length > DESC_MAX_LENGTH) {
      suggestions.push({
        page_path: page.page_path,
        issue: `Meta description too long (${page.meta_description.length} chars) — will be truncated`,
        suggestion: `Trim description to ${DESC_MAX_LENGTH} characters max. Front-load key selling points.`,
        estimated_impact: "low",
      });
    }

    // Low CTR with decent impressions — the content is showing but not compelling
    if (page.ctr < CTR_LOW && page.impressions >= IMPRESSIONS_MIN * 5) {
      suggestions.push({
        page_path: page.page_path,
        issue: `Low CTR (${(page.ctr * 100).toFixed(1)}%) despite ${page.impressions} impressions`,
        suggestion: highCtrPatternAdvice(page),
        estimated_impact: "high",
      });
    }

    // Good impressions but poor position — content relevance issue
    if (page.avg_position > 20 && page.impressions >= IMPRESSIONS_MIN) {
      suggestions.push({
        page_path: page.page_path,
        issue: `Low average position (${page.avg_position.toFixed(1)})`,
        suggestion:
          "Improve on-page relevance: ensure title, H1, and first paragraph all include the target keyword. Add internal links from higher-authority pages.",
        estimated_impact: "medium",
      });
    }

    // Title missing location
    if (
      page.title_tag &&
      !hasLocationSignal(page.title_tag) &&
      page.page_path !== "/"
    ) {
      suggestions.push({
        page_path: page.page_path,
        issue: "Title tag missing location signal",
        suggestion:
          'Add city and state to the title tag (e.g., "| Dallas, TX"). Local intent queries are ~46% of Google searches.',
        estimated_impact: "medium",
      });
    }
  }

  // Sort: high impact first
  const impactOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  suggestions.sort(
    (a, b) => impactOrder[a.estimated_impact] - impactOrder[b.estimated_impact],
  );

  return suggestions;
}

/**
 * Aggregate keyword-like patterns from page paths and title tags
 * to approximate top driving keywords.
 */
export async function getTopKeywords(
  dealerId: string,
): Promise<KeywordInsight[]> {
  const pages = await analyzePerformance(dealerId);

  // Extract keywords from page_path and title_tag
  const keywordMap = new Map<
    string,
    { pages: number; clicks: number; positions: number[] }
  >();

  for (const page of pages) {
    const tokens = extractKeywords(page.page_path, page.title_tag);
    for (const token of tokens) {
      const existing = keywordMap.get(token);
      if (existing) {
        existing.pages++;
        existing.clicks += page.clicks;
        existing.positions.push(page.avg_position);
      } else {
        keywordMap.set(token, {
          pages: 1,
          clicks: page.clicks,
          positions: [page.avg_position],
        });
      }
    }
  }

  const results: KeywordInsight[] = [];
  for (const [keyword, data] of keywordMap) {
    const avgPos =
      data.positions.reduce((s, p) => s + p, 0) / data.positions.length;
    results.push({
      keyword,
      pages: data.pages,
      total_clicks: data.clicks,
      avg_position: Math.round(avgPos * 10) / 10,
    });
  }

  // Sort by total clicks descending
  results.sort((a, b) => b.total_clicks - a.total_clicks);
  return results.slice(0, 50);
}

/**
 * Full SEO report: tiered pages, suggestions, keyword insights.
 */
export async function generateSEOReport(
  dealerId: string,
): Promise<SEOReport> {
  const [pages, suggestions, keywords] = await Promise.all([
    analyzePerformance(dealerId),
    suggestImprovements(dealerId),
    getTopKeywords(dealerId),
  ]);

  const tieredPages: TieredPage[] = pages.map((p) => ({
    page_path: p.page_path,
    tier: classifyTier(p),
    impressions: p.impressions,
    clicks: p.clicks,
    ctr: p.ctr,
    avg_position: p.avg_position,
  }));

  const tierCounts: Record<PerformanceTier, number> = {
    top: 0,
    growing: 0,
    underperforming: 0,
    new: 0,
  };
  for (const tp of tieredPages) {
    tierCounts[tp.tier]++;
  }

  return {
    dealer_id: dealerId,
    generated_at: new Date().toISOString(),
    total_pages: pages.length,
    pages_by_tier: tierCounts,
    top_pages: tieredPages.filter((p) => p.tier === "top").slice(0, 10),
    underperforming_pages: tieredPages
      .filter((p) => p.tier === "underperforming")
      .slice(0, 10),
    suggestions,
    keyword_insights: keywords.slice(0, 20),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function classifyTier(page: PagePerformance): PerformanceTier {
  if (page.impressions < IMPRESSIONS_MIN) return "new";
  if (page.ctr >= CTR_GOOD && page.avg_position <= POSITION_GOOD) return "top";
  if (page.ctr < CTR_LOW) return "underperforming";
  return "growing";
}

function highCtrPatternAdvice(page: PagePerformance): string {
  // Pattern-based advice depending on page type
  if (page.page_path.includes("/inventory/")) {
    return "VDP pages benefit from price in the title, specific features in the description, and a clear CTA like 'View Photos & Price'. Consider adding the vehicle condition (Certified, Low Miles).";
  }
  if (page.page_path.includes("/inventory")) {
    return "Inventory listing pages perform better with the number of vehicles in stock mentioned in the description (e.g., 'Browse 150+ vehicles').";
  }
  return "Rewrite the title to be more action-oriented. Ensure the meta description includes a clear value proposition and call-to-action.";
}

function hasLocationSignal(text: string): boolean {
  // Check for common US state abbreviations or city-comma-state patterns
  return /,\s*[A-Z]{2}\b/.test(text) || /\b[A-Z][a-z]+,\s*[A-Z]{2}\b/.test(text);
}

/**
 * Extract meaningful keyword tokens from page paths and title tags.
 * Filters out stop words and very short tokens.
 */
function extractKeywords(pagePath: string, titleTag: string): string[] {
  const STOP_WORDS = new Set([
    "a", "an", "the", "for", "and", "or", "in", "on", "at", "to", "of",
    "is", "it", "by", "with", "from", "as", "this", "that", "are", "was",
    "be", "has", "had", "have", "not", "but", "all", "can", "her", "his",
    "our", "out", "new", "used", "sale", "cars",
  ]);

  const raw = `${pagePath.replace(/[/\-_]/g, " ")} ${titleTag}`.toLowerCase();
  const tokens = raw.match(/[a-z]{3,}/g) ?? [];
  const unique = new Set(tokens.filter((t) => !STOP_WORDS.has(t)));
  return Array.from(unique);
}
