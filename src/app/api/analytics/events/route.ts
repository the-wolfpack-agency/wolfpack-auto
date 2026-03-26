import { NextRequest, NextResponse } from "next/server";
import {
  ingestEvents,
  runAggregationPipeline,
  getBufferStats,
  type AnalyticsEvent,
} from "@/lib/analytics-engine";

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

    // Ingest
    const result = ingestEvents(capped);
    eventsSinceLastAggregation += result.accepted;

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
