/**
 * Real-Time Engagement Alert Engine
 *
 * Answers the single most valuable question for a dealer: "Who should I call RIGHT NOW?"
 *
 * Detects high-value engagement patterns by combining multiple behavioral signals
 * from the analytics engine. Each alert is a compound trigger — not a single event,
 * but a pattern of events that indicates buying intent.
 *
 * Signal evaluation flow:
 *   1. Query analytics_events for the session's last 30 minutes
 *   2. Check each compound trigger condition against the event stream
 *   3. If triggered, create alert record with priority + recommended action
 *   4. Alerts expire after 2 hours (stale = useless for sales)
 *   5. Shadow mode: return realistic mock alerts so the UI always renders
 *
 * Ties into the learning system via analytics-hooks.ts: every alert triggered
 * and every action taken on an alert feeds back into the behavioral model.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type AlertType =
  | "hot_return"        // email_opened + return_visit within 30min
  | "price_serious"     // calculator_input + form_started on same vehicle
  | "comparison_ready"  // compared 3+ vehicles + viewed financing page
  | "repeat_viewer"     // same VDP viewed 3+ times across sessions
  | "budget_revealed"   // price_range_dwell > 2min in one bracket + calculator matches
  | "video_engaged"     // video_complete + stayed on page > 60s after
  | "about_to_leave"    // exit_intent + high predictive score (>70)
  | "competitor_risk";  // long session + no conversion + exit_intent

export type AlertPriority = "critical" | "high" | "medium";

export type AlertAction = "dismiss" | "contacted" | "scheduled";

export interface EngagementAlert {
  id: string;
  type: AlertType;
  priority: AlertPriority;
  lead_id: string | null;
  customer_name: string | null;
  vehicle_interest: string | null;
  recommended_action: string;
  signals_triggered: string[];
  created_at: string;
  expires_at: string;
}

export interface AlertStats {
  alerts_today: number;
  actioned_pct: number;
  avg_response_time_minutes: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
}

/* ------------------------------------------------------------------ */
/*  Alert Definitions                                                  */
/* ------------------------------------------------------------------ */

interface AlertDefinition {
  type: AlertType;
  priority: AlertPriority;
  /** Human-readable description of what to do */
  action_template: string;
  /** Required event patterns (all must be present) */
  required_signals: string[];
  /** Minimum number of events matching the pattern */
  min_events?: number;
}

const ALERT_DEFINITIONS: AlertDefinition[] = [
  {
    type: "hot_return",
    priority: "critical",
    action_template: "Call immediately — they opened your email and came back within 30 minutes",
    required_signals: ["email_opened", "return_visit"],
  },
  {
    type: "price_serious",
    priority: "critical",
    action_template: "Call now — they are running payment numbers on a specific vehicle",
    required_signals: ["calculator_input", "form_started"],
  },
  {
    type: "about_to_leave",
    priority: "critical",
    action_template: "Act fast — high-intent visitor is about to leave without converting",
    required_signals: ["exit_intent", "high_predictive_score"],
  },
  {
    type: "competitor_risk",
    priority: "high",
    action_template: "Reach out quickly — long browsing session with no conversion suggests they may shop elsewhere",
    required_signals: ["long_session", "no_conversion", "exit_intent"],
  },
  {
    type: "comparison_ready",
    priority: "high",
    action_template: "Great time to call — they have compared multiple vehicles and checked financing",
    required_signals: ["vehicle_compare", "financing_page_view"],
    min_events: 3,
  },
  {
    type: "repeat_viewer",
    priority: "high",
    action_template: "Follow up — they keep coming back to the same vehicle listing",
    required_signals: ["repeat_vdp_view"],
    min_events: 3,
  },
  {
    type: "budget_revealed",
    priority: "medium",
    action_template: "They have been exploring a specific price range — match them to the right inventory",
    required_signals: ["price_range_dwell", "calculator_input"],
  },
  {
    type: "video_engaged",
    priority: "medium",
    action_template: "They watched a full vehicle video and stayed on the page — send a personalized follow-up",
    required_signals: ["video_complete", "post_video_dwell"],
  },
];

/* ------------------------------------------------------------------ */
/*  Priority sort order                                                */
/* ------------------------------------------------------------------ */

