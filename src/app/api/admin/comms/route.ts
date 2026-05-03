import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { auditLog } from "@/lib/audit-log";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackComms } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface Announcement {
  id: string;
  title: string;
  body: string;
  author: string;
  audience: "all" | "sales" | "service" | "management";
  pinned: boolean;
  created_at: string;
  read_count: number;
}

/* -------------------------------------------------------------------------- */
/* Shadow / mock data                                                          */
/* -------------------------------------------------------------------------- */

const MOCK_ANNOUNCEMENTS: Announcement[] = [
  {
    id: "ann-001",
    title: "Weekend Sale Event — All Hands Required",
    body: "This Saturday we have our largest sales event of the quarter. All sales staff are expected to be on the floor by 8:30 AM. Lunch will be provided. Thank you for your dedication to making this a success!",
    author: "Mike Reynolds",
    audience: "all",
    pinned: true,
    created_at: "2026-03-25T08:00:00Z",
    read_count: 14,
  },
  {
    id: "ann-002",
    title: "New EV Incentive Training Available",
    body: "Manufacturer has released updated training on federal EV tax credits and state rebate programs. All sales staff should complete this before April 1st. Login to the training portal with your dealership credentials.",
    author: "Priya Patel",
    audience: "sales",
    pinned: false,
    created_at: "2026-03-24T10:30:00Z",
    read_count: 8,
  },
  {
    id: "ann-003",
    title: "Service Bay Schedule Update",
    body: "Starting next week, Bay 3 will be reserved for express oil change and tire rotation appointments Monday through Wednesday. Please adjust your scheduling accordingly. Coordinate with the service manager for any conflicts.",
    author: "James Kowalski",
    audience: "service",
    pinned: false,
    created_at: "2026-03-23T14:00:00Z",
    read_count: 5,
  },
  {
    id: "ann-004",
    title: "Q1 Performance Review — Management Meeting",
    body: "Q1 closes this week. Management meeting Thursday at 4 PM in the conference room to review numbers, discuss targets for Q2, and address any staffing adjustments. Prepare your department summaries in advance.",
    author: "Mike Reynolds",
    audience: "management",
    pinned: false,
    created_at: "2026-03-22T09:00:00Z",
    read_count: 3,
  },
  {
    id: "ann-005",
    title: "Lot Organization — Friday Blitz",
    body: "We will do a full lot re-organization on Friday afternoon starting at 3 PM. All available staff are encouraged to help. This includes vehicle repositioning, signage refresh, and pressure washing the entrance area.",
    author: "Tom Bradley",
    audience: "all",
    pinned: false,
    created_at: "2026-03-21T11:00:00Z",
    read_count: 11,
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function dbAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/* -------------------------------------------------------------------------- */
/* GET /api/admin/comms                                                        */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  const { searchParams } = new URL(request.url);
  const audience = searchParams.get("audience") as Announcement["audience"] | null;

  if (dbAvailable()) {
    try {
      const { query } = await import("@/lib/db");
      const conditions = ["dealer_id = $1"];
      const params: unknown[] = [dealerId];

      if (audience && ["all", "sales", "service", "management"].includes(audience)) {
        conditions.push(`(audience = $2 OR audience = 'all')`);
        params.push(audience);
      }
      const result = await query( /* audit-safe: A4 reason="dealer_id always pushed as first condition above" */
        `SELECT id, title, body, author, audience, pinned, created_at, read_count
         FROM announcements
         WHERE ${conditions.join(" AND ")}
         ORDER BY pinned DESC, created_at DESC
         LIMIT 50`,
        params,
      );

      return NextResponse.json({ announcements: result.rows });
    } catch (err) {
      console.error("[api/admin/comms] DB error, falling back:", err);
    }
  }

  // Shadow mode fallback
  let filtered = [...MOCK_ANNOUNCEMENTS];
  if (audience && audience !== "all") {
    filtered = filtered.filter((a) => a.audience === audience || a.audience === "all");
  }
  filtered.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return NextResponse.json({ announcements: filtered });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/comms                                                       */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);
  const { user } = authResult;

  let body: {
    title: string;
    body: string;
    audience: "all" | "sales" | "service" | "management";
    pinned?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.title || !body.body || !body.audience) {
    return NextResponse.json({ error: "title, body, and audience are required" }, { status: 400 });
  }

  const validAudiences = ["all", "sales", "service", "management"];
  if (!validAudiences.includes(body.audience)) {
    return NextResponse.json({ error: "Invalid audience" }, { status: 400 });
  }

  const newId = `ann-${Date.now()}`;
  const now = new Date().toISOString();
  const pinned = Boolean(body.pinned);

  if (dbAvailable()) {
    try {
      const { query } = await import("@/lib/db");
      await query(
        `INSERT INTO announcements (id, dealer_id, title, body, author, audience, pinned, created_at, read_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0)`,
        [newId, dealerId, body.title, body.body, user.name ?? user.email, body.audience, pinned, now],
      );

      void auditLog(
        "announcement.publish",
        { announcement_id: newId, audience: body.audience, pinned },
        user.id,
        user.dealer_id,
      );

      try { trackComms("comms.announcement_created", authResult?.user?.dealer_id ?? "system", { action: "announcement_created", audience: body.audience }); } catch {}
      return NextResponse.json({ success: true, id: newId });
    } catch (err) {
      console.error("[api/admin/comms] POST DB error:", err);
    }
  }

  // Shadow mode
  void auditLog(
    "announcement.publish",
    { announcement_id: newId, audience: body.audience, pinned },
    user.id,
    user.dealer_id,
  );

  try { trackComms("comms.announcement_created", authResult?.user?.dealer_id ?? "system", { action: "announcement_created", audience: body.audience }); } catch {}
  return NextResponse.json({ success: true, id: newId, mode: "shadow" });
}
