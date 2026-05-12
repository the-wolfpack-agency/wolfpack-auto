/**
 * Parameter Extractor — pull typed parameters from a free-text prompt.
 *
 * Returns a flat Record<string, string | number | boolean>. The action
 * registry's parameter_schema is the source of truth for the destination
 * shape; this layer surfaces candidate values, the caller can validate
 * + coerce + reject as needed.
 *
 * Extractors are intentionally regex-based + deterministic. NO LLM call.
 * NO external lib. Patterns prefer false-negative over false-positive —
 * a bad extraction would mis-route a mutating action, which is worse
 * than no extraction.
 */

/**
 * RFC-5321-flavored email pattern. Conservative — won't catch every
 * legal email but won't false-positive on words like "hello@world".
 *
 * Requires at least one dot in the domain and a 2+ char TLD.
 */
const EMAIL_RE = /\b([a-z0-9_.+-]+)@([a-z0-9-]+\.[a-z0-9.-]+\.[a-z]{2,}|[a-z0-9-]+\.[a-z]{2,})\b/i;

/**
 * US-style phone numbers. Accepts:
 *   (555) 123-4567
 *   555-123-4567
 *   555.123.4567
 *   5551234567
 *   +1 555 123 4567
 */
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/;

/**
 * Dollar amounts. Accepts $1,234.56, $1234, 1500 dollars.
 */
const DOLLAR_RE = /\$\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\b|\b([0-9]+(?:\.[0-9]{1,2})?)\s*dollars?\b/i;

/**
 * Percentages. "60%", "60 percent", "60 pct".
 *
 * Note: no trailing \b — the % char isn't a word char so word-boundary
 * after % is unreliable. Word boundaries only on the digit side.
 */
const PERCENT_RE = /\b([0-9]{1,3}(?:\.[0-9]+)?)\s*(?:%|percent\b|pct\b)/i;

/**
 * ISO + relative date phrases.
 *   "2026-05-12", "5/12/2026", "tomorrow", "next monday", "yesterday".
 */
const ISO_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;
const US_DATE_RE = /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/;
const RELATIVE_DATE_WORDS = new Set([
  "today", "tomorrow", "yesterday",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
]);

/**
 * Counts: "next 5 leads", "top 10 deals", "first 3 customers", "5 leads".
 * Captures the number.
 */
const COUNT_RE = /\b(?:next|top|first|last|recent|past)\s+(\d{1,4})\b|\b(\d{1,4})\s+(?:lead|deal|customer|call|visit|appointment|booking|test\s*drive)/i;

/**
 * Simple names: capitalized first names appearing AFTER "to" or "for".
 *   "route to maria", "assign to dave smith"
 * Captures the first capitalized word (lower-cased on output).
 *
 * Note: input has already been lowercased before this extractor runs in
 * keyword-matching, but the extractor runs on the ORIGINAL prompt string
 * so case is preserved for this pattern.
 */
const NAME_AFTER_TO_RE = /\b(?:to|for|by)\s+(?:rep\s+|salesperson\s+|advisor\s+)?([A-Z][a-z]{1,15})(?:\s+([A-Z][a-z]{1,15}))?\b/;

/**
 * Service hours (start/end). "open at 8am close at 6pm", "8 to 6", "8am-6pm".
 */
const HOURS_RANGE_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;

/**
 * Day-of-week — used for service.update_hours.
 */
const DAY_OF_WEEK_RE = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|fri|sat|sun)\b/i;
const DAY_ABBREVS: Record<string, string> = {
  monday: "mon", mon: "mon",
  tuesday: "tue", tue: "tue", tues: "tue",
  wednesday: "wed", wed: "wed",
  thursday: "thu", thu: "thu", thur: "thu",
  friday: "fri", fri: "fri",
  saturday: "sat", sat: "sat",
  sunday: "sun", sun: "sun",
};

/**
 * Time windows: "last 30 days", "past 7 days", "this week", "this month".
 */
const WINDOW_DAYS_RE = /\b(?:last|past|previous)\s+(\d{1,3})\s+(day|days|week|weeks|month|months)\b/i;
const WINDOW_WORD_RE = /\b(this\s+(?:week|month)|today|yesterday)\b/i;

/**
 * Routing strategy enum lookups for leads.update_routing_rule.
 */
const ROUTING_STRATEGY_RE = /\b(round[\s-]?robin|first[\s-]?available|balanced|manual)\b/i;