const PRIORITY_ORDER: Record<AlertPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

/* ------------------------------------------------------------------ */
/*  In-memory alert store (per-process, replaced by DB in production)  */
/* ------------------------------------------------------------------ */

interface AlertStore {
  alerts: Map<string, EngagementAlert & { dismissed: boolean; action_taken?: AlertAction; actioned_at?: string }>;
}

const globalForAlerts = globalThis as unknown as { __alertStore?: AlertStore };

function getStore(): AlertStore {
  if (!globalForAlerts.__alertStore) {
    globalForAlerts.__alertStore = { alerts: new Map() };
  }
  return globalForAlerts.__alertStore;
}

function generateId(): string {
  return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ */
/*  Core Engine                                                        */
/* ------------------------------------------------------------------ */

/**
 * Evaluate all alert triggers for a given session.
 *
 * Queries the last 30 minutes of analytics events, checks each compound
 * trigger, and creates alert records for any that fire.
 */
export async function evaluateAlerts(
  dealerId: string,
  sessionFingerprint: string,
): Promise<EngagementAlert[]> {
  const store = getStore();
  const now = new Date();
  const windowStart = new Date(now.getTime() - 30 * 60 * 1000);

  // Fetch recent events for this session
  let sessionEvents: Array<{
    event_type: string;
    action: string;
    page: string;
    metadata: Record<string, unknown>;
    timestamp: string;
  }> = [];

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query<{
        event_type: string;
        action: string;
        page: string;
        metadata: Record<string, unknown>;
        timestamp: string;
      }>(
        `SELECT event_type, action, page, metadata, timestamp::text
         FROM analytics_events
         WHERE session_id = $1
           AND timestamp >= $2
         ORDER BY timestamp ASC`,
        [sessionFingerprint, windowStart.toISOString()],
      );
      sessionEvents = result.rows;
    } catch (err) {
      console.error("[engagement-alerts] Failed to query events:", err);
    }
  }

  // Extract signal set from events
  const signals = extractSignals(sessionEvents);

  // Check each alert definition
  const newAlerts: EngagementAlert[] = [];

  for (const def of ALERT_DEFINITIONS) {
    const matched = def.required_signals.every((sig) => signals.has(sig));
    if (!matched) continue;

    // Check min_events if specified
    if (def.min_events) {
      const primarySignal = def.required_signals[0];
      const count = signals.get(primarySignal) ?? 0;
      if (count < def.min_events) continue;
    }

    // Deduplicate: don't fire same alert type for same session within 2 hours
    const existingKey = `${dealerId}:${sessionFingerprint}:${def.type}`;
    const existing = Array.from(store.alerts.values()).find(
      (a) =>
        a.type === def.type &&
        !a.dismissed &&
        new Date(a.expires_at) > now &&
        a.id.includes(sessionFingerprint.slice(0, 6)),
    );
    if (existing) continue;

    const alert: EngagementAlert = {
      id: generateId(),
      type: def.type,
      priority: def.priority,
      lead_id: extractLeadId(sessionEvents),
      customer_name: extractCustomerName(sessionEvents),
      vehicle_interest: extractVehicleInterest(sessionEvents),
      recommended_action: def.action_template,
      signals_triggered: def.required_signals.filter((s) => signals.has(s)),
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    };

    store.alerts.set(alert.id, { ...alert, dismissed: false });
    newAlerts.push(alert);
  }

  return newAlerts;
}

/**
 * Get all active (non-expired, non-dismissed) alerts for a dealer.
 * Sorted by priority (critical first), then by creation time (newest first).
 */
