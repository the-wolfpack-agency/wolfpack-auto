/**
 * Lead Intent Scorer
 *
 * Pure TypeScript — no external AI API required.
 * Rule-based scoring that models purchase-intent signals gathered
 * from behavioural analytics, lead form data, and submission timing.
 *
 * Scores are capped at 100.  Tier thresholds:
 *   hot  ≥ 75  → call within 15 min
 *   warm ≥ 50  → follow up within 2 h
 *   cool ≥ 25  → follow up next business day
 *   cold  < 25 → follow up within 72 h
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface LeadScoringInput {
  /** Total pages visited before submitting */
  pageViews?: number;
  /** Vehicle detail pages viewed */
  vdpViews?: number;
  /** Total session time in seconds */
  timeOnSiteSeconds?: number;
  /** Number of separate visits before submitting */
  returnVisits?: number;

  /** Lead source channel */
  source?: string;
  /** Free-text vehicle interest — populated = more specific intent */
  vehicleInterest?: string;
  /** True when a phone number was supplied */
  hasPhone?: boolean;
  /** Character count of the free-text message */
  messageLength?: number;
  /** Domain part of the lead's email address */
  emailDomain?: string;

  /** Hour of submission (0-23, local to server/UTC) */
  submittedHour?: number;
  /** Day of week of submission (0 = Sunday … 6 = Saturday) */
  submittedDayOfWeek?: number;
}

export interface ScoreFactor {
  signal: string;
  impact: number;   // positive or negative points
  description: string;
}

