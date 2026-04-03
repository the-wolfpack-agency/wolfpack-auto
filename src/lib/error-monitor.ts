/**
 * Error Monitoring — JS Error Capture + User Behavior Correlation
 *
 * Captures client-side JS errors with session context, correlates errors
 * with user behavior for replay, aggregates and trends errors, and ranks
 * by impact.
 */

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface ClientError {
  id: string;
  message: string;
  stack: string | null;
  fingerprint: string;
  page_url: string;
  user_agent: string;
  session_id: string | null;
  dealer_id: string;
  captured_at: string;
  context: ErrorContext;
}

export interface ErrorContext {
  page: string;
  component: string | null;
  user_actions: string[];
  viewport_width: number | null;
  viewport_height: number | null;
  connection_type: string | null;
}

export interface ErrorTrend {
  fingerprint: string;
  message: string;
  occurrences: Array<{ date: string; count: number }>;
  direction: "increasing" | "decreasing" | "stable";
  total_count: number;
  first_seen: string;
  last_seen: string;
}

export interface ErrorAggregate {
  fingerprint: string;
  message: string;
  count: number;
  affected_pages: string[];
  affected_sessions: number;
  first_seen: string;
  last_seen: string;
  sample_stack: string | null;
  impact_score: number;
}

/* -------------------------------------------------------------------------- */
/*  Error Fingerprinting                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Generate a stable fingerprint for an error to group duplicates.
 * Uses message + first meaningful stack frame.
 */
export function generateFingerprint(message: string, stack: string | null): string {
  const normalizedMsg = message
    .replace(/\d+/g, "N")       // Replace numbers
    .replace(/['"][^'"]*['"]/g, "S")  // Replace string literals
    .slice(0, 200);

  let frame = "";
  if (stack) {
    const lines = stack.split("\n").filter((l) => l.includes("at "));
    // Skip frames from error-monitor itself
    const meaningful = lines.find(
      (l) => !l.includes("error-monitor") && !l.includes("captureError"),
    );
    if (meaningful) {
      frame = meaningful.trim().replace(/:\d+:\d+\)?$/, "");
    }
  }

  // Simple hash from the combined string
  const combined = `${normalizedMsg}|${frame}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `err-${Math.abs(hash).toString(36)}`;
}

/* -------------------------------------------------------------------------- */
/*  Error Capture                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Capture a JS error with session context.
 */
export function captureError(
  message: string,
  stack: string | null,
  page_url: string,
  user_agent: string,
  session_id: string | null,
  dealer_id: string,
  context: Partial<ErrorContext> = {},
): ClientError {
  const fullContext: ErrorContext = {
    page: context.page ?? page_url,
    component: context.component ?? null,
    user_actions: context.user_actions ?? [],
    viewport_width: context.viewport_width ?? null,
    viewport_height: context.viewport_height ?? null,
    connection_type: context.connection_type ?? null,
  };

  return {
    id: `cerr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    message,
    stack,
    fingerprint: generateFingerprint(message, stack),
    page_url,
    user_agent,
    session_id,
    dealer_id,
    captured_at: new Date().toISOString(),
    context: fullContext,
  };
}

/* -------------------------------------------------------------------------- */
/*  Behavior Correlation                                                       */
/* -------------------------------------------------------------------------- */

export interface CorrelatedError {
  error: ClientError;
  session_events: string[];
  replay_available: boolean;
}

/**
 * Correlate an error with the user's session for replay.
 */
