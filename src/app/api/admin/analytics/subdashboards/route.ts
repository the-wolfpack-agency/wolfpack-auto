import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

/**
 * Sub-Dashboard Aggregation API
 *
 * GET: Returns a unified view of all analytics sub-dashboards, allowing
 *      the main dashboard to consume metrics from every specialized view.
 *
 * Each sub-dashboard contributes:
 *   - name: Human-readable sub-dashboard name
 *   - path: Admin route path
 *   - api: API endpoint it reads from
 *   - health: Whether the sub-dashboard's data source is healthy
 *   - key_metrics: The most important numbers from that sub-dashboard
 *   - last_updated: When the data was last refreshed
 *
 * The main /admin/analytics dashboard can import this to show a
 * bird's-eye view of every sub-dashboard without navigating to each.
 */

/* ------------------------------------------------------------------ */
/*  Sub-dashboard registry                                              */
/* ------------------------------------------------------------------ */

interface SubDashboard {
  name: string;
  path: string;
  api: string;
  category: "analytics" | "operations" | "intelligence" | "health";
  description: string;
}

const SUB_DASHBOARDS: SubDashboard[] = [
  {
    name: "Lead Analytics",
    path: "/admin/analytics/leads",
    api: "/api/admin/analytics/dashboard",
    category: "analytics",
    description: "Lead temperature trends, source breakdown, response times, conversion by channel",
  },
  {
    name: "Inventory Analytics",
    path: "/admin/analytics/inventory",
    api: "/api/admin/analytics/dashboard",
    category: "analytics",
    description: "Days on lot, price vs views, inventory gaps, slow mover repricing",
  },
  {
    name: "Platform Health",
    path: "/admin/analytics/platform-health",
    api: "/api/admin/analytics/platform-health",
    category: "health",
    description: "Session metrics, friction hotspots, feature adoption, form completion rates",
  },
  {
    name: "Analytics Brain",
    path: "/admin/analytics-brain",
    api: "/api/admin/analytics/dashboard",
    category: "intelligence",
    description: "Real-time behavioral intelligence, prediction calibration, priority alerts",
  },
  {
    name: "Funnel Health",
    path: "/admin/funnel-health",
    api: "/api/admin/funnel-health",
    category: "health",
    description: "Lead funnel score, SLA compliance, conversion stages, overdue alerts",
  },
  {
    name: "Engagement Reports",
    path: "/admin/engagement-reports",
    api: "/api/admin/engagement-reports",
    category: "analytics",
    description: "Team engagement, win rate, competitor mentions, interaction logging",
  },
  {
    name: "Market Intelligence",
    path: "/admin/market-intelligence",
    api: "/api/admin/analytics/intelligence",
    category: "intelligence",
    description: "Pricing benchmarks, regional demand, network insights",
  },
  {
    name: "Competitive Intel",
    path: "/admin/competitive",
    api: "/api/admin/competitive",
    category: "intelligence",
    description: "Competitor tracking, pricing observations, campaign monitoring",
  },
  {
    name: "Analytics Verification",
    path: "/admin/analytics/verification",
    api: "/api/admin/analytics/verification",
    category: "health",
    description: "Verifies all 21 analytics modules fire and persist correctly",
  },
];

/* ------------------------------------------------------------------ */
/*  Fetch key metrics from each sub-dashboard's API                     */
/* ------------------------------------------------------------------ */

interface SubDashboardStatus {
  name: string;
  path: string;
  category: string;
  description: string;
  healthy: boolean;
  key_metrics: Record<string, number | string | boolean>;
  last_checked: string;
  error?: string;
}

async function fetchSubDashboardStatus(
  sub: SubDashboard,
  baseUrl: string,
  cookie: string,
): Promise<SubDashboardStatus> {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}${sub.api}`, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      return {
        name: sub.name,
        path: sub.path,
        category: sub.category,
        description: sub.description,
        healthy: false,
        key_metrics: {},
        last_checked: new Date().toISOString(),
        error: `HTTP ${res.status}`,
      };
    }

    const data = await res.json();

    // Extract key metrics based on the sub-dashboard type
    const key_metrics = extractKeyMetrics(sub.name, data);

    return {
      name: sub.name,
      path: sub.path,
      category: sub.category,
      description: sub.description,
      healthy: true,
      key_metrics,
      last_checked: new Date().toISOString(),
    };
  } catch (err) {
    return {
      name: sub.name,
      path: sub.path,
      category: sub.category,
      description: sub.description,
      healthy: false,
      key_metrics: {},
      last_checked: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function extractKeyMetrics(
  name: string,
  data: Record<string, unknown>,
): Record<string, number | string | boolean> {
  const metrics: Record<string, number | string | boolean> = {};

  // Extract the most important number from each sub-dashboard response
  if (data.keyMetrics && typeof data.keyMetrics === "object") {
    const km = data.keyMetrics as Record<string, unknown>;
    if (km.conversionRate != null) metrics.conversion_rate = Number(km.conversionRate);
    if (km.visitors && typeof km.visitors === "object") {
      metrics.visitors_today = Number((km.visitors as Record<string, unknown>).today ?? 0);
    }
  }

  if (data.score != null) metrics.health_score = Number(data.score);
  if (data.passed != null) metrics.passed = Number(data.passed);
  if (data.failed != null) metrics.failed = Number(data.failed);
  if (data.total_modules != null) metrics.total_modules = Number(data.total_modules);

  // Verification-specific
  if (name === "Analytics Verification" && data.latest) {
    const latest = data.latest as Record<string, unknown>;
    if (latest.score != null) metrics.verification_score = Number(latest.score);
    if (latest.passed != null) metrics.modules_passing = Number(latest.passed);
  }

  return metrics;
}

/* ------------------------------------------------------------------ */
/*  Route handler                                                       */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      subdashboards: SUB_DASHBOARDS.map((sub) => ({
        name: sub.name,
        path: sub.path,
        category: sub.category,
        description: sub.description,
        healthy: false,
        key_metrics: {},
        last_checked: new Date().toISOString(),
        error: "DATABASE_URL not configured",
      })),
      summary: {
        total: SUB_DASHBOARDS.length,
        healthy: 0,
        degraded: SUB_DASHBOARDS.length,
        categories: { analytics: 0, operations: 0, intelligence: 0, health: 0 },
      },
    });
  }

  const auth = await requireAuth(request);
  if (auth) return auth;

  // Build base URL from request
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const host = request.headers.get("host") ?? "localhost:3000";
  const baseUrl = `${proto}://${host}`;
  const cookie = request.headers.get("cookie") ?? "";

  // Fetch all sub-dashboard statuses in parallel
  const statuses = await Promise.all(
    SUB_DASHBOARDS.map((sub) => fetchSubDashboardStatus(sub, baseUrl, cookie)),
  );

  // Build summary
  const healthy = statuses.filter((s) => s.healthy).length;
  const categories: Record<string, number> = {};
  for (const s of statuses) {
    if (s.healthy) {
      categories[s.category] = (categories[s.category] ?? 0) + 1;
    }
  }

  // Track this aggregation check as an analytics event
  try {
    const { trackSecurity } = await import("@/lib/analytics-hooks");
    trackSecurity("security.scan_completed", "system", {
      scan_type: "subdashboard_aggregation",
      total: statuses.length,
      healthy,
      degraded: statuses.length - healthy,
    });
  } catch {
    /* analytics must never throw */
  }

  return NextResponse.json({
    subdashboards: statuses,
    summary: {
      total: statuses.length,
      healthy,
      degraded: statuses.length - healthy,
      categories,
    },
  });
}
