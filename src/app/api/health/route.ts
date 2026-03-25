import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { redis } from "@/lib/redis";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  checks: {
    postgres: { ok: boolean; latency_ms: number | null; error?: string };
    redis: { ok: boolean; latency_ms: number | null; error?: string };
  };
}

async function checkPostgres(): Promise<{ ok: boolean; latency_ms: number | null; error?: string }> {
  const start = Date.now();
  try {
    await pool.query("SELECT 1");
    return { ok: true, latency_ms: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latency_ms: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function checkRedis(): Promise<{ ok: boolean; latency_ms: number | null; error?: string }> {
  const start = Date.now();
  try {
    await redis.ping();
    return { ok: true, latency_ms: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latency_ms: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function GET() {
  const [postgres, redisCheck] = await Promise.allSettled([
    checkPostgres(),
    checkRedis(),
  ]);

  const pgResult =
    postgres.status === "fulfilled"
      ? postgres.value
      : { ok: false, latency_ms: null, error: "Check failed" };

  const redisResult =
    redisCheck.status === "fulfilled"
      ? redisCheck.value
      : { ok: false, latency_ms: null, error: "Check failed" };

  const allOk = pgResult.ok && redisResult.ok;
  const anyOk = pgResult.ok || redisResult.ok;

  const health: HealthStatus = {
    status: allOk ? "healthy" : anyOk ? "degraded" : "unhealthy",
    timestamp: new Date().toISOString(),
    checks: {
      postgres: pgResult,
      redis: redisResult,
    },
  };

  return NextResponse.json(health, {
    status: allOk ? 200 : anyOk ? 200 : 503,
  });
}