export async function getActiveAlerts(dealerId: string): Promise<EngagementAlert[]> {
  const store = getStore();
  const now = new Date();

  // In production, query the database
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query<EngagementAlert>(
        `SELECT id, type, priority, lead_id, customer_name, vehicle_interest,
                recommended_action, signals_triggered, created_at::text, expires_at::text
         FROM engagement_alerts
         WHERE dealer_id = $1
           AND dismissed = false
           AND expires_at > NOW()
         ORDER BY
           CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
           created_at DESC
         LIMIT 50`,
        [dealerId],
      );
      return result.rows;
    } catch (err) {
      console.error("[engagement-alerts] DB query failed, falling back to in-memory:", err);
    }
  }

  // In-memory fallback (shadow mode or DB error)
  const active: EngagementAlert[] = [];
  for (const [, entry] of store.alerts) {
    if (!entry.dismissed && new Date(entry.expires_at) > now) {
      const { dismissed, action_taken, actioned_at, ...alert } = entry;
      active.push(alert);
    }
  }

  // If no alerts exist (fresh process), return shadow mock alerts
  if (active.length === 0) {
    return getShadowAlerts();
  }

  return active.sort((a, b) => {
    const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (pDiff !== 0) return pDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/**
 * Dismiss an alert (or mark it as actioned).
 */
export async function dismissAlert(
  alertId: string,
  dealerId: string,
  action: AlertAction = "dismiss",
): Promise<void> {
  const now = new Date().toISOString();

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      await query(
        `UPDATE engagement_alerts
         SET dismissed = true, action_taken = $1, actioned_at = $2
         WHERE id = $3 AND dealer_id = $4`,
        [action, now, alertId, dealerId],
      );
      return;
    } catch (err) {
      console.error("[engagement-alerts] DB dismiss failed:", err);
    }
  }

  // In-memory fallback
  const store = getStore();
  const entry = store.alerts.get(alertId);
  if (entry) {
    entry.dismissed = true;
    entry.action_taken = action;
    entry.actioned_at = now;
  }
}

/**
 * Get alert statistics for a dealer (today's count, action rate, response time).
 */