/**
 * Channel enum lookups for notifications.subscribe_alert.
 */
const CHANNEL_RE = /\b(email|sms|text|in[\s-]?app|push)\b/i;

/**
 * F&I product slugs commonly mentioned in dealer talk.
 */
const FI_PRODUCT_RE = /\b(gap|tire[\s-]?and[\s-]?wheel|tire\s*wheel|service[\s-]?contract|vsc|prepaid[\s-]?maintenance|ppm|key[\s-]?replacement|paint[\s-]?protection|interior[\s-]?protection|theft|appearance)\b/i;

/* ------------------------------------------------------------------ */
/*  Public extractor                                                    */
/* ------------------------------------------------------------------ */

export interface ExtractedParameters {
  parameters: Record<string, string | number | boolean>;
  /** Token positions covered by extractions — for unmatched-tokens diff. */
  consumed: string[];
  /** Per-extraction confidence boosts: parameter name → 0..1. */
  boosts: Record<string, number>;
}

/**
 * Extract every plausible parameter from the prompt. Returns a flat map
 * keyed by canonical parameter name. The orchestrator filters this down
 * to the params the matched action actually accepts.
 */
export function extractParameters(prompt: string): ExtractedParameters {
  const out: Record<string, string | number | boolean> = {};
  const consumed: string[] = [];
  const boosts: Record<string, number> = {};

  if (!prompt) return { parameters: out, consumed, boosts };

  // email
  const email = prompt.match(EMAIL_RE);
  if (email) {
    out.email = email[0].toLowerCase();
    consumed.push(email[0]);
    boosts.email = 0.15;
  }

  // phone
  const phone = prompt.match(PHONE_RE);
  if (phone) {
    out.phone = `${phone[1]}-${phone[2]}-${phone[3]}`;
    consumed.push(phone[0]);
    boosts.phone = 0.1;
  }

  // dollar
  const dollar = prompt.match(DOLLAR_RE);
  if (dollar) {
    const captured = dollar[1] ?? dollar[2];
    const num = parseFloat(captured.replace(/,/g, ""));
    if (Number.isFinite(num)) {
      out.amount = num;
      out.new_price = num;
      consumed.push(dollar[0]);
      boosts.amount = 0.15;
    }
  }

  // percentage
  const pct = prompt.match(PERCENT_RE);
  if (pct) {
    const num = parseFloat(pct[1]);
    if (Number.isFinite(num) && num >= 0 && num <= 100) {
      out.target_pct = num;
      out.percentage = num;
      consumed.push(pct[0]);
      boosts.target_pct = 0.15;
    }
  }

  // count
  const count = prompt.match(COUNT_RE);
  if (count) {
    const raw = count[1] ?? count[2];
    const num = parseInt(raw, 10);
    if (Number.isFinite(num) && num > 0 && num <= 9999) {
      out.count = num;
      consumed.push(count[0]);
      boosts.count = 0.1;
    }
  }

  // window_days
  const win = prompt.match(WINDOW_DAYS_RE);
  if (win) {
    const num = parseInt(win[1], 10);
    const unit = win[2].toLowerCase();
    let days = num;
    if (unit.startsWith("week")) days = num * 7;
    if (unit.startsWith("month")) days = num * 30;
    if (Number.isFinite(days) && days > 0 && days <= 365) {
      out.window_days = days;
      consumed.push(win[0]);
      boosts.window_days = 0.1;
    }
  } else {
    const winWord = prompt.match(WINDOW_WORD_RE);
    if (winWord) {
      const word = winWord[0].toLowerCase();
      if (word === "today" || word === "yesterday") out.window_days = 1;
      else if (word.includes("week")) out.window_days = 7;
      else if (word.includes("month")) out.window_days = 30;
      consumed.push(winWord[0]);
      boosts.window_days = 0.05;
    }
  }

  // ISO date
  const iso = prompt.match(ISO_DATE_RE);
  if (iso) {
    out.date = iso[1];
    consumed.push(iso[0]);
    boosts.date = 0.1;
  } else {
    const us = prompt.match(US_DATE_RE);
    if (us) {
      out.date = us[1];
      consumed.push(us[0]);
      boosts.date = 0.05;
    } else {
      // relative date words
      const words = prompt.toLowerCase().split(/[^a-z]+/g);
      for (const w of words) {
        if (RELATIVE_DATE_WORDS.has(w)) {
          out.date_relative = w;
          consumed.push(w);
          boosts.date_relative = 0.05;
          break;
        }
      }
    }
  }

  // name after to/for/by
  const name = prompt.match(NAME_AFTER_TO_RE);
  if (name) {
    const first = name[1].toLowerCase();
    const last = name[2]?.toLowerCase();
    out.rep_name = last ? `${first} ${last}` : first;
    consumed.push(name[0]);
    boosts.rep_name = 0.15;
  } else {
    // Lowercase fallback: "route to maria" — input may be all-lowercase.
    const lowerName = prompt.match(/\b(?:to|for|by)\s+(?:rep\s+|salesperson\s+|advisor\s+)?([a-z]{2,15})(?:\s+([a-z]{2,15}))?\b/);
    if (lowerName) {
      const first = lowerName[1].toLowerCase();
      // Avoid grabbing stopwords + common verbs accidentally.
      const stop = new Set([
        "the", "and", "or", "a", "an", "my", "set", "show", "all", "any",
        "next", "last", "this", "that", "those", "these", "tomorrow",
        "yesterday", "today", "morning", "afternoon", "evening", "night",
        "week", "month", "year", "hour", "minute", "day", "days",
        "team", "staff", "everyone", "anybody", "somebody", "nobody",
      ]);
      if (!stop.has(first)) {
        const last2 = lowerName[2]?.toLowerCase();
        out.rep_name = last2 && !stop.has(last2) ? `${first} ${last2}` : first;
        consumed.push(lowerName[0]);
        boosts.rep_name = 0.1;
      }
    }
  }

  // hours
  const hours = prompt.match(HOURS_RANGE_RE);
  if (hours) {
    const openH = parseInt(hours[1], 10);
    const openM = hours[2] ? parseInt(hours[2], 10) : 0;
    const openAP = hours[3]?.toLowerCase();
    const closeH = parseInt(hours[4], 10);
    const closeM = hours[5] ? parseInt(hours[5], 10) : 0;
    const closeAP = hours[6]?.toLowerCase();
    out.open_time = formatTime(openH, openM, openAP);
    out.close_time = formatTime(closeH, closeM, closeAP ?? (openAP === "am" ? "pm" : "pm"));
    consumed.push(hours[0]);
    boosts.open_time = 0.1;
    boosts.close_time = 0.1;
  }

  // day of week
  const dow = prompt.match(DAY_OF_WEEK_RE);
  if (dow) {
    const abbr = DAY_ABBREVS[dow[1].toLowerCase()];
    if (abbr) {
      out.day_of_week = abbr;
      consumed.push(dow[0]);
      boosts.day_of_week = 0.1;
    }
  }

  // routing strategy
  const strat = prompt.match(ROUTING_STRATEGY_RE);
  if (strat) {
    const norm = strat[1].toLowerCase().replace(/[\s-]/g, "_");
    out.strategy = norm;
    consumed.push(strat[0]);
    boosts.strategy = 0.15;
  }

  // notification channel
  const chan = prompt.match(CHANNEL_RE);
  if (chan) {
    let c = chan[1].toLowerCase().replace(/[\s-]/g, "_");
    if (c === "text") c = "sms";
    if (c === "push") c = "in_app";
    out.channel = c;
    consumed.push(chan[0]);
    boosts.channel = 0.1;
  }

  // F&I product
  const product = prompt.match(FI_PRODUCT_RE);
  if (product) {
    let slug = product[1].toLowerCase().replace(/[\s-]+/g, "_");
    if (slug === "tire_wheel") slug = "tire_and_wheel";
    if (slug === "vsc") slug = "service_contract";
    if (slug === "ppm") slug = "prepaid_maintenance";
    out.product_slug = slug;
    consumed.push(product[0]);
    boosts.product_slug = 0.15;
  }

  return { parameters: out, consumed, boosts };
}

function formatTime(hour: number, minute: number, ampm: string | undefined): string {
  let h = hour;
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  const hh = String(h).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Filter a parameter map down to a specific action's allowed parameter
 * names (from its parameter_schema.properties). Unknown keys are dropped
 * silently; this is what the orchestrator hands to the IntentMatch.
 */
export function filterParametersForAction(
  extracted: Record<string, string | number | boolean>,
  parameterSchema: { properties?: Record<string, unknown> } | undefined,
): Record<string, string | number | boolean> {
  if (!parameterSchema || !parameterSchema.properties) return {};
  const allowed = new Set(Object.keys(parameterSchema.properties));
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(extracted)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}
