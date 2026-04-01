/**
 * Search Intent Classifier — Captures and classifies how users arrived
 * and what they are looking for.
 *
 * Parses referrer, UTM params, and landing page to produce a structured
 * intent signal that feeds into the analytics brain.
 *
 * Privacy-first: no PII captured, only source/intent categories.
 *
 * Usage (client-side):
 *   import { classifySearchIntent } from "@/lib/search-intent-classifier";
 *   const intent = classifySearchIntent();
 *   // → { source, medium, campaign, intent_category, landing_page, raw_query? }
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type IntentCategory =
  | "price_shopping"
  | "specific_model"
  | "near_me"
  | "financing"
  | "trade_in"
  | "service"
  | "general_browse"
  | "direct";

export type TrafficSource =
  | "google"
  | "bing"
  | "yahoo"
  | "duckduckgo"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "youtube"
  | "twitter"
  | "reddit"
  | "pinterest"
  | "linkedin"
  | "email"
  | "direct"
  | string; // fallback to hostname

export interface SearchIntentResult {
  source: TrafficSource;
  medium: string;
  campaign: string;
  content: string;
  term: string;
  intent_category: IntentCategory;
  landing_page: string;
  raw_query?: string;
}

/* ------------------------------------------------------------------ */
/*  Source detection from referrer                                      */
/* ------------------------------------------------------------------ */

const SOURCE_PATTERNS: [RegExp, TrafficSource][] = [
  [/google\./i, "google"],
  [/bing\./i, "bing"],
  [/yahoo\./i, "yahoo"],
  [/duckduckgo\./i, "duckduckgo"],
  [/facebook\.|fb\./i, "facebook"],
  [/instagram\./i, "instagram"],
  [/tiktok\./i, "tiktok"],
  [/youtube\.|youtu\.be/i, "youtube"],
  [/twitter\.|x\.com/i, "twitter"],
  [/reddit\./i, "reddit"],
  [/pinterest\./i, "pinterest"],
  [/linkedin\./i, "linkedin"],
];

/** Map a referrer hostname to a known traffic source. */
export function detectSource(referrer: string): TrafficSource {
  if (!referrer) return "direct";

  try {
    const url = new URL(referrer);
    const host = url.hostname.toLowerCase();

    for (const [pattern, source] of SOURCE_PATTERNS) {
      if (pattern.test(host)) return source;
    }

    // Unknown but has a referrer — return the hostname as source
    return host;
  } catch {
    return "direct";
  }
}

/* ------------------------------------------------------------------ */
/*  Search engine query extraction                                     */
/* ------------------------------------------------------------------ */

const SEARCH_QUERY_PARAMS = ["q", "query", "search_query", "p", "text"];

/** Extract the search query from a referrer URL when the search engine exposes it. */
export function extractSearchQuery(referrer: string): string | undefined {
  if (!referrer) return undefined;

  try {
    const url = new URL(referrer);

    for (const param of SEARCH_QUERY_PARAMS) {
      const val = url.searchParams.get(param);
      if (val) return val;
    }
  } catch {
    // Malformed URL — no query to extract
  }

  return undefined;
}

/* ------------------------------------------------------------------ */
/*  UTM parameter extraction                                           */
/* ------------------------------------------------------------------ */

export interface UTMParams {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
}

/** Extract UTM parameters from a URL search string. */
export function extractUTMParams(search: string): UTMParams {
  const params = new URLSearchParams(search);
  return {
    utm_source: params.get("utm_source") ?? "",
    utm_medium: params.get("utm_medium") ?? "",
    utm_campaign: params.get("utm_campaign") ?? "",
    utm_content: params.get("utm_content") ?? "",
    utm_term: params.get("utm_term") ?? "",
  };
}

/* ------------------------------------------------------------------ */
/*  Intent classification                                              */
/* ------------------------------------------------------------------ */

/** Keywords that signal a specific purchase intent. */
const INTENT_KEYWORDS: [RegExp, IntentCategory][] = [
  [/\b(price|cheap|affordable|deal|under \d|cost|msrp|invoice)\b/i, "price_shopping"],
  [/\b(f.?150|camry|civic|corolla|rav4|mustang|tacoma|wrangler|silverado|accord|altima|model [3sy])\b/i, "specific_model"],
  [/\b(near me|nearby|close to|in \w+ city|local)\b/i, "near_me"],
  [/\b(financ|loan|apr|credit|payment|monthly|lease)\b/i, "financing"],
  [/\b(trade.?in|trade value|apprais|kbb|kelly blue|what.?s my .* worth)\b/i, "trade_in"],
  [/\b(service|repair|oil change|maintenance|brake|tire|mechanic)\b/i, "service"],
];

/** Map landing page path to an intent category. */
const LANDING_PAGE_INTENTS: [RegExp, IntentCategory][] = [
  [/\/financ/i, "financing"],
  [/\/trade/i, "trade_in"],
  [/\/service/i, "service"],
  [/\/inventory\/[A-Z0-9]{17}/i, "specific_model"], // VIN page
  [/\/inventory/i, "general_browse"],
];

/** Classify the user's intent from their query text. */
export function classifyQueryIntent(query: string): IntentCategory {
  if (!query) return "general_browse";

  for (const [pattern, intent] of INTENT_KEYWORDS) {
    if (pattern.test(query)) return intent;
  }

  return "general_browse";
}

/** Classify intent from the landing page path. */
export function classifyLandingPageIntent(path: string): IntentCategory | null {
  for (const [pattern, intent] of LANDING_PAGE_INTENTS) {
    if (pattern.test(path)) return intent;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Main classifier — ties everything together                         */
/* ------------------------------------------------------------------ */

/**
 * Classify the search intent for the current page load.
 *
 * Can be called with explicit values (for testing/SSR) or will
 * read from the browser globals when called client-side.
 */
export function classifySearchIntent(opts?: {
  referrer?: string;
  search?: string;
  pathname?: string;
}): SearchIntentResult {
  const referrer = opts?.referrer ?? (typeof document !== "undefined" ? document.referrer : "");
  const search = opts?.search ?? (typeof window !== "undefined" ? window.location.search : "");
  const pathname = opts?.pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/");

  // 1. Detect traffic source
  const source = detectSource(referrer);

  // 2. Extract UTM params
  const utm = extractUTMParams(search);

  // 3. Try to extract search query from referrer
  const raw_query = extractSearchQuery(referrer);

  // 4. Determine medium
  let medium = utm.utm_medium || "organic";
  if (source === "direct") medium = "direct";
  else if (["facebook", "instagram", "tiktok", "twitter", "pinterest", "reddit", "linkedin"].includes(source)) {
    medium = utm.utm_medium || "social";
  } else if (source === "email" || utm.utm_medium === "email") {
    medium = "email";
  }

  // 5. Classify intent (priority: query > UTM term > landing page > default)
  let intent_category: IntentCategory;

  if (raw_query) {
    intent_category = classifyQueryIntent(raw_query);
  } else if (utm.utm_term) {
    intent_category = classifyQueryIntent(utm.utm_term);
  } else {
    const pageIntent = classifyLandingPageIntent(pathname);
    if (pageIntent) {
      intent_category = pageIntent;
    } else if (source === "direct") {
      intent_category = "direct";
    } else {
      intent_category = "general_browse";
    }
  }

  const result: SearchIntentResult = {
    source,
    medium,
    campaign: utm.utm_campaign,
    content: utm.utm_content,
    term: utm.utm_term,
    intent_category,
    landing_page: pathname,
  };

  if (raw_query) {
    result.raw_query = raw_query;
  }

  return result;
}
