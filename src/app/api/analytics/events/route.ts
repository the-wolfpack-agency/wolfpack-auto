import { NextRequest, NextResponse } from "next/server";
import {
  ingestEvents,
  runAggregationPipeline,
  getBufferStats,
  type AnalyticsEvent,
} from "@/lib/analytics-engine";
import {
  getDataflowWarnings,
  getPgWriteStats,
  recordPgWrite,
} from "@/lib/dataflow-health";
import { writeEventsToSecondaryStores } from "@/lib/triple-write";

/** Log dataflow warnings once per process lifecycle. */
let dataflowWarningsLogged = false;
function logDataflowWarnings(): void {
  if (dataflowWarningsLogged) return;
  dataflowWarningsLogged = true;
  const warnings = getDataflowWarnings();
  if (warnings.length > 0) {
    console.error(
      `[DATAFLOW ALARM] ${warnings.length} data pipeline issue(s) detected:\n` +
        warnings.map((w) => `  ⚠ ${w}`).join("\n"),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  PostgreSQL event persistence                                       */
/* ------------------------------------------------------------------ */

let pgMigrationDone = false;

async function ensureEventsTable(): Promise<void> {
  if (pgMigrationDone) return;
  try {
    const { query } = await import("@/lib/db");
    await query(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id                BIGSERIAL    PRIMARY KEY,
        event_type        TEXT         NOT NULL,
        action            TEXT         NOT NULL,
        page              TEXT         NOT NULL,
        session_id        TEXT         NOT NULL,
        user_fingerprint  TEXT         NOT NULL,
        timestamp         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        metadata          JSONB        NOT NULL DEFAULT '{}'
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_events_session
        ON analytics_events (session_id)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_events_type
        ON analytics_events (event_type)
    `);
    pgMigrationDone = true;
  } catch (err) {
    console.error("[analytics-events] PG migration check failed:", err);
  }
}

/**
 * Persist a batch of events to PostgreSQL.
 *
 * IMPORTANT: This is awaited in the request handler. If DATABASE_URL
 * is missing, it returns a warning — never silently drops data.
 */
async function persistEventsToPg(
  events: AnalyticsEvent[],
): Promise<{ persisted: boolean; warning?: string }> {
  if (!process.env.DATABASE_URL) {
    recordPgWrite(events.length, false, "DATABASE_URL not set");
    return {
      persisted: false,
      warning: "DATABASE_URL not set — events NOT persisted. DATA LOSS.",
    };
  }

  try {
    await ensureEventsTable();
    const { query } = await import("@/lib/db");

    // Build a single multi-row INSERT for efficiency
    const values: unknown[] = [];
    const rows: string[] = [];
    let idx = 1;

    for (const e of events) {
      rows.push(
        `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6})`,
      );
      values.push(
        e.event_type,
        e.action,
        e.page,
        e.session_id,
        e.user_fingerprint,
        e.timestamp || new Date().toISOString(),
        JSON.stringify(e.metadata ?? {}),
      );
      idx += 7;
    }

    await query(
      `INSERT INTO analytics_events
         (event_type, action, page, session_id, user_fingerprint, timestamp, metadata)
       VALUES ${rows.join(", ")}`,
      values,
    );

    recordPgWrite(events.length, true);
    return { persisted: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordPgWrite(events.length, false, msg);
    console.error("[analytics-events] PG write failed:", msg);
    return { persisted: false, warning: `PG write failed: ${msg}` };
  }
}

/* ------------------------------------------------------------------ */
/*  Rate limiter (in-memory, per-process)                              */
/* ------------------------------------------------------------------ */

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 200; // generous — these are batched
const RATE_WINDOW_MS = 60 * 1000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

/* ------------------------------------------------------------------ */
/*  Aggregation trigger threshold                                      */
/* ------------------------------------------------------------------ */

const AGGREGATION_THRESHOLD = 100; // run pipeline every N events
let eventsSinceLastAggregation = 0;

/* ------------------------------------------------------------------ */
/*  POST /api/analytics/events — receive batched events                */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    // Log dataflow warnings once per process
    logDataflowWarnings();

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "anonymous";

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429 },
      );
    }

    const body = await request.json();
    const events: AnalyticsEvent[] = body.events;

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: "events array required" },
        { status: 400 },
      );
    }

    /* Resolve the dealer from the request hostname and stamp it onto
       every event before ingest. Without this, the heatmap and every
       other dealer-scoped query (which filters
       `WHERE metadata->>'dealer_id' = $1`) would return zero rows
       even though events were being written — exactly the regression
       observed on /admin/heatmaps on 2026-05-02. */
    const hostname =
      request.headers.get("host") ?? new URL(request.url).hostname;
    /* Symmetric fallback chain (regression 2026-05-02):
         1. resolveTenant(host) — works for configured dealer domains.
         2. process.env.DEALER_ID — same env var requireAuth uses in
            DEMO_MODE. If Vercel has DEALER_ID="<real-uuid>", the
            query side reads that — the ingest MUST stamp the same
            value or the query returns zero rows.
         3. Hardcoded "00000000-..." UUID — last-resort matching the
            getDealerId fallback constant. */
    const DEFAULT_DEALER_ID =
      process.env.DEALER_ID ?? "00000000-0000-4000-a000-000000000001";
    let resolvedDealerId: string = DEFAULT_DEALER_ID;
    try {
      const { resolveTenant } = await import("@/lib/tenant-resolver");
      const tenant = await resolveTenant(hostname);
      if (tenant?.dealer?.id) resolvedDealerId = tenant.dealer.id;
    } catch {
      /* keep DEFAULT_DEALER_ID */
    }

    // Cap batch size
    const capped = events.slice(0, 50).map((e) => {
      const meta: Record<string, unknown> = { ...(e.metadata ?? {}) };
      if (!meta.dealer_id) {
        meta.dealer_id = resolvedDealerId;
      }
      // Sanitise anon heatmap coords: clamp xp/yp to [0,1] and discard
      // non-finite values so malformed payloads never crash persistence.
      if (
        e.event_type === "heatmap_click" ||
        e.event_type === "heatmap_move"
      ) {
        if (typeof meta.xp === "number" && isFinite(meta.xp)) {
          meta.xp = Math.max(0, Math.min(1, meta.xp));
        } else {
          delete meta.xp;
        }
        if (typeof meta.yp === "number" && isFinite(meta.yp)) {
          meta.yp = Math.max(0, Math.min(1, meta.yp));
        } else {
          delete meta.yp;
        }
      }
      return { ...e, metadata: meta };
    });

    // Ingest into in-memory buffer
    const result = ingestEvents(capped);
    eventsSinceLastAggregation += result.accepted;

    // Persist to PostgreSQL — AWAIT, don't fire-and-forget.
    // Data loss is unacceptable. If PG write fails, we surface it.
    const pgResult = await persistEventsToPg(capped);

    // Fire-and-forget writes to Qdrant + Neo4j (never block response)
    writeEventsToSecondaryStores(capped).catch((err) => {
      console.warn("[analytics-events] Secondary store writes failed:", err);
    });

    // Collect warnings for response
    const warnings: string[] = [];
    if (pgResult.warning) warnings.push(pgResult.warning);

    // Trigger aggregation pipeline when threshold reached
    let aggregation = null;
    if (eventsSinceLastAggregation >= AGGREGATION_THRESHOLD) {
      eventsSinceLastAggregation = 0;
      aggregation = runAggregationPipeline().catch((err) => {
        console.error("[analytics] Aggregation pipeline error:", err);
        return null;
      });
    }

    // If aggregation was triggered, await it
    const pipelineResult = aggregation ? await aggregation : null;

    return NextResponse.json({
      accepted: result.accepted,
      buffered: result.buffered,
      persisted: pgResult.persisted,
      pipeline: pipelineResult
        ? {
            insights: pipelineResult.insights_generated,
            stored: pipelineResult.insights_stored,
            sessions: pipelineResult.sessions_analyzed,
          }
        : null,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch {
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  GET /api/analytics/events — diagnostics (admin only in production) */
/* ------------------------------------------------------------------ */

export async function GET() {
  const stats = getBufferStats();
  const warnings = getDataflowWarnings();
  const pgStats = getPgWriteStats();

  return NextResponse.json({
    ...stats,
    dataflow: {
      healthy: warnings.length === 0,
      warnings,
      pg_writes: pgStats,
      stores: {
        postgresql: !!process.env.DATABASE_URL,
        qdrant: !!process.env.QDRANT_URL,
        neo4j: !!process.env.NEO4J_URL && process.env.NEO4J_URL !== "",
      },
    },
  });
}