export function correlateWithBehavior(
  error: ClientError,
  sessionEvents: string[],
): CorrelatedError {
  return {
    error,
    session_events: sessionEvents,
    replay_available: error.session_id !== null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Aggregation                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Aggregate errors by fingerprint, counting occurrences and affected pages.
 */
export function aggregateErrors(errors: ClientError[]): ErrorAggregate[] {
  const groups = new Map<string, ClientError[]>();

  for (const err of errors) {
    const existing = groups.get(err.fingerprint) ?? [];
    existing.push(err);
    groups.set(err.fingerprint, existing);
  }

  const aggregates: ErrorAggregate[] = [];

  for (const [fingerprint, group] of groups) {
    const pages = new Set(group.map((e) => e.page_url));
    const sessions = new Set(group.filter((e) => e.session_id).map((e) => e.session_id));
    const sorted = group.sort(
      (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime(),
    );

    aggregates.push({
      fingerprint,
      message: group[0].message,
      count: group.length,
      affected_pages: Array.from(pages),
      affected_sessions: sessions.size,
      first_seen: sorted[0].captured_at,
      last_seen: sorted[sorted.length - 1].captured_at,
      sample_stack: group[0].stack,
      impact_score: rankByImpact(group.length, sessions.size, pages.size),
    });
  }

  return aggregates.sort((a, b) => b.impact_score - a.impact_score);
}

/* -------------------------------------------------------------------------- */
/*  Trend Detection                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Determine if an error is increasing, decreasing, or stable over time.
 */
export function getErrorTrend(
  errors: ClientError[],
  fingerprint: string,
  days: number = 7,
): ErrorTrend {
  const matching = errors.filter((e) => e.fingerprint === fingerprint);
  const now = Date.now();
  const msPerDay = 86400_000;

  const occurrences: Array<{ date: string; count: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = now - (i + 1) * msPerDay;
    const dayEnd = now - i * msPerDay;
    const count = matching.filter((e) => {
      const t = new Date(e.captured_at).getTime();
      return t >= dayStart && t < dayEnd;
    }).length;
    const date = new Date(dayStart).toISOString().slice(0, 10);
    occurrences.push({ date, count });
  }

  // Simple trend: compare first half to second half
  const mid = Math.floor(occurrences.length / 2);
  const firstHalf = occurrences.slice(0, mid).reduce((s, o) => s + o.count, 0);
  const secondHalf = occurrences.slice(mid).reduce((s, o) => s + o.count, 0);

  let direction: ErrorTrend["direction"] = "stable";
  if (secondHalf > firstHalf * 1.25) direction = "increasing";
  else if (secondHalf < firstHalf * 0.75) direction = "decreasing";

  const sorted = matching.sort(
    (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime(),
  );

  return {
    fingerprint,
    message: matching[0]?.message ?? "Unknown",
    occurrences,
    direction,
    total_count: matching.length,
    first_seen: sorted[0]?.captured_at ?? new Date().toISOString(),
    last_seen: sorted[sorted.length - 1]?.captured_at ?? new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/*  Impact Ranking                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Rank errors by frequency * affected users * page importance.
 */
function rankByImpact(
  frequency: number,
  affectedSessions: number,
  affectedPages: number,
): number {
  return Math.round(frequency * Math.max(affectedSessions, 1) * Math.max(affectedPages, 1));
}

/**
 * Rank a list of error aggregates by impact score (already sorted in aggregateErrors).
 */
export function rankErrorsByImpact(errors: ErrorAggregate[]): ErrorAggregate[] {
  return [...errors].sort((a, b) => b.impact_score - a.impact_score);
}

/* -------------------------------------------------------------------------- */
/*  Demo Data                                                                  */
/* -------------------------------------------------------------------------- */

export function getDemoErrors(): ErrorAggregate[] {
  const now = Date.now();
  return [
    {
      fingerprint: "err-nav-undef",
      message: "Cannot read properties of undefined (reading 'map')",
      count: 23,
      affected_pages: ["/inventory", "/inventory/search"],
      affected_sessions: 18,
      first_seen: new Date(now - 7 * 86400_000).toISOString(),
      last_seen: new Date(now - 3600_000).toISOString(),
      sample_stack: "TypeError: Cannot read properties of undefined (reading 'map')\n    at InventoryGrid (inventory-grid.tsx:45:12)",
      impact_score: 828,
    },
    {
      fingerprint: "err-fetch-fail",
      message: "Failed to fetch",
      count: 15,
      affected_pages: ["/vdp", "/contact"],
      affected_sessions: 12,
      first_seen: new Date(now - 5 * 86400_000).toISOString(),
      last_seen: new Date(now - 7200_000).toISOString(),
      sample_stack: "TypeError: Failed to fetch\n    at submitForm (contact-form.tsx:23:8)",
      impact_score: 360,
    },
    {
      fingerprint: "err-chunk-load",
      message: "Loading chunk N failed",
      count: 8,
      affected_pages: ["/finance/calculator"],
      affected_sessions: 7,
      first_seen: new Date(now - 3 * 86400_000).toISOString(),
      last_seen: new Date(now - 86400_000).toISOString(),
      sample_stack: "ChunkLoadError: Loading chunk 342 failed.\n    at HTMLScriptElement.onScriptComplete",
      impact_score: 56,
    },
    {
      fingerprint: "err-resize",
      message: "ResizeObserver loop completed with undelivered notifications",
      count: 45,
      affected_pages: ["/", "/inventory", "/vdp", "/contact"],
      affected_sessions: 30,
      first_seen: new Date(now - 14 * 86400_000).toISOString(),
      last_seen: new Date(now - 600_000).toISOString(),
      sample_stack: null,
      impact_score: 5400,
    },
  ];
}
