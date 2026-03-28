import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { auditLog } from "@/lib/audit-log";
import { trackSystem } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface Campaign {
  id: string;
  name: string;
  budget: number;
  spent: number;
  goal: string;
  start_date: string;
  end_date: string;
  channels: string[];
  featured_vehicles: string[];
  status: "draft" | "active" | "completed";
  leads_generated: number;
  conversions: number;
  roi_pct: number;
}

/* -------------------------------------------------------------------------- */
/* Shadow-mode mock data                                                       */
/* -------------------------------------------------------------------------- */

const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: "camp-001",
    name: "Spring Sales Event",
    budget: 12000,
    spent: 7400,
    goal: "Generate 80 qualified leads for Q2 push",
    start_date: "2026-03-01",
    end_date: "2026-04-30",
    channels: ["Email", "Social", "PPC"],
    featured_vehicles: ["2024 Toyota Camry", "2025 Honda CR-V", "2024 Ford F-150"],
    status: "active",
    leads_generated: 47,
    conversions: 9,
    roi_pct: 22.4,
  },
  {
    id: "camp-002",
    name: "Year-End Clearance",
    budget: 8500,
    spent: 8500,
    goal: "Clear remaining 2023 inventory before model year transition",
    start_date: "2025-11-15",
    end_date: "2025-12-31",
    channels: ["Email", "Direct Mail", "PPC", "Events"],
    featured_vehicles: ["2023 Chevrolet Equinox", "2023 Hyundai Tucson"],
    status: "completed",
    leads_generated: 94,
    conversions: 31,
    roi_pct: 187.5,
  },
  {
    id: "camp-003",
    name: "Summer SUV Showcase",
    budget: 15000,
    spent: 0,
    goal: "Drive foot traffic and test drives for SUV lineup",
    start_date: "2026-06-01",
    end_date: "2026-07-31",
    channels: ["Social", "Events"],
    featured_vehicles: ["2025 Kia Telluride", "2025 Subaru Outback", "2025 Mazda CX-5"],
    status: "draft",
    leads_generated: 0,
    conversions: 0,
    roi_pct: 0,
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/marketing                                                    */
/* -------------------------------------------------------------------------- */

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ campaigns: MOCK_CAMPAIGNS });
  }

  try {
    const { query } = await import("@/lib/db");

    const result = await query<Record<string, unknown>>(`
      SELECT
        id, name, budget, spent, goal,
        start_date, end_date, channels, featured_vehicles,
        status, leads_generated, conversions, roi_pct
      FROM marketing_campaigns
      WHERE dealer_id = $1
      ORDER BY start_date DESC
    `, [authResult.user.dealer_id]);

    return NextResponse.json({ campaigns: result.rows });
  } catch (err) {
    console.error("[api/admin/marketing] DB unavailable, using shadow data:", err);
    return NextResponse.json({ campaigns: MOCK_CAMPAIGNS }, { status: 200 });
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/marketing                                                   */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, budget, goal, start_date, end_date, channels, featured_vehicles } = body as {
    name?: string;
    budget?: number;
    goal?: string;
    start_date?: string;
    end_date?: string;
    channels?: string[];
    featured_vehicles?: string[];
  };

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!budget || typeof budget !== "number" || budget <= 0) {
    return NextResponse.json({ error: "budget must be a positive number" }, { status: 400 });
  }
  if (!goal || typeof goal !== "string" || !goal.trim()) {
    return NextResponse.json({ error: "goal is required" }, { status: 400 });
  }
  if (!start_date || !end_date) {
    return NextResponse.json({ error: "start_date and end_date are required" }, { status: 400 });
  }

  const safeChannels = Array.isArray(channels) ? channels.filter((c) => typeof c === "string") : [];
  const safeVehicles = Array.isArray(featured_vehicles)
    ? featured_vehicles.filter((v) => typeof v === "string")
    : [];

  // Analytics event
  // event_type: "campaign_created", metadata: {budget, channels, goal}
  // Note: leads generated during campaign window are tagged with campaign_id for attribution

  if (!process.env.DATABASE_URL) {
    // Shadow mode: echo back a synthetic campaign
    const mockNew: Campaign = {
      id: `camp-${Date.now()}`,
      name: name.trim(),
      budget,
      spent: 0,
      goal: goal.trim(),
      start_date,
      end_date,
      channels: safeChannels,
      featured_vehicles: safeVehicles,
      status: "draft",
      leads_generated: 0,
      conversions: 0,
      roi_pct: 0,
    };
    try { trackSystem("system.campaign_created", authResult?.user?.dealer_id ?? "system", { action: "campaign_created", budget }); } catch {}
    return NextResponse.json({ campaign: mockNew }, { status: 201 });
  }

  try {
    const { query } = await import("@/lib/db");

    const result = await query<{ id: string }>(`
      INSERT INTO marketing_campaigns
        (dealer_id, name, budget, spent, goal, start_date, end_date, channels,
         featured_vehicles, status, leads_generated, conversions, roi_pct)
      VALUES ($1, $2, $3, 0, $4, $5, $6, $7, $8, 'draft', 0, 0, 0)
      RETURNING id
    `, [
      authResult.user.dealer_id,
      name.trim(),
      budget,
      goal.trim(),
      start_date,
      end_date,
      JSON.stringify(safeChannels),
      JSON.stringify(safeVehicles),
    ]);

    // Audit log — fire-and-forget, never throw
    void auditLog(
      "marketing.campaign_created",
      { budget, channels: safeChannels, goal: goal.trim() },
      authResult.user.id,
      authResult.user.dealer_id,
    ).catch(() => {});

    try { trackSystem("system.campaign_created", authResult?.user?.dealer_id ?? "system", { action: "campaign_created", budget }); } catch {}
    return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
  } catch (err) {
    console.error("[api/admin/marketing] POST failed:", err);
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }
}
