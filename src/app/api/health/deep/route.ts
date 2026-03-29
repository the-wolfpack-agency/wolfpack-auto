/**
 * GET /api/health/deep
 *
 * Production canary endpoint — deep verification that the deployment is
 * operating against real infrastructure, NOT silently falling back to
 * Shadow Mode.
 *
 * Probes:
 *   1. Shadow mode detection — is DATABASE_URL set AND connected?
 *   2. Database connectivity — SELECT 1 + table count
 *   3. Write roundtrip — INSERT → SELECT → DELETE on canary_probes table
 *   4. Elasticsearch — ping + vehicle index + document count
 *   5. Analytics pipeline — persist a canary event, read it back, delete it
 *
 * Auth: Requires `x-canary-secret` header matching CANARY_SECRET env var.
 * This endpoint is exempt from session auth (health paths are public)
 * but protected by a shared secret so infrastructure details stay private.
 *
 * No caching — every call runs fresh probes. Only called post-deploy, not
 * on a polling loop.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface ProbeResult {
  status: "pass" | "fail" | "skip";
  latencyMs: number;
  detail: string;
  error?: string;
}

interface DeepHealthResponse {
  status: "healthy" | "degraded" | "critical" | "shadow";
  timestamp: string;
  responseTimeMs: number;

  shadowMode: {
    active: boolean;
    databaseUrlSet: boolean;
    detected: boolean;
  };

  probes: {
    database: ProbeResult & { tableCount?: number; circuitBreakerState?: string };
    writeRoundtrip: ProbeResult & { inserted?: boolean; readBack?: boolean; cleaned?: boolean };
    elasticsearch: ProbeResult & { indexExists?: boolean; documentCount?: number };
    analyticsPipeline: ProbeResult & { eventPersisted?: boolean; eventsLastHour?: number };
  };

  deployment: {
    commitHash: string;
    environment: string;
    url: string;
  };

  canary: {
    runId: string;
    probeCount: number;
    passCount: number;
    failCount: number;
    skipCount: number;
    verdict: "PASS" | "FAIL";
  };
}

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

function authorizeCanary(request: NextRequest): boolean {
  const secret = process.env.CANARY_SECRET;
  if (!secret) {
    // If no secret configured, allow in development/demo only
    return process.env.NODE_ENV === "development" || process.env.DEMO_MODE === "true";
  }
  return request.headers.get("x-canary-secret") === secret;
}

/* -------------------------------------------------------------------------- */
/* Probe: Database                                                             */
/* -------------------------------------------------------------------------- */

