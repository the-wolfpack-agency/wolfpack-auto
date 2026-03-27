import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { auditLog } from "@/lib/audit-log";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type IntelCategory = "pricing" | "inventory" | "campaign" | "promotion" | "staffing";
export type IntelSource = "customer" | "drive_by" | "online" | "ad";

export interface IntelRecord {
  id: string;
  category: IntelCategory;
  observation: string;
  source: IntelSource;
  observed_date: string;
  vehicles_mentioned: string[];
}

export interface Competitor {
  id: string;
  name: string;
  distance_miles: number;
  intel: IntelRecord[];
}

/* -------------------------------------------------------------------------- */
/* Shadow-mode mock data                                                        */
/* -------------------------------------------------------------------------- */

// Note: competitor mentions in engagement reports feed into this automatically

const MOCK_COMPETITORS: Competitor[] = [
  {
    id: "comp-001",
    name: "Metro Toyota",
    distance_miles: 4.2,
    intel: [
      {
        id: "intel-001",
        category: "pricing",
        observation: "Running $1,500 below invoice on all 2025 Camrys this month — confirmed by customer who visited them first.",
        source: "customer",
        observed_date: "2026-03-20",
        vehicles_mentioned: ["2025 Toyota Camry"],
      },
      {
        id: "intel-002",
        category: "campaign",
        observation: "Large radio buy running Monday–Friday morning drive. Messaging around 0% APR for 72 months on Tacomas.",
        source: "ad",
        observed_date: "2026-03-18",
        vehicles_mentioned: ["2025 Toyota Tacoma"],
      },
      {
        id: "intel-003",
        category: "inventory",
        observation: "Visited lot — heavy RAV4 stock, at least 40 units. Very low Highlander inventory.",
        source: "drive_by",
        observed_date: "2026-03-15",
        vehicles_mentioned: ["2025 Toyota RAV4", "2024 Toyota Highlander"],
      },
    ],
  },
  {
    id: "comp-002",
    name: "Westside Honda",
    distance_miles: 7.8,
    intel: [
      {
        id: "intel-004",
        category: "promotion",
        observation: "Spring conquest bonus — $500 loyalty rebate for customers trading from non-Honda brands.",
        source: "online",
        observed_date: "2026-03-22",
        vehicles_mentioned: ["2025 Honda CR-V", "2025 Honda Pilot"],
      },
      {
        id: "intel-005",
        category: "staffing",
        observation: "Their top F&I manager left two weeks ago according to a customer who dealt with a temp there.",
        source: "customer",
        observed_date: "2026-03-19",
        vehicles_mentioned: [],
      },
      {
        id: "intel-006",
        category: "pricing",
        observation: "Website shows dealer discount of $2,200 on 2025 Accord Sport. Confirmed pricing still active today.",
        source: "online",
        observed_date: "2026-03-25",
        vehicles_mentioned: ["2025 Honda Accord"],
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/competitive                                                  */
/* -------------------------------------------------------------------------- */

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ competitors: MOCK_COMPETITORS });
  }

  try {
    const { query } = await import("@/lib/db");

    const competitorRows = await query<{ id: string; name: string; distance_miles: number }>(
      `SELECT id, name, distance_miles FROM competitors WHERE dealer_id = $1 ORDER BY name`,
      [authResult.user.dealer_id],
    );

    const competitors = await Promise.all(
      competitorRows.rows.map(async (c) => {
        const intelRows = await query<Record<string, unknown>>(
          `SELECT id, category, observation, source, observed_date, vehicles_mentioned
           FROM competitor_intel
           WHERE competitor_id = $1
           ORDER BY observed_date DESC`,
          [c.id],
        );
        return { ...c, intel: intelRows.rows };
      }),
    );

    return NextResponse.json({ competitors });
  } catch (err) {
    console.error("[api/admin/competitive] GET failed:", err);
    return NextResponse.json({ error: "Failed to fetch competitive intel" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/competitive                                                 */
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

  const { competitor_name, category, observation, source, vehicles_mentioned } = body as {
    competitor_name?: string;
    category?: IntelCategory;
    observation?: string;
    source?: IntelSource;
    vehicles_mentioned?: string[];
  };

  const VALID_CATEGORIES: IntelCategory[] = ["pricing", "inventory", "campaign", "promotion", "staffing"];
  const VALID_SOURCES: IntelSource[] = ["customer", "drive_by", "online", "ad"];

  if (!competitor_name || typeof competitor_name !== "string" || !competitor_name.trim()) {
    return NextResponse.json({ error: "competitor_name is required" }, { status: 400 });
  }
  if (!category || !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` }, { status: 400 });
  }
  if (!observation || typeof observation !== "string" || !observation.trim()) {
    return NextResponse.json({ error: "observation is required" }, { status: 400 });
  }
  if (!source || !VALID_SOURCES.includes(source)) {
    return NextResponse.json({ error: `source must be one of: ${VALID_SOURCES.join(", ")}` }, { status: 400 });
  }

  const safeVehicles = Array.isArray(vehicles_mentioned)
    ? vehicles_mentioned.filter((v) => typeof v === "string")
    : [];

  // Analytics event
  // event_type: "competitive_intel_logged", metadata: {category, source, competitor_name}

  if (!process.env.DATABASE_URL) {
    const mockRecord: IntelRecord = {
      id: `intel-${Date.now()}`,
      category,
      observation: observation.trim(),
      source,
      observed_date: new Date().toISOString().split("T")[0],
      vehicles_mentioned: safeVehicles,
    };
    return NextResponse.json({ intel: mockRecord }, { status: 201 });
  }

  try {
    const { query } = await import("@/lib/db");

    // Upsert competitor
    const compResult = await query<{ id: string }>(`
      INSERT INTO competitors (dealer_id, name, distance_miles)
      VALUES ($1, $2, 0)
      ON CONFLICT (dealer_id, name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, [authResult.user.dealer_id, competitor_name.trim()]);

    const competitorId = compResult.rows[0].id;

    const intelResult = await query<{ id: string }>(`
      INSERT INTO competitor_intel
        (competitor_id, category, observation, source, observed_date, vehicles_mentioned)
      VALUES ($1, $2, $3, $4, NOW()::date, $5)
      RETURNING id
    `, [competitorId, category, observation.trim(), source, JSON.stringify(safeVehicles)]);

    // Audit log — fire-and-forget, never throw
    void auditLog(
      "competitive.intel_logged",
      { category, source, competitor_name: competitor_name.trim() },
      authResult.user.id,
      authResult.user.dealer_id,
    ).catch(() => {});

    return NextResponse.json({ id: intelResult.rows[0].id }, { status: 201 });
  } catch (err) {
    console.error("[api/admin/competitive] POST failed:", err);
    return NextResponse.json({ error: "Failed to log intel" }, { status: 500 });
  }
}
