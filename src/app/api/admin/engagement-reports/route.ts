import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type InteractionType = "test_drive" | "purchase" | "service" | "follow_up" | "walk_in";
type Outcome = "purchased" | "returning" | "lost" | "follow_up_needed";

interface EngagementReport {
  id: string;
  customer_name: string;
  employee_name: string;
  interaction_type: InteractionType;
  outcome: Outcome;
  competitor_mentioned: string | null;
  objections_raised: string | null;
  notes: string | null;
  rating: number;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Shadow mode mock data                                                       */
/* -------------------------------------------------------------------------- */

const MOCK_REPORTS: EngagementReport[] = [
  {
    id: "er-001",
    customer_name: "Marcus Johnson",
    employee_name: "Sarah Chen",
    interaction_type: "test_drive",
    outcome: "follow_up_needed",
    competitor_mentioned: "AutoNation",
    objections_raised: "Price felt high compared to online listings",
    notes: "Customer was enthusiastic about the F-150 but wants to check financing options. Follow up Monday.",
    rating: 4,
    created_at: "2026-03-27T14:30:00Z",
  },
  {
    id: "er-002",
    customer_name: "Emily Nakamura",
    employee_name: "James Kowalski",
    interaction_type: "purchase",
    outcome: "purchased",
    competitor_mentioned: null,
    objections_raised: null,
    notes: "Smooth deal. Customer traded in a 2021 Accord. Very happy with the CR-V Hybrid.",
    rating: 5,
    created_at: "2026-03-26T11:00:00Z",
  },
  {
    id: "er-003",
    customer_name: "Robert Garcia",
    employee_name: "Mike Reynolds",
    interaction_type: "walk_in",
    outcome: "lost",
    competitor_mentioned: "CarMax",
    objections_raised: "Wants no-haggle pricing, preferred CarMax model",
    notes: "Customer left after 20 minutes. May return if we offer price match guarantee.",
    rating: 2,
    created_at: "2026-03-25T16:15:00Z",
  },
  {
    id: "er-004",
    customer_name: "Aisha Williams",
    employee_name: "Priya Patel",
    interaction_type: "service",
    outcome: "returning",
    competitor_mentioned: null,
    objections_raised: null,
    notes: "Came in for oil change. Expressed interest in upgrading to a new Tucson next year. Scheduled follow-up call.",
    rating: 5,
    created_at: "2026-03-24T09:45:00Z",
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/engagement-reports                                           */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { searchParams } = new URL(request.url);
  const outcomeFilter = searchParams.get("outcome") as Outcome | null;

  // Shadow mode — no DB configured
  if (!process.env.DATABASE_URL) {
    let reports = [...MOCK_REPORTS];
    if (outcomeFilter) {
      reports = reports.filter((r) => r.outcome === outcomeFilter);
    }
    return NextResponse.json({ reports }, { status: 200 });
  }

  try {
    const { query } = await import("@/lib/db");

    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (outcomeFilter) {
      conditions.push(`outcome = $${idx++}`);
      params.push(outcomeFilter);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query<EngagementReport>(
      `SELECT id, customer_name, employee_name, interaction_type, outcome,
              competitor_mentioned, objections_raised, notes, rating, created_at
       FROM engagement_reports
       ${where}
       ORDER BY created_at DESC
       LIMIT 200`,
      params,
    );

    return NextResponse.json({ reports: result.rows }, { status: 200 });
  } catch (err) {
    console.error("[api/admin/engagement-reports] DB unavailable, using shadow data:", err);
    let reports = [...MOCK_REPORTS];
    if (outcomeFilter) {
      reports = reports.filter((r) => r.outcome === outcomeFilter);
    }
    return NextResponse.json({ reports }, { status: 200 });
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/engagement-reports                                          */
/* -------------------------------------------------------------------------- */

// TODO: When a DB is available, join outcome data with the leads table by
// customer_email to feed downstream lead scoring models (e.g. boost hot score
// for "purchased", penalise for "lost" with competitor_mentioned set).

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  let body: {
    customer_name?: string;
    employee_name?: string;
    interaction_type?: InteractionType;
    outcome?: Outcome;
    competitor_mentioned?: string;
    objections_raised?: string;
    notes?: string;
    rating?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { customer_name, employee_name, interaction_type, outcome, rating } = body;

  if (!customer_name || !employee_name || !interaction_type || !outcome || rating == null) {
    return NextResponse.json(
      { error: "Missing required fields: customer_name, employee_name, interaction_type, outcome, rating" },
      { status: 400 },
    );
  }

  const VALID_INTERACTION_TYPES: InteractionType[] = ["test_drive", "purchase", "service", "follow_up", "walk_in"];
  const VALID_OUTCOMES: Outcome[] = ["purchased", "returning", "lost", "follow_up_needed"];

  if (!VALID_INTERACTION_TYPES.includes(interaction_type)) {
    return NextResponse.json({ error: "Invalid interaction_type" }, { status: 400 });
  }
  if (!VALID_OUTCOMES.includes(outcome)) {
    return NextResponse.json({ error: "Invalid outcome" }, { status: 400 });
  }
  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating must be 1–5" }, { status: 400 });
  }

  // Shadow mode
  if (!process.env.DATABASE_URL) {
    const mock: EngagementReport = {
      id: `er-${Date.now()}`,
      customer_name,
      employee_name,
      interaction_type,
      outcome,
      competitor_mentioned: body.competitor_mentioned ?? null,
      objections_raised: body.objections_raised ?? null,
      notes: body.notes ?? null,
      rating,
      created_at: new Date().toISOString(),
    };
    return NextResponse.json({ report: mock }, { status: 201 });
  }

  try {
    const { query } = await import("@/lib/db");

    const result = await query<{ id: string; created_at: string }>(
      `INSERT INTO engagement_reports
         (customer_name, employee_name, interaction_type, outcome,
          competitor_mentioned, objections_raised, notes, rating, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id, created_at`,
      [
        customer_name,
        employee_name,
        interaction_type,
        outcome,
        body.competitor_mentioned ?? null,
        body.objections_raised ?? null,
        body.notes ?? null,
        rating,
      ],
    );

    // Write to audit_log — never throw
    try {
      await query(
        `INSERT INTO audit_log (action, entity_type, entity_id, metadata, created_at)
         VALUES ('engagement_report.created', 'engagement_report', $1, $2, NOW())`,
        [
          (result.rows as any[])[0]?.id,
          JSON.stringify({ interaction_type, outcome, rating }),
        ],
      );
    } catch (auditErr) {
      console.error("[api/admin/engagement-reports] Audit log write failed:", auditErr);
    }

    return NextResponse.json({ report: (result.rows as any[])[0] }, { status: 201 });
  } catch (err) {
    console.error("[api/admin/engagement-reports] POST failed:", err);
    return NextResponse.json({ error: "Failed to create engagement report" }, { status: 500 });
  }
}
