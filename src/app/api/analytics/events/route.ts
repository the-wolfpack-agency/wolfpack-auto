import { NextRequest, NextResponse } from "next/server";
import {
  ingestEvents,
  runAggregationPipeline,
  getBufferStats,
  type AnalyticsEvent,
} from "@/lib/analytics-engine";

/* ------------------------------------------------------------------ */
/*  PostgreSQL event persistence (fire-and-forget)                     */
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
 * Fire-and-forget — callers should not await this.
 */
async function persistEventsToPg(events: AnalyticsEvent[]): Promise<void> {
  if (!process.env.DATABASE_URL) return;
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
  } catch (err) {
    console.error("[analytics-events] PG write failed:", err);
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

    // Cap batch size
    const capped = events.slice(0, 50);

    // Ingest into in-memory buffer
    const result = ingestEvents(capped);
    eventsSinceLastAggregation += result.accepted;

    // Persist to PostgreSQL (fire-and-forget — don't block the response)
    void persistEventsToPg(capped);

    // Trigger aggregation pipeline when threshold reached
    let aggregation = null;
    if (eventsSinceLastAggregation >= AGGREGATION_THRESHOLD) {
      eventsSinceLastAggregation = 0;
      // Run async — don't block the response
      aggregation = runAggregationPipeline().catch((err) => {
        console.error("[analytics] Aggregation pipeline error:", err);
        return null;
      });
    }

    // If aggregation was triggered, await it (it's fast)
    const pipelineResult = aggregation ? await aggregation : null;

    return NextResponse.json({
      accepted: result.accepted,
      buffered: result.buffered,
      pipeline: pipelineResult
        ? {
            insights: pipelineResult.insights_generated,
            stored: pipelineResult.insights_stored,
            sessions: pipelineResult.sessions_analyzed,
          }
        : null,
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
  return NextResponse.json(stats);
}
