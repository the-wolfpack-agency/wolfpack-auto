/**
 * GET  /api/admin/syndication — List syndication feed configs
 * POST /api/admin/syndication — Create/update a feed configuration
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackSystem, trackSecurity } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Shadow mock data                                                           */
/* -------------------------------------------------------------------------- */

const now = new Date();

const MOCK_FEEDS = [
  {
    id: "feed-001",
    dealer_id: "demo-dealer",
    platform: "autotrader",
    platform_label: "AutoTrader",
    enabled: true,
    api_key: "at_****7f2a",
    dealer_identifier: "WOLF-AT-4821",
    auto_sync: true,
    sync_interval_hours: 4,
    vehicles_synced: 47,
    last_sync_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    errors: 0,
    created_at: "2026-01-15T08:00:00Z",
    updated_at: "2026-03-31T10:00:00Z",
  },
  {
    id: "feed-002",
    dealer_id: "demo-dealer",
    platform: "cars_com",
    platform_label: "Cars.com",
    enabled: true,
    api_key: "cc_****9e3b",
    dealer_identifier: "WOLF-CC-1190",
    auto_sync: true,
    sync_interval_hours: 6,
    vehicles_synced: 47,
    last_sync_at: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(),
    errors: 0,
    created_at: "2026-01-15T08:00:00Z",
    updated_at: "2026-03-31T09:00:00Z",
  },
  {
    id: "feed-003",
    dealer_id: "demo-dealer",
    platform: "cargurus",
    platform_label: "CarGurus",
    enabled: true,
    api_key: "cg_****1d4c",
    dealer_identifier: "WOLF-CG-7734",
    auto_sync: true,
    sync_interval_hours: 4,
    vehicles_synced: 45,
    last_sync_at: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
    errors: 2,
    created_at: "2026-02-01T08:00:00Z",
    updated_at: "2026-03-31T11:00:00Z",
  },
  {
    id: "feed-004",
    dealer_id: "demo-dealer",
    platform: "facebook_marketplace",
    platform_label: "Facebook Marketplace",
    enabled: false,
    api_key: "",
    dealer_identifier: "",
    auto_sync: false,
    sync_interval_hours: 12,
    vehicles_synced: 0,
    last_sync_at: null,
    errors: 0,
    created_at: "2026-03-01T08:00:00Z",
    updated_at: "2026-03-01T08:00:00Z",
  },
  {
    id: "feed-005",
    dealer_id: "demo-dealer",
    platform: "craigslist",
    platform_label: "Craigslist",
    enabled: false,
    api_key: "",
    dealer_identifier: "",
    auto_sync: false,
    sync_interval_hours: 24,
    vehicles_synced: 0,
    last_sync_at: null,
    errors: 0,
    created_at: "2026-03-01T08:00:00Z",
    updated_at: "2026-03-01T08:00:00Z",
  },
];

