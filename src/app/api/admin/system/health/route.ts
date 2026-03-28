/**
 * GET /api/admin/system/health
 *
 * Comprehensive system health endpoint. Returns the status of every
 * dependency so the admin dashboard and auto-rollback script can
 * determine whether the deployment is healthy.
 */

import { NextResponse } from "next/server";
import { circuitBreaker } from "@/lib/circuit-breaker";
import type { CircuitBreakerState } from "@/lib/circuit-breaker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* -------------------------------------------------------------------------- */
/* Probe helpers                                                               */
/* -------------------------------------------------------------------------- */

interface ProbeResult {
  connected: boolean;
  latencyMs: number;
  error?: string;
}

async function probeDatabase(): Promise<ProbeResult & { circuitBreakerState: CircuitBreakerState }> {
  const cbState = circuitBreaker.getState();

  if (cbState === "OPEN") {
    return {
      connected: false,
      latencyMs: 0,
      circuitBreakerState: cbState,
      error: "Circuit breaker is OPEN — skipping DB probe",
    };
  }

  const start = Date.now();
  try {
    const { query } = await import("@/lib/db");
    await query("SELECT 1 AS ok");
    const latencyMs = Date.now() - start;
    circuitBreaker.recordSuccess();
    return { connected: true, latencyMs, circuitBreakerState: circuitBreaker.getState() };
  } catch (err) {
    const latencyMs = Date.now() - start;
    circuitBreaker.recordFailure();
    return {
      connected: false,
      latencyMs,
      circuitBreakerState: circuitBreaker.getState(),
      error: err instanceof Error ? err.message : "Unknown DB error",
    };
  }
}

async function probeRedis(): Promise<ProbeResult> {
  // Redis is optional — in-memory fallback is acceptable.
  // If a REDIS_URL is configured, try to ping it.
  if (!process.env.REDIS_URL) {
    return { connected: false, latencyMs: 0, error: "REDIS_URL not configured — using in-memory fallback" };
  }
  const start = Date.now();
  try {
    const response = await fetch(`${process.env.REDIS_URL}/ping`, {
      signal: AbortSignal.timeout(3_000),
    });
    return { connected: response.ok, latencyMs: Date.now() - start };
  } catch {
    return { connected: false, latencyMs: Date.now() - start, error: "Redis unreachable" };
  }
}

interface ExternalServiceStatus {
  name: string;
  configured: boolean;
  status: "ok" | "not_configured" | "error";
}

function checkExternalServices(): ExternalServiceStatus[] {
  return [
    {
      name: "Resend (email)",
      configured: !!process.env.RESEND_API_KEY,
      status: process.env.RESEND_API_KEY ? "ok" : "not_configured",
    },
    {
      name: "Twilio (SMS)",
      configured: !!process.env.TWILIO_ACCOUNT_SID,
      status: process.env.TWILIO_ACCOUNT_SID ? "ok" : "not_configured",
    },
    {
      name: "Sentry (errors)",
      configured: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
      status: process.env.NEXT_PUBLIC_SENTRY_DSN ? "ok" : "not_configured",
    },
    {
      name: "Analytics (Postgres)",
      configured: !!process.env.DATABASE_URL,
      status: process.env.DATABASE_URL ? "ok" : "not_configured",
    },
  ];
}

async function checkAnalyticsPipeline(dbConnected: boolean): Promise<{
  eventsFlowing: boolean;
  eventsLastHour: number;
  learningActive: boolean;
}> {
  if (!dbConnected || !process.env.DATABASE_URL) {
    return { eventsFlowing: false, eventsLastHour: 0, learningActive: false };
  }
  try {
    const { query } = await import("@/lib/db");
    const result = await query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM analytics_events
       WHERE timestamp >= NOW() - INTERVAL '1 hour'`,
    );
    const eventsLastHour = parseInt(result.rows[0]?.cnt ?? "0", 10);
    return {
      eventsFlowing: eventsLastHour > 0,
      eventsLastHour,
      learningActive: eventsLastHour > 0,
    };
  } catch {
    return { eventsFlowing: false, eventsLastHour: 0, learningActive: false };
  }
}

/* -------------------------------------------------------------------------- */
/* GET handler                                                                 */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const startTime = Date.now();

  // Run probes in parallel
  const [db, redis] = await Promise.all([probeDatabase(), probeRedis()]);

  const externalServices = checkExternalServices();
  const analytics = await checkAnalyticsPipeline(db.connected);

  // Determine overall status
  let overallStatus: "healthy" | "degraded" | "critical" = "healthy";

  if (!db.connected) {
    overallStatus = "critical";
  } else if (
    db.circuitBreakerState !== "CLOSED" ||
    !analytics.eventsFlowing ||
    externalServices.some((s) => s.configured && s.status === "error")
  ) {
    overallStatus = "degraded";
  }

  const uptimeSeconds = process.uptime();

  const body = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    responseTimeMs: Date.now() - startTime,

    database: {
      connected: db.connected,
      circuitBreakerState: db.circuitBreakerState,
      circuitBreakerFailures: circuitBreaker.getFailureCount(),
      cooldownRemainingMs: circuitBreaker.getCooldownRemaining(),
      queryLatencyMs: db.latencyMs,
      ...(db.error ? { error: db.error } : {}),
    },

    redis: {
      connected: redis.connected,
      latencyMs: redis.latencyMs,
      ...(redis.error ? { error: redis.error } : {}),
    },

    externalServices,

    analytics: {
      eventsFlowing: analytics.eventsFlowing,
      eventsLastHour: analytics.eventsLastHour,
      learningActive: analytics.learningActive,
    },

    deployment: {
      commitHash: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT ?? "unknown",
      deployedAt: process.env.VERCEL_GIT_COMMIT_DATE ?? "unknown",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    },

    uptime: {
      seconds: Math.floor(uptimeSeconds),
      formatted: formatUptime(uptimeSeconds),
    },
  };

  // Track the health check event
  try {
    const { trackSystem } = await import("@/lib/analytics-hooks");
    if (overallStatus === "critical") {
      trackSystem("system.health_critical", "system", { db_connected: db.connected });
    } else if (overallStatus === "degraded") {
      trackSystem("system.health_degraded", "system", { db_connected: db.connected });
    }
  } catch {
    /* analytics must not break health check */
  }

  const statusCode = overallStatus === "critical" ? 503 : 200;
  return NextResponse.json(body, { status: statusCode });
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}