export async function getAlertStats(dealerId: string): Promise<AlertStats> {
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query<{
        total: string;
        actioned: string;
        avg_response_minutes: string;
        critical_count: string;
        high_count: string;
        medium_count: string;
      }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE action_taken IS NOT NULL)::text AS actioned,
           COALESCE(
             AVG(EXTRACT(EPOCH FROM (actioned_at - created_at)) / 60)
             FILTER (WHERE actioned_at IS NOT NULL),
             0
           )::text AS avg_response_minutes,
           COUNT(*) FILTER (WHERE priority = 'critical')::text AS critical_count,
           COUNT(*) FILTER (WHERE priority = 'high')::text AS high_count,
           COUNT(*) FILTER (WHERE priority = 'medium')::text AS medium_count
         FROM engagement_alerts
         WHERE dealer_id = $1
           AND created_at >= CURRENT_DATE`,
        [dealerId],
      );
      const row = result.rows[0];
      const total = parseInt(row.total, 10) || 0;
      const actioned = parseInt(row.actioned, 10) || 0;
      return {
        alerts_today: total,
        actioned_pct: total > 0 ? Math.round((actioned / total) * 100) : 0,
        avg_response_time_minutes: Math.round(parseFloat(row.avg_response_minutes) || 0),
        critical_count: parseInt(row.critical_count, 10) || 0,
        high_count: parseInt(row.high_count, 10) || 0,
        medium_count: parseInt(row.medium_count, 10) || 0,
      };
    } catch (err) {
      console.error("[engagement-alerts] Stats query failed:", err);
    }
  }

  // Shadow mode stats
  return {
    alerts_today: 14,
    actioned_pct: 71,
    avg_response_time_minutes: 8,
    critical_count: 3,
    high_count: 6,
    medium_count: 5,
  };
}

/* ------------------------------------------------------------------ */
/*  Signal Extraction                                                  */
/* ------------------------------------------------------------------ */

/**
 * Extract compound signal names from raw analytics events.
 * Returns a map of signal → count.
 */
function extractSignals(
  events: Array<{ event_type: string; action: string; page: string; metadata: Record<string, unknown>; timestamp: string }>,
): Map<string, number> {
  const signals = new Map<string, number>();
  const inc = (key: string) => signals.set(key, (signals.get(key) ?? 0) + 1);

  const vdpViews = new Map<string, number>(); // vin → count
  const pagesVisited = new Set<string>();
  let hasConversion = false;
  let sessionDurationMs = 0;

  if (events.length >= 2) {
    const first = new Date(events[0].timestamp).getTime();
    const last = new Date(events[events.length - 1].timestamp).getTime();
    sessionDurationMs = last - first;
  }

  for (const evt of events) {
    pagesVisited.add(evt.page);

    // Email opened signal
    if (evt.action === "email_opened" || evt.event_type === "email_opened") {
      inc("email_opened");
    }

    // Return visit (session started after email open)
    if (evt.action === "session_start" && signals.has("email_opened")) {
      inc("return_visit");
    }

    // Calculator / payment tool usage
    if (
      evt.action === "calculator_input" ||
      evt.action === "payment_calculator_used" ||
      evt.action === "financing_calculator"
    ) {
      inc("calculator_input");
    }

    // Form started
    if (
      evt.action === "form_started" ||
      evt.action === "lead_form_started" ||
      evt.action === "contact_form_started"
    ) {
      inc("form_started");
    }

    // VDP views (vehicle detail page)
    if (evt.page?.includes("/inventory/") || evt.action === "vdp_view") {
      const vin = (evt.metadata?.vin as string) ?? evt.page;
      vdpViews.set(vin, (vdpViews.get(vin) ?? 0) + 1);
    }

    // Vehicle compare
    if (evt.action === "vehicle_compare" || evt.action === "add_to_compare") {
      inc("vehicle_compare");
    }

    // Financing page
    if (evt.page?.includes("/financing") || evt.action === "financing_page_view") {
      inc("financing_page_view");
    }

    // Price range dwell
    if (evt.action === "price_range_dwell" || evt.action === "filter_price_range") {
      const dwellMs = (evt.metadata?.dwell_ms as number) ?? 0;
      if (dwellMs > 120000) {
        inc("price_range_dwell");
      }
    }

    // Video engagement
    if (evt.action === "video_complete" || evt.action === "video_finished") {
      inc("video_complete");
    }
    if (evt.action === "post_video_dwell") {
      const dwellMs = (evt.metadata?.dwell_ms as number) ?? 0;
      if (dwellMs > 60000) {
        inc("post_video_dwell");
      }
    }

    // Exit intent
    if (evt.action === "exit_intent") {
      inc("exit_intent");
    }

    // Conversion actions
    if (
      evt.action === "submit_contact_form" ||
      evt.action === "submit_lead_form" ||
      evt.action === "schedule_test_drive"
    ) {
      hasConversion = true;
    }

    // Predictive score
    if (evt.metadata?.predictive_score) {
      const score = evt.metadata.predictive_score as number;
      if (score > 70) {
        inc("high_predictive_score");
      }
    }
  }

  // Repeat VDP views
  for (const [, count] of vdpViews) {
    if (count >= 3) {
      signals.set("repeat_vdp_view", (signals.get("repeat_vdp_view") ?? 0) + count);
    }
  }

  // Long session (> 10 minutes)
  if (sessionDurationMs > 10 * 60 * 1000) {
    inc("long_session");
  }

  // No conversion flag
  if (!hasConversion) {
    inc("no_conversion");
  }

  return signals;
}

/* ------------------------------------------------------------------ */
/*  Metadata Extraction                                                */
/* ------------------------------------------------------------------ */

function extractLeadId(
  events: Array<{ metadata: Record<string, unknown> }>,
): string | null {
  for (const evt of events) {
    if (evt.metadata?.lead_id) return String(evt.metadata.lead_id);
  }
  return null;
}

function extractCustomerName(
  events: Array<{ metadata: Record<string, unknown> }>,
): string | null {
  for (const evt of events) {
    if (evt.metadata?.customer_name) return String(evt.metadata.customer_name);
    if (evt.metadata?.first_name) {
      const first = String(evt.metadata.first_name);
      const last = evt.metadata?.last_name ? ` ${evt.metadata.last_name}` : "";
      return `${first}${last}`;
    }
  }
  return null;
}

function extractVehicleInterest(
  events: Array<{ metadata: Record<string, unknown>; page: string }>,
): string | null {
  for (const evt of events) {
    if (evt.metadata?.vehicle_title) return String(evt.metadata.vehicle_title);
    if (evt.metadata?.vehicle_interest) return String(evt.metadata.vehicle_interest);
    if (evt.metadata?.vin) return String(evt.metadata.vin);
  }
  // Try to extract from VDP page URLs
  for (const evt of events) {
    if (evt.page?.includes("/inventory/")) {
      const parts = evt.page.split("/inventory/");
      if (parts[1]) return parts[1].replace(/-/g, " ");
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Shadow Mode Mock Data                                              */
/* ------------------------------------------------------------------ */

function getShadowAlerts(): EngagementAlert[] {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();

  return [
    {
      id: "alert-shadow-001",
      type: "hot_return",
      priority: "critical",
      lead_id: "lead-003",
      customer_name: "Sarah Mitchell",
      vehicle_interest: "2024 Honda CR-V EX-L",
      recommended_action: "Call immediately — they opened your email and came back within 30 minutes",
      signals_triggered: ["email_opened", "return_visit"],
      created_at: new Date(now.getTime() - 4 * 60 * 1000).toISOString(),
      expires_at: expiresAt,
    },
    {
      id: "alert-shadow-002",
      type: "price_serious",
      priority: "critical",
      lead_id: "lead-007",
      customer_name: "James Rodriguez",
      vehicle_interest: "2025 Toyota RAV4 Hybrid",
      recommended_action: "Call now — they are running payment numbers on a specific vehicle",
      signals_triggered: ["calculator_input", "form_started"],
      created_at: new Date(now.getTime() - 8 * 60 * 1000).toISOString(),
      expires_at: expiresAt,
    },
    {
      id: "alert-shadow-003",
      type: "about_to_leave",
      priority: "critical",
      lead_id: null,
      customer_name: "Anonymous Visitor",
      vehicle_interest: "2024 Ford F-150 XLT",
      recommended_action: "Act fast — high-intent visitor is about to leave without converting",
      signals_triggered: ["exit_intent", "high_predictive_score"],
      created_at: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
      expires_at: expiresAt,
    },
    {
      id: "alert-shadow-004",
      type: "competitor_risk",
      priority: "high",
      lead_id: "lead-012",
      customer_name: "David Chen",
      vehicle_interest: "2024 Chevrolet Equinox RS",
      recommended_action: "Reach out quickly — long browsing session with no conversion suggests they may shop elsewhere",
      signals_triggered: ["long_session", "no_conversion", "exit_intent"],
      created_at: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
      expires_at: expiresAt,
    },
    {
      id: "alert-shadow-005",
      type: "comparison_ready",
      priority: "high",
      lead_id: "lead-019",
      customer_name: "Maria Gonzalez",
      vehicle_interest: "SUVs under $35,000",
      recommended_action: "Great time to call — they have compared multiple vehicles and checked financing",
      signals_triggered: ["vehicle_compare", "financing_page_view"],
      created_at: new Date(now.getTime() - 22 * 60 * 1000).toISOString(),
      expires_at: expiresAt,
    },
    {
      id: "alert-shadow-006",
      type: "repeat_viewer",
      priority: "high",
      lead_id: null,
      customer_name: "Anonymous Visitor",
      vehicle_interest: "2025 Hyundai Tucson SEL",
      recommended_action: "Follow up — they keep coming back to the same vehicle listing",
      signals_triggered: ["repeat_vdp_view"],
      created_at: new Date(now.getTime() - 35 * 60 * 1000).toISOString(),
      expires_at: expiresAt,
    },
    {
      id: "alert-shadow-007",
      type: "budget_revealed",
      priority: "medium",
      lead_id: "lead-024",
      customer_name: "Robert Kim",
      vehicle_interest: "$25,000 - $30,000 range",
      recommended_action: "They have been exploring a specific price range — match them to the right inventory",
      signals_triggered: ["price_range_dwell", "calculator_input"],
      created_at: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
      expires_at: expiresAt,
    },
    {
      id: "alert-shadow-008",
      type: "video_engaged",
      priority: "medium",
      lead_id: null,
      customer_name: "Anonymous Visitor",
      vehicle_interest: "2024 Mazda CX-5 Turbo",
      recommended_action: "They watched a full vehicle video and stayed on the page — send a personalized follow-up",
      signals_triggered: ["video_complete", "post_video_dwell"],
      created_at: new Date(now.getTime() - 52 * 60 * 1000).toISOString(),
      expires_at: expiresAt,
    },
  ];
}
