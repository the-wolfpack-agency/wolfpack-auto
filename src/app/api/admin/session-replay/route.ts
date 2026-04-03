import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";

/* -------------------------------------------------------------------------- */
/*  Demo data (shadow mode — no DATABASE_URL)                                  */
/* -------------------------------------------------------------------------- */

const DEMO_SESSIONS = [
  {
    session_id: "replay-001",
    dealer_id: "demo",
    started_at: "2026-04-02T14:22:00Z",
    ended_at: "2026-04-02T14:31:45Z",
    duration_ms: 585000,
    pages_visited: ["/", "/inventory", "/inventory/2024-ford-f150", "/financing"],
    event_count: 342,
    conversion: true,
    user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)",
    viewport: { width: 390, height: 844 },
  },
  {
    session_id: "replay-002",
    dealer_id: "demo",
    started_at: "2026-04-02T15:05:12Z",
    ended_at: "2026-04-02T15:12:30Z",
    duration_ms: 438000,
    pages_visited: ["/", "/inventory", "/inventory/2025-toyota-camry"],
    event_count: 187,
    conversion: false,
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    viewport: { width: 1920, height: 1080 },
  },
  {
    session_id: "replay-003",
    dealer_id: "demo",
    started_at: "2026-04-02T16:18:00Z",
    ended_at: "2026-04-02T16:45:22Z",
    duration_ms: 1642000,
    pages_visited: ["/", "/inventory", "/inventory/2024-honda-civic", "/trade-in", "/financing", "/contact"],
    event_count: 521,
    conversion: true,
    user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    viewport: { width: 1440, height: 900 },
  },
  {
    session_id: "replay-004",
    dealer_id: "demo",
    started_at: "2026-04-02T17:02:00Z",
    ended_at: "2026-04-02T17:05:15Z",
    duration_ms: 195000,
    pages_visited: ["/", "/inventory"],
    event_count: 64,
    conversion: false,
    user_agent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
    viewport: { width: 412, height: 915 },
  },
];

const DEMO_REPLAY_EVENTS = [
  { seq: 0, ts: 1743607320000, type: "page_navigation", data: { pathname: "/", url: "https://demo.wolfpackauto.com/" } },
  { seq: 1, ts: 1743607325000, type: "scroll", data: { scrollX: 0, scrollY: 450, scrollHeight: 2800, viewportHeight: 844 } },
  { seq: 2, ts: 1743607332000, type: "click", data: { x: 195, y: 420, target_tag: "A", target_id: "nav-inventory", target_class: "" } },
  { seq: 3, ts: 1743607333000, type: "page_navigation", data: { pathname: "/inventory", url: "https://demo.wolfpackauto.com/inventory" } },
  { seq: 4, ts: 1743607345000, type: "input_change", data: { target_tag: "INPUT", input_type: "text", target_name: "search", value: "***" } },
  { seq: 5, ts: 1743607360000, type: "click", data: { x: 310, y: 520, target_tag: "A", target_id: "vehicle-card-1", target_class: "vehicle-card" } },
  { seq: 6, ts: 1743607361000, type: "page_navigation", data: { pathname: "/inventory/2024-ford-f150", url: "https://demo.wolfpackauto.com/inventory/2024-ford-f150" } },
  { seq: 7, ts: 1743607380000, type: "scroll", data: { scrollX: 0, scrollY: 1200, scrollHeight: 3500, viewportHeight: 844 } },
  { seq: 8, ts: 1743607395000, type: "click", data: { x: 195, y: 700, target_tag: "BUTTON", target_id: "cta-financing", target_class: "btn-primary" } },
  { seq: 9, ts: 1743607396000, type: "page_navigation", data: { pathname: "/financing", url: "https://demo.wolfpackauto.com/financing" } },
];

/* -------------------------------------------------------------------------- */
/*  GET /api/admin/session-replay                                              */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  // --- Shadow mode (no DATABASE_URL) ---
  if (!process.env.DATABASE_URL) {
    if (sessionId) {
      const session = DEMO_SESSIONS.find((s) => s.session_id === sessionId);
      if (!session) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
      return NextResponse.json({ session, events: DEMO_REPLAY_EVENTS });
    }
    return NextResponse.json({ sessions: DEMO_SESSIONS });
  }

  // --- Live mode ---
  const dealerId = getDealerId(authResult);
  try {
    const { query } = await import("@/lib/db");

    if (sessionId) {
      const sessionRows = await query(
        `SELECT * FROM session_replays WHERE session_id = $1 AND dealer_id = $2`,
        [sessionId, dealerId],
      );
      if (sessionRows.rows.length === 0) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }

      const eventRows = await query(
        `SELECT * FROM session_replay_events WHERE session_id = $1 ORDER BY seq ASC`,
        [sessionId],
      );

      return NextResponse.json({
        session: sessionRows.rows[0],
        events: eventRows.rows,
      });
    }

    const rows = await query(
      `SELECT session_id, dealer_id, started_at, ended_at, duration_ms, pages_visited,
              event_count, conversion, user_agent, viewport
       FROM session_replays
       WHERE dealer_id = $1
       ORDER BY started_at DESC
       LIMIT 100`,
      [dealerId],
    );

    return NextResponse.json({ sessions: rows.rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ sessions: DEMO_SESSIONS });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/*  POST /api/admin/session-replay                                             */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json();
  const { session_id, events, session_meta } = body;

  if (!session_id || !events || !Array.isArray(events)) {
    return NextResponse.json(
      { error: "session_id and events[] are required" },
      { status: 400 },
    );
  }

  // --- Shadow mode ---
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      stored: true,
      session_id,
      event_count: events.length,
      mode: "shadow",
    });
  }

  // --- Live mode ---
  const dealerId = getDealerId(authResult);
  try {
    const { query } = await import("@/lib/db");

    await query(
      `INSERT INTO session_replays (session_id, dealer_id, started_at, ended_at, duration_ms,
         pages_visited, event_count, conversion, user_agent, viewport)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (session_id) DO UPDATE SET
         ended_at = EXCLUDED.ended_at,
         duration_ms = EXCLUDED.duration_ms,
         pages_visited = EXCLUDED.pages_visited,
         event_count = EXCLUDED.event_count,
         conversion = EXCLUDED.conversion`,
      [
        session_id,
        dealerId,
        session_meta?.started_at ?? new Date().toISOString(),
        session_meta?.ended_at ?? null,
        session_meta?.duration_ms ?? 0,
        JSON.stringify(session_meta?.pages_visited ?? []),
        events.length,
        session_meta?.conversion ?? false,
        session_meta?.user_agent ?? "",
        JSON.stringify(session_meta?.viewport ?? {}),
      ],
    );

    // Batch insert events
    for (const event of events) {
      await query(
        `INSERT INTO session_replay_events (session_id, seq, ts, type, data)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [session_id, event.seq, event.ts, event.type, JSON.stringify(event.data)],
      );
    }

    return NextResponse.json({
      stored: true,
      session_id,
      event_count: events.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({
        stored: false,
        session_id,
        event_count: events.length,
        mode: "shadow",
      });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
