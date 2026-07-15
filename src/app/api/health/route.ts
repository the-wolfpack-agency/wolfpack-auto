import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { redis, isRedisConfigured } from "@/lib/redis";
import { trackSystem } from "@/lib/analytics-hooks";

interface CheckResult {
  ok: boolean;
  latency_ms: number | null;
  error?: string;
  /** False when the dependency is intentionally absent in this environment. */
  configured?: boolean;
}

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  checks: {
    postgres: CheckResult;
    redis: CheckResult;
  };
}

async function checkPostgres(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await pool.query("SELECT 1");
    return { ok: true, latency_ms: Date.now() - start, configured: true };
  } catch (err) {
    return {
      ok: false,
      latency_ms: null,
      configured: true,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function checkRedis(): Promise<CheckResult> {
  // Redis is optional: rate-limit.ts falls back to an in-memory window that
  // still fails CLOSED. An absent Redis is a deliberate configuration, not an
  // outage, and must not be reported as one — pinging a client that is wired to
  // never connect only produces a misleading error string.
  if (!isRedisConfigured()) {
    return { ok: true, latency_ms: null, configured: false, error: "not_configured" };
  }
  const start = Date.now();
  try {
    await redis.ping();
    return { ok: true, latency_ms: Date.now() - start, configured: true };
  } catch (err) {
    return {
      ok: false,
      latency_ms: null,
      configured: true,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function GET() {
  const [postgres, redisCheck] = await Promise.allSettled([
    checkPostgres(),
    checkRedis(),
  ]);

  const pgResult: CheckResult =
    postgres.status === "fulfilled"
      ? postgres.value
      : { ok: false, latency_ms: null, configured: true, error: "Check failed" };

  const redisResult: CheckResult =
    redisCheck.status === "fulfilled"
      ? redisCheck.value
      : { ok: false, latency_ms: null, configured: true, error: "Check failed" };

  // Postgres is the only hard dependency: it is the source of truth, and its
  // loss is what makes the app unhealthy. An unconfigured Redis is deliberate
  // and must not hold the deploy at a permanent "degraded", which is noise that
  // masks a real outage when one happens.
  const configuredChecks = [pgResult, redisResult].filter((c) => c.configured !== false);
  const allOk = configuredChecks.every((c) => c.ok);

  const health: HealthStatus = {
    status: allOk ? "healthy" : pgResult.ok ? "degraded" : "unhealthy",
    timestamp: new Date().toISOString(),
    checks: {
      postgres: pgResult,
      redis: redisResult,
    },
  };

  // Feed the learning mechanism: every probe is a row, so degradation is
  // measurable over time rather than only visible to whoever curls the endpoint.
  // Reuses the existing SystemEvent vocabulary — no new event names.
  const dealerId = process.env.DEALER_ID ?? "system";
  trackSystem(
    health.status === "healthy"
      ? "system.health_check"
      : health.status === "degraded"
        ? "system.health_degraded"
        : "system.health_critical",
    dealerId,
    {
      postgres_ok: pgResult.ok,
      postgres_latency_ms: pgResult.latency_ms ?? -1,
      redis_ok: redisResult.ok,
      redis_configured: redisResult.configured !== false,
      redis_latency_ms: redisResult.latency_ms ?? -1,
    },
  );

  return NextResponse.json(health, { status: pgResult.ok ? 200 : 503 });
}