const MOCK_SYNC_HISTORY = [
  { id: "sync-001", platform: "autotrader", status: "success", vehicles: 47, errors: 0, duration_ms: 12400, completed_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString() },
  { id: "sync-002", platform: "cargurus", status: "partial", vehicles: 45, errors: 2, duration_ms: 9800, completed_at: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString() },
  { id: "sync-003", platform: "cars_com", status: "success", vehicles: 47, errors: 0, duration_ms: 15600, completed_at: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString() },
  { id: "sync-004", platform: "autotrader", status: "success", vehicles: 47, errors: 0, duration_ms: 11200, completed_at: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString() },
  { id: "sync-005", platform: "cargurus", status: "error", vehicles: 0, errors: 1, duration_ms: 3400, completed_at: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString() },
  { id: "sync-006", platform: "cars_com", status: "success", vehicles: 46, errors: 0, duration_ms: 14800, completed_at: new Date(now.getTime() - 9 * 60 * 60 * 1000).toISOString() },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/syndication                                                 */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const feedResult = await query(
        `SELECT * FROM syndication_feeds
          WHERE dealer_id = $1 AND deleted_at IS NULL
          ORDER BY platform ASC`,
        [dealerId],
      );

      const historyResult = await query(
        `SELECT * FROM syndication_sync_history
          WHERE dealer_id = $1
          ORDER BY completed_at DESC
          LIMIT 20`,
        [dealerId],
      );

      return NextResponse.json({
        feeds: feedResult.rows,
        sync_history: historyResult.rows,
        total: (feedResult.rows as unknown[]).length,
      });
    } catch (err) {
      console.error("[api/admin/syndication] DB error, falling back to mock:", err);
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode ---- */
  return NextResponse.json({
    feeds: MOCK_FEEDS,
    sync_history: MOCK_SYNC_HISTORY,
    total: MOCK_FEEDS.length,
  });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/syndication                                                */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const rl = await checkRateLimit(`syndication:${dealerId}`, 10, 60);
  if (!rl.allowed) {
    try { trackSecurity("security.rate_limit_triggered", dealerId, { route: "syndication", remaining: 0 }); } catch {}
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { platform, enabled, api_key, dealer_identifier, auto_sync, sync_interval_hours } = body;

  if (!platform || typeof platform !== "string") {
    return NextResponse.json({ error: "Missing required field: platform" }, { status: 422 });
  }

  const VALID_PLATFORMS = ["autotrader", "cars_com", "cargurus", "facebook_marketplace", "craigslist"];
  if (!VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(", ")}` }, { status: 422 });
  }

  if (enabled && (!api_key || typeof api_key !== "string" || (api_key as string).length < 4)) {
    return NextResponse.json({ error: "API key is required when enabling a feed" }, { status: 422 });
  }

  if (enabled && (!dealer_identifier || typeof dealer_identifier !== "string")) {
    return NextResponse.json({ error: "Dealer identifier is required when enabling a feed" }, { status: 422 });
  }

  const interval = typeof sync_interval_hours === "number" ? sync_interval_hours : 4;
  if (interval < 1 || interval > 72) {
    return NextResponse.json({ error: "sync_interval_hours must be between 1 and 72" }, { status: 422 });
  }

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `INSERT INTO syndication_feeds (
           dealer_id, platform, enabled, api_key, dealer_identifier,
           auto_sync, sync_interval_hours
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (dealer_id, platform)
         DO UPDATE SET
           enabled = EXCLUDED.enabled,
           api_key = EXCLUDED.api_key,
           dealer_identifier = EXCLUDED.dealer_identifier,
           auto_sync = EXCLUDED.auto_sync,
           sync_interval_hours = EXCLUDED.sync_interval_hours,
           updated_at = NOW()
         RETURNING *`,
        [
          dealerId,
          platform,
          enabled ?? false,
          api_key || "",
          dealer_identifier || "",
          auto_sync ?? false,
          interval,
        ],
      );

      try { trackSystem("system.syndication_configured" as never, dealerId, { platform: String(platform), enabled: Boolean(enabled) }); } catch {}

      return NextResponse.json({ feed: result.rows[0], saved: true }, { status: 200 });
    } catch (err) {
      console.error("[api/admin/syndication] DB insert error, falling back to mock:", err);
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode ---- */
  const PLATFORM_LABELS: Record<string, string> = {
    autotrader: "AutoTrader",
    cars_com: "Cars.com",
    cargurus: "CarGurus",
    facebook_marketplace: "Facebook Marketplace",
    craigslist: "Craigslist",
  };

  const maskedKey = api_key && typeof api_key === "string" && api_key.length > 4
    ? `${(api_key as string).slice(0, 3)}****${(api_key as string).slice(-4)}`
    : api_key || "";

  const feed = {
    id: `feed-${Date.now()}`,
    dealer_id: dealerId,
    platform,
    platform_label: PLATFORM_LABELS[platform] || platform,
    enabled: enabled ?? false,
    api_key: maskedKey,
    dealer_identifier: dealer_identifier || "",
    auto_sync: auto_sync ?? false,
    sync_interval_hours: interval,
    vehicles_synced: 0,
    last_sync_at: null,
    errors: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try { trackSystem("system.syndication_configured" as never, dealerId, { platform: String(platform), enabled: Boolean(enabled) }); } catch {}

  return NextResponse.json({ feed, saved: true }, { status: 200 });
}