async function probeDatabase(): Promise<ProbeResult & { tableCount?: number; circuitBreakerState?: string }> {
  if (!process.env.DATABASE_URL) {
    return { status: "fail", latencyMs: 0, detail: "DATABASE_URL not set — shadow mode active" };
  }

  const start = Date.now();
  try {
    const { query } = await import("@/lib/db");
    const { circuitBreaker } = await import("@/lib/circuit-breaker");

    const cbState = circuitBreaker.getState();
    if (cbState === "OPEN") {
      return {
        status: "fail",
        latencyMs: 0,
        detail: "Circuit breaker OPEN — DB unreachable",
        circuitBreakerState: cbState,
      };
    }

    // Connectivity check
    await query("SELECT 1 AS ok");

    // Table count — proves real schema exists (shadow mode has no tables)
    const tableResult = await query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const tableCount = parseInt(tableResult.rows[0]?.cnt ?? "0", 10);

    circuitBreaker.recordSuccess();

    return {
      status: tableCount > 0 ? "pass" : "fail",
      latencyMs: Date.now() - start,
      detail: tableCount > 0
        ? `Connected — ${tableCount} tables in public schema`
        : "Connected but no tables found — schema may not be migrated",
      tableCount,
      circuitBreakerState: circuitBreaker.getState(),
    };
  } catch (err) {
    try {
      const { circuitBreaker } = await import("@/lib/circuit-breaker");
      circuitBreaker.recordFailure();
    } catch { /* ignore */ }

    return {
      status: "fail",
      latencyMs: Date.now() - start,
      detail: "Database query failed",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Probe: Write Roundtrip                                                      */
/* -------------------------------------------------------------------------- */

async function probeWriteRoundtrip(): Promise<
  ProbeResult & { inserted?: boolean; readBack?: boolean; cleaned?: boolean }
> {
  if (!process.env.DATABASE_URL) {
    return { status: "skip", latencyMs: 0, detail: "Skipped — no DATABASE_URL" };
  }

  const start = Date.now();
  const probeId = `canary-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const { query } = await import("@/lib/db");

    // Ensure canary_probes table exists (idempotent)
    await query(`
      CREATE TABLE IF NOT EXISTS canary_probes (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // INSERT
    await query("INSERT INTO canary_probes (id) VALUES ($1)", [probeId]);
    const inserted = true;

    // SELECT — read it back
    const readResult = await query<{ id: string }>(
      "SELECT id FROM canary_probes WHERE id = $1",
      [probeId],
    );
    const readBack = readResult.rows.length === 1 && readResult.rows[0].id === probeId;

    // DELETE — clean up
    await query("DELETE FROM canary_probes WHERE id = $1", [probeId]);
    const cleaned = true;

    // Also clean old canary probes (> 1 hour) in case a previous run crashed
    await query("DELETE FROM canary_probes WHERE created_at < NOW() - INTERVAL '1 hour'");

    return {
      status: readBack ? "pass" : "fail",
      latencyMs: Date.now() - start,
      detail: readBack
        ? "Write → Read → Delete roundtrip succeeded"
        : "Write succeeded but read-back failed",
      inserted,
      readBack,
      cleaned,
    };
  } catch (err) {
    // Attempt cleanup even on failure
    try {
      const { query: q } = await import("@/lib/db");
      await q("DELETE FROM canary_probes WHERE id = $1", [probeId]);
    } catch { /* best-effort cleanup */ }

    return {
      status: "fail",
      latencyMs: Date.now() - start,
      detail: "Write roundtrip failed",
      error: err instanceof Error ? err.message : "Unknown error",
      inserted: false,
      readBack: false,
      cleaned: false,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Probe: Elasticsearch                                                        */
/* -------------------------------------------------------------------------- */

async function probeElasticsearch(): Promise<
  ProbeResult & { indexExists?: boolean; documentCount?: number }
> {
  if (!process.env.ELASTICSEARCH_URL) {
    return { status: "skip", latencyMs: 0, detail: "ELASTICSEARCH_URL not configured" };
  }

  const start = Date.now();
  try {
    const { esClient, VEHICLES_INDEX } = await import("@/lib/elasticsearch");

    // Ping
    await esClient.ping();

    // Check vehicles index
    const indexExists = await esClient.indices.exists({ index: VEHICLES_INDEX });

    let documentCount = 0;
    if (indexExists) {
      const countResult = await esClient.count({ index: VEHICLES_INDEX });
      documentCount = countResult.count;
    }

    return {
      status: indexExists ? "pass" : "fail",
      latencyMs: Date.now() - start,
      detail: indexExists
        ? `Connected — ${documentCount} documents in ${VEHICLES_INDEX} index`
        : `Connected but ${VEHICLES_INDEX} index does not exist`,
      indexExists: !!indexExists,
      documentCount,
    };
  } catch (err) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      detail: "Elasticsearch unreachable",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Probe: Analytics Pipeline                                                   */
/* -------------------------------------------------------------------------- */

async function probeAnalyticsPipeline(): Promise<
  ProbeResult & { eventPersisted?: boolean; eventsLastHour?: number }
> {
  if (!process.env.DATABASE_URL) {
    return { status: "skip", latencyMs: 0, detail: "Skipped — no DATABASE_URL" };
  }

  const start = Date.now();
  const canaryAction = `system.canary_probe_${Date.now()}`;

  try {
    const { query } = await import("@/lib/db");

    // Write a canary analytics event (user_fingerprint is NOT NULL in schema)
    await query(
      `INSERT INTO analytics_events (event_type, action, page, session_id, user_fingerprint, metadata, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      ["system", canaryAction, "canary", "canary-probe", "canary-probe", JSON.stringify({ canary: true })],
    );

    // Read it back
    const readResult = await query<{ action: string }>(
      "SELECT action FROM analytics_events WHERE action = $1 AND session_id = 'canary-probe'",
      [canaryAction],
    );
    const eventPersisted = readResult.rows.length > 0;

    // Clean up canary events
    await query(
      "DELETE FROM analytics_events WHERE session_id = 'canary-probe'",
    );

    // Count recent events to verify pipeline is flowing
    const countResult = await query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM analytics_events
       WHERE timestamp >= NOW() - INTERVAL '1 hour'
         AND session_id != 'canary-probe'`,
    );
    const eventsLastHour = parseInt(countResult.rows[0]?.cnt ?? "0", 10);

    return {
      status: eventPersisted ? "pass" : "fail",
      latencyMs: Date.now() - start,
      detail: eventPersisted
        ? `Analytics pipeline verified — ${eventsLastHour} events in last hour`
        : "Canary event write succeeded but read-back failed",
      eventPersisted,
      eventsLastHour,
    };
  } catch (err) {
    // Clean up on failure
    try {
      const { query: q } = await import("@/lib/db");
      await q("DELETE FROM analytics_events WHERE session_id = 'canary-probe'");
    } catch { /* best-effort */ }

    return {
      status: "fail",
      latencyMs: Date.now() - start,
      detail: "Analytics pipeline probe failed",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* GET handler                                                                 */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  if (!authorizeCanary(request)) {
    return NextResponse.json(
      { error: "Unauthorized — x-canary-secret header required" },
      { status: 401 },
    );
  }

  const startTime = Date.now();
  const runId = `canary-${new Date().toISOString()}`;

  // Run all probes in parallel
  const [database, writeRoundtrip, elasticsearch, analyticsPipeline] = await Promise.all([
    probeDatabase(),
    probeWriteRoundtrip(),
    probeElasticsearch(),
    probeAnalyticsPipeline(),
  ]);

  const probes = { database, writeRoundtrip, elasticsearch, analyticsPipeline };

  // Tally results
  const allProbes = Object.values(probes);
  const passCount = allProbes.filter((p) => p.status === "pass").length;
  const failCount = allProbes.filter((p) => p.status === "fail").length;
  const skipCount = allProbes.filter((p) => p.status === "skip").length;

  // Shadow mode detection
  const shadowActive = !process.env.DATABASE_URL;
  const shadowDetected = shadowActive || database.status === "fail";

  // Overall status
  let status: DeepHealthResponse["status"];
  if (shadowActive) {
    status = "shadow";
  } else if (failCount === 0) {
    status = "healthy";
  } else if (database.status === "pass" && writeRoundtrip.status === "pass") {
    status = "degraded"; // core DB works, something else failed
  } else {
    status = "critical";
  }

  const verdict: "PASS" | "FAIL" = failCount === 0 ? "PASS" : "FAIL";

  const body: DeepHealthResponse = {
    status,
    timestamp: new Date().toISOString(),
    responseTimeMs: Date.now() - startTime,
    shadowMode: {
      active: shadowActive,
      databaseUrlSet: !!process.env.DATABASE_URL,
      detected: shadowDetected,
    },
    probes,
    deployment: {
      commitHash: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT ?? "unknown",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      url: process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : request.nextUrl.origin,
    },
    canary: {
      runId,
      probeCount: allProbes.length,
      passCount,
      failCount,
      skipCount,
      verdict,
    },
  };

  // Track the canary run in analytics (fire-and-forget)
  try {
    const { trackSystem } = await import("@/lib/analytics-hooks");
    trackSystem(
      verdict === "PASS" ? "system.canary_passed" : "system.canary_failed",
      "system",
      {
        run_id: runId,
        probe_count: allProbes.length,
        pass_count: passCount,
        fail_count: failCount,
        skip_count: skipCount,
        response_time_ms: Date.now() - startTime,
        commit: body.deployment.commitHash,
        environment: body.deployment.environment,
      },
    );
  } catch {
    /* analytics must never break the canary */
  }

  return NextResponse.json(body, {
    status: status === "critical" || status === "shadow" ? 503 : 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