export interface LeadScore {
  score: number;                                   // 0–100
  tier: "hot" | "warm" | "cool" | "cold";
  factors: ScoreFactor[];
  recommendedFollowupAt: Date;
  recommendedChannel: "phone" | "email" | "text";
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

const DISPOSABLE_DOMAINS = new Set([
  "tempmail.com",
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "throwam.com",
  "trashmail.com",
  "yopmail.com",
  "sharklasers.com",
  "guerrillamailblock.com",
  "grr.la",
  "spam4.me",
  "dispostable.com",
  "maildrop.cc",
  "fakeinbox.com",
  "temp-mail.org",
  "getnada.com",
  "mohmal.com",
  "spamgourmet.com",
  "trashmail.io",
  "discard.email",
]);

/* -------------------------------------------------------------------------- */
/* Scoring engine                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Score a lead's purchase intent based on available signals.
 * Returns a capped 0–100 score, tier, contributing factors,
 * recommended follow-up time, and preferred outreach channel.
 */
export function scoreLeadIntent(input: LeadScoringInput): LeadScore {
  const factors: ScoreFactor[] = [];
  let raw = 0;

  // ── Source signals ────────────────────────────────────────────────────────
  const sourceScores: Record<string, number> = {
    walk_in: 30,
    phone: 25,
    vdp_inquiry: 20,
    chat: 15,
    website_form: 10,
  };

  if (input.source && sourceScores[input.source] !== undefined) {
    const pts = sourceScores[input.source];
    raw += pts;
    factors.push({
      signal: "source",
      impact: pts,
      description: `Lead source "${input.source}" indicates ${pts >= 20 ? "high" : pts >= 15 ? "moderate" : "standard"} intent`,
    });
  }

  // ── Behavioural signals ───────────────────────────────────────────────────

  // VDP views: +5 each, max +25
  const vdpViews = Math.max(0, input.vdpViews ?? 0);
  if (vdpViews > 0) {
    const pts = Math.min(25, vdpViews * 5);
    raw += pts;
    factors.push({
      signal: "vdp_views",
      impact: pts,
      description: `Viewed ${vdpViews} vehicle detail page${vdpViews !== 1 ? "s" : ""} (${pts} pts, max 25)`,
    });
  }

  // Page views > 5
  if ((input.pageViews ?? 0) > 5) {
    raw += 10;
    factors.push({
      signal: "page_views",
      impact: 10,
      description: `Browsed ${input.pageViews} pages — high site engagement`,
    });
  }

  // Time on site > 2 min
  if ((input.timeOnSiteSeconds ?? 0) > 120) {
    raw += 10;
    factors.push({
      signal: "time_on_site",
      impact: 10,
      description: `Spent ${input.timeOnSiteSeconds}s on site — deeply engaged`,
    });
  }

  // Return visits: +15 each, max +30
  const returnVisits = Math.max(0, input.returnVisits ?? 0);
  if (returnVisits > 0) {
    const pts = Math.min(30, returnVisits * 15);
    raw += pts;
    factors.push({
      signal: "return_visits",
      impact: pts,
      description: `${returnVisits} return visit${returnVisits !== 1 ? "s" : ""} before submitting (${pts} pts, max 30)`,
    });
  }

  // ── Data quality signals ──────────────────────────────────────────────────

  if (input.hasPhone) {
    raw += 10;
    factors.push({
      signal: "has_phone",
      impact: 10,
      description: "Provided phone number — willing to be called",
    });
  }

  const msgLen = input.messageLength ?? 0;
  if (msgLen > 150) {
    raw += 15;
    factors.push({
      signal: "message_length",
      impact: 15,
      description: `Long message (${msgLen} chars) — highly specific inquiry`,
    });
  } else if (msgLen > 50) {
    raw += 8;
    factors.push({
      signal: "message_length",
      impact: 8,
      description: `Detailed message (${msgLen} chars) — substantive inquiry`,
    });
  }

  // Specific vehicle named (non-empty vehicleInterest)
  if (input.vehicleInterest && input.vehicleInterest.trim().length > 0) {
    raw += 12;
    factors.push({
      signal: "vehicle_interest",
      impact: 12,
      description: `Named a specific vehicle: "${input.vehicleInterest.trim()}"`,
    });
  }

  // ── Timing signals ────────────────────────────────────────────────────────

  const hour = input.submittedHour;
  const dow = input.submittedDayOfWeek;

  if (
    typeof hour === "number" &&
    typeof dow === "number" &&
    dow >= 1 && dow <= 5 &&  // Mon–Fri
    hour >= 9 && hour < 17   // 9 AM – 5 PM
  ) {
    raw += 5;
    factors.push({
      signal: "submission_timing",
      impact: 5,
      description: "Submitted during business hours on a weekday",
    });
  } else if (typeof dow === "number" && (dow === 0 || dow === 6)) {
    raw += 2;
    factors.push({
      signal: "submission_timing",
      impact: 2,
      description: "Submitted on a weekend — active weekend shopper",
    });
  }

  // ── Negative signals ──────────────────────────────────────────────────────

  const domain = (input.emailDomain ?? "").toLowerCase().trim();
  if (domain && DISPOSABLE_DOMAINS.has(domain)) {
    raw -= 20;
    factors.push({
      signal: "disposable_email",
      impact: -20,
      description: `Email domain "${domain}" is a known disposable / spam domain`,
    });
  }

  // ── Clamp and tier ────────────────────────────────────────────────────────

  const score = Math.max(0, Math.min(100, Math.round(raw)));

  let tier: LeadScore["tier"];
  if (score >= 75) tier = "hot";
  else if (score >= 50) tier = "warm";
  else if (score >= 25) tier = "cool";
  else tier = "cold";

  // ── Follow-up timing ──────────────────────────────────────────────────────

  const now = new Date();
  let recommendedFollowupAt: Date;

  if (tier === "hot") {
    // Within 15 minutes
    recommendedFollowupAt = new Date(now.getTime() + 15 * 60 * 1000);
  } else if (tier === "warm") {
    // Within 2 hours
    recommendedFollowupAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  } else if (tier === "cool") {
    // Next business day at 9 AM
    recommendedFollowupAt = nextBusinessDay9am(now);
  } else {
    // 3 days out at 10 AM
    recommendedFollowupAt = daysFromNow(now, 3, 10);
  }

  // ── Channel recommendation ────────────────────────────────────────────────

  const recommendedChannel: LeadScore["recommendedChannel"] =
    input.hasPhone && tier === "hot" ? "phone" : "email";

  return {
    score,
    tier,
    factors,
    recommendedFollowupAt,
    recommendedChannel,
  };
}

/* -------------------------------------------------------------------------- */
/* Date helpers                                                                */
/* -------------------------------------------------------------------------- */

/** Returns the next Monday–Friday at 9:00 AM (same timezone as `from`). */
function nextBusinessDay9am(from: Date): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  // Advance past weekend
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  d.setHours(9, 0, 0, 0);
  return d;
}

/** Returns `days` calendar days from `from`, at `hour`:00. */
function daysFromNow(from: Date, days: number, hour: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/* -------------------------------------------------------------------------- */
/* Utility: extract email domain                                               */
/* -------------------------------------------------------------------------- */

export function extractEmailDomain(email: string): string {
  const idx = email.lastIndexOf("@");
  return idx >= 0 ? email.slice(idx + 1).toLowerCase().trim() : "";
}
