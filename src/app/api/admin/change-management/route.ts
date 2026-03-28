import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { auditLog } from "@/lib/audit-log";
import { trackSystem } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type ChangeCategory = "process" | "pricing" | "staffing" | "system" | "policy";
export type ChangeImpact = "high" | "medium" | "low";
export type ChangeStatus = "proposed" | "approved" | "active" | "rolled_back";

export interface ChangeRecord {
  id: string;
  title: string;
  description: string;
  category: ChangeCategory;
  impact: ChangeImpact;
  status: ChangeStatus;
  owner: string;
  effective_date: string;
  metrics_before: Record<string, string | number> | null;
  metrics_after: Record<string, string | number> | null;
  created_at: string;
}

/* -------------------------------------------------------------------------- */
/* Shadow-mode mock data                                                        */
/* -------------------------------------------------------------------------- */

// Note: all analytics insights are automatically segmented by active change records
// — this is the annotation layer

const MOCK_CHANGES: ChangeRecord[] = [
  {
    id: "chg-001",
    title: "Internet Pricing Transparency Initiative",
    description:
      "Publish full out-the-door pricing on all VDPs to reduce friction and attract pre-qualified buyers. Eliminates price negotiation at first contact.",
    category: "pricing",
    impact: "high",
    status: "active",
    owner: "Mike Reynolds",
    effective_date: "2026-03-01",
    metrics_before: {
      avg_time_to_contact_hours: 18,
      vdp_lead_rate_pct: 2.1,
      price_objection_rate_pct: 64,
    },
    metrics_after: {
      avg_time_to_contact_hours: 11,
      vdp_lead_rate_pct: 3.4,
      price_objection_rate_pct: 29,
    },
    created_at: "2026-02-15T10:00:00Z",
  },
  {
    id: "chg-002",
    title: "BDC Follow-Up Cadence Overhaul",
    description:
      "Replace 3-day follow-up intervals with 1-touch-per-day for first 5 days after lead creation. Adds automated SMS to the email sequence.",
    category: "process",
    impact: "medium",
    status: "proposed",
    owner: "Sarah Chen",
    effective_date: "2026-04-15",
    metrics_before: null,
    metrics_after: null,
    created_at: "2026-03-20T14:30:00Z",
  },
  {
    id: "chg-003",
    title: "Flat-Fee F&I Compensation",
    description:
      "Replaced variable back-end compensation with flat per-deal bonus. Intended to reduce customer complaints about product pressure.",
    category: "staffing",
    impact: "high",
    status: "rolled_back",
    owner: "GM Office",
    effective_date: "2026-01-01",
    metrics_before: {
      customer_satisfaction_score: 72,
      f_and_i_gross_per_deal: 1840,
      complaints_per_month: 3,
    },
    metrics_after: {
      customer_satisfaction_score: 74,
      f_and_i_gross_per_deal: 1120,
      complaints_per_month: 1,
    },
    created_at: "2025-12-01T09:00:00Z",
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/change-management                                            */
/* -------------------------------------------------------------------------- */

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ changes: MOCK_CHANGES });
  }

  try {
    const { query } = await import("@/lib/db");

    const result = await query<Record<string, unknown>>(`
      SELECT
        id, title, description, category, impact, status, owner,
        effective_date, metrics_before, metrics_after, created_at
      FROM change_records
      WHERE dealer_id = $1
      ORDER BY effective_date DESC
    `, [authResult.user.dealer_id]);

    return NextResponse.json({ changes: result.rows });
  } catch (err) {
    console.error("[api/admin/change-management] DB unavailable, using shadow data:", err);
    return NextResponse.json({ changes: MOCK_CHANGES }, { status: 200 });
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/change-management                                           */
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

  const { title, description, category, impact, owner, effective_date } = body as {
    title?: string;
    description?: string;
    category?: ChangeCategory;
    impact?: ChangeImpact;
    owner?: string;
    effective_date?: string;
  };

  const VALID_CATEGORIES: ChangeCategory[] = ["process", "pricing", "staffing", "system", "policy"];
  const VALID_IMPACTS: ChangeImpact[] = ["high", "medium", "low"];

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!description || typeof description !== "string" || !description.trim()) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }
  if (!category || !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` }, { status: 400 });
  }
  if (!impact || !VALID_IMPACTS.includes(impact)) {
    return NextResponse.json({ error: `impact must be one of: ${VALID_IMPACTS.join(", ")}` }, { status: 400 });
  }
  if (!owner || typeof owner !== "string" || !owner.trim()) {
    return NextResponse.json({ error: "owner is required" }, { status: 400 });
  }
  if (!effective_date) {
    return NextResponse.json({ error: "effective_date is required" }, { status: 400 });
  }

  // Analytics event
  // event_type: "change_recorded", metadata: {category, impact, status}

  if (!process.env.DATABASE_URL) {
    const mockNew: ChangeRecord = {
      id: `chg-${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      category,
      impact,
      status: "proposed",
      owner: owner.trim(),
      effective_date,
      metrics_before: null,
      metrics_after: null,
      created_at: new Date().toISOString(),
    };
    try { trackSystem("system.change_recorded", authResult?.user?.dealer_id ?? "system", { action: "change_created", category: category ?? "" }); } catch {}
    return NextResponse.json({ change: mockNew }, { status: 201 });
  }

  try {
    const { query } = await import("@/lib/db");

    const result = await query<{ id: string }>(`
      INSERT INTO change_records
        (dealer_id, title, description, category, impact, status, owner, effective_date,
         metrics_before, metrics_after)
      VALUES ($1, $2, $3, $4, $5, 'proposed', $6, $7, NULL, NULL)
      RETURNING id
    `, [
      authResult.user.dealer_id,
      title.trim(),
      description.trim(),
      category,
      impact,
      owner.trim(),
      effective_date,
    ]);

    // Audit log — fire-and-forget, never throw
    void auditLog(
      "change_management.record_created",
      { category, impact, status: "proposed" },
      authResult.user.id,
      authResult.user.dealer_id,
    ).catch(() => {});

    try { trackSystem("system.change_recorded", authResult?.user?.dealer_id ?? "system", { action: "change_created", category: category ?? "" }); } catch {}
    return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
  } catch (err) {
    console.error("[api/admin/change-management] POST failed:", err);
    return NextResponse.json({ error: "Failed to create change record" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* PATCH /api/admin/change-management                                          */
/* -------------------------------------------------------------------------- */

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, status, metrics_after } = body as {
    id?: string;
    status?: ChangeStatus;
    metrics_after?: Record<string, string | number>;
  };

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const VALID_STATUSES: ChangeStatus[] = ["proposed", "approved", "active", "rolled_back"];

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true });
  }

  try {
    const { query } = await import("@/lib/db");

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (status !== undefined) {
      setClauses.push(`status = $${idx++}`);
      params.push(status);
    }
    if (metrics_after !== undefined) {
      setClauses.push(`metrics_after = $${idx++}`);
      params.push(JSON.stringify(metrics_after));
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id, authResult.user.dealer_id);

    await query(
      `UPDATE change_records SET ${setClauses.join(", ")} WHERE id = $${idx} AND dealer_id = $${idx + 1}`,
      params,
    );

    // Audit log — fire-and-forget, never throw
    void auditLog(
      "change_management.record_updated",
      { id, status, has_metrics_after: metrics_after !== undefined },
      authResult.user.id,
      authResult.user.dealer_id,
    ).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/admin/change-management] PATCH failed:", err);
    return NextResponse.json({ error: "Failed to update change record" }, { status: 500 });
  }
}
