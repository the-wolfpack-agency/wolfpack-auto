import { NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackSystem } from "@/lib/analytics-hooks";

/**
 * GET /api/admin/analytics/health
 *
 * Returns the health status of the analytics pipeline:
 * - Is the DB connected?
 * - Are events being stored?
 * - How many events in the last hour/day/week?
 * - Are all modules reporting?
 *
 * This is the canary that catches "events silently dropped" before
 * the learning system starves.
 */
export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    trackSystem("system.health_check", authResult.user.dealer_id ?? "", { shadow: true });
    return NextResponse.json({
      status: "shadow_mode",
      db_connected: false,
      events_last_hour: 0,
      events_last_day: 0,
      events_last_week: 0,
      modules_reporting: [],
      modules_silent: ["all — shadow mode active"],
      healthy: false,
      message: "No DATABASE_URL — analytics events are not being persisted. Set DATABASE_URL to activate the learning system.",
    });
  }

  try {
    const { query } = await import("@/lib/db");

    // Event counts by time window
    const counts = await query<{ last_hour: string; last_day: string; last_week: string }>(`
      SELECT
        COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '1 hour') AS last_hour,
        COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '1 day') AS last_day,
        COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '7 days') AS last_week
      FROM analytics_events
    `);
    const c = counts.rows[0];

    // Which modules have reported events in the last 7 days
    const modules = await query<{ module: string }>(`
      SELECT DISTINCT event_type AS module
      FROM analytics_events
      WHERE timestamp >= NOW() - INTERVAL '7 days'
      ORDER BY module
    `);
    const reporting = modules.rows.map((r) => r.module);

    // Expected modules
    const EXPECTED_MODULES = [
      "deal", "service", "comms", "accounting", "review",
      "retail", "customer", "document", "knowledge", "security",
      "compliance", "lender", "credit",
    ];
    const silent = EXPECTED_MODULES.filter((m) => !reporting.includes(m));

    const lastHour = parseInt(c.last_hour);
    const lastDay = parseInt(c.last_day);
    const lastWeek = parseInt(c.last_week);

    // Healthy = at least 1 event in the last day
    const healthy = lastDay > 0;

    trackSystem("system.health_check", authResult.user.dealer_id ?? "", { healthy, events_last_day: lastDay });

    return NextResponse.json({
      status: healthy ? "healthy" : "degraded",
      db_connected: true,
      events_last_hour: lastHour,
      events_last_day: lastDay,
      events_last_week: lastWeek,
      modules_reporting: reporting,
      modules_silent: silent,
      healthy,
      message: healthy
        ? `Analytics pipeline active — ${lastDay} events in the last 24 hours.`
        : "No events in the last 24 hours. The learning system may not be receiving data.",
    });
  } catch (err) {
    console.error("[analytics/health] DB error:", err);
    return NextResponse.json({
      status: "error",
      db_connected: false,
      events_last_hour: 0,
      events_last_day: 0,
      events_last_week: 0,
      modules_reporting: [],
      modules_silent: ["all — DB error"],
      healthy: false,
      message: "Database connection failed. Analytics events cannot be persisted.",
    });
  }
}
