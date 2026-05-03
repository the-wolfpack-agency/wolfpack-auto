import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackSystem } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type GestureType = "service_credit" | "accessory" | "loaner" | "discount" | "apology_gift";
type GestureStatus = "pending" | "approved" | "claimed" | "denied";

interface GoodFaithGesture {
  id: string;
  customer_name: string;
  customer_email: string;
  gesture_type: GestureType;
  value_usd: number;
  reason: string;
  oem_reimbursable: boolean;
  oem_claim_id: string | null;
  status: GestureStatus;
  created_at: string;
}

interface GoodFaithResponse {
  gestures: GoodFaithGesture[];
  budget_used: number;
  budget_total: number;
  oem_pending_claims: number;
}

/* -------------------------------------------------------------------------- */
/* Shadow mode mock data                                                       */
/* -------------------------------------------------------------------------- */

const MOCK_GESTURES: GoodFaithGesture[] = [
  {
    id: "gf-001",
    customer_name: "Patricia Hernandez",
    customer_email: "p.hernandez@email.com",
    gesture_type: "service_credit",
    value_usd: 500,
    reason: "Miscommunication during service visit caused a three-day delay. Customer was understanding but frustrated.",
    oem_reimbursable: true,
    oem_claim_id: "OEM-2026-0312",
    status: "approved",
    created_at: "2026-03-20T10:00:00Z",
  },
  {
    id: "gf-002",
    customer_name: "David Kim",
    customer_email: "david.k@email.com",
    gesture_type: "accessory",
    value_usd: 350,
    reason: "Vehicle delivered with a minor scratch on rear bumper discovered after purchase. Offered accessories package.",
    oem_reimbursable: false,
    oem_claim_id: null,
    status: "claimed",
    created_at: "2026-03-22T14:30:00Z",
  },
  {
    id: "gf-003",
    customer_name: "Lauren Okafor",
    customer_email: "lauren.okafor@gmail.com",
    gesture_type: "loaner",
    value_usd: 400,
    reason: "Warranty repair took longer than estimated. Provided loaner vehicle for 4 days.",
    oem_reimbursable: true,
    oem_claim_id: null,
    status: "pending",
    created_at: "2026-03-26T09:15:00Z",
  },
];

const MOCK_BUDGET_USED = 1250;
const MOCK_BUDGET_TOTAL = 5000;

/* -------------------------------------------------------------------------- */
/* GET /api/admin/good-faith                                                   */
/* -------------------------------------------------------------------------- */

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  // Shadow mode
  if (!process.env.DATABASE_URL) {
    const oem_pending_claims = MOCK_GESTURES.filter(
      (g) => g.oem_reimbursable && g.oem_claim_id === null,
    ).length;

    const response: GoodFaithResponse = {
      gestures: MOCK_GESTURES,
      budget_used: MOCK_BUDGET_USED,
      budget_total: MOCK_BUDGET_TOTAL,
      oem_pending_claims,
    };
    return NextResponse.json(response, { status: 200 });
  }

  try {
    const { query } = await import("@/lib/db");

    const dealerId = authResult?.user?.dealer_id ?? "system";
    const [gesturesResult, budgetResult] = await Promise.all([
      query<GoodFaithGesture>(
        `SELECT id, customer_name, customer_email, gesture_type, value_usd,
                reason, oem_reimbursable, oem_claim_id, status, created_at
         FROM good_faith_gestures
         WHERE dealer_id = $1
         ORDER BY created_at DESC
         LIMIT 200`,
        [dealerId],
      ),
      query<{ budget_used: string; budget_total: string }>(
        /* dealer_budgets table is optional — when missing, the route's outer
           catch falls through to mock. Keep budget_total at the project
           default (5000) until that table lands. */
        `SELECT
           COALESCE(SUM(value_usd) FILTER (WHERE status != 'denied'), 0)::text AS budget_used,
           '5000'::text AS budget_total
         FROM good_faith_gestures
         WHERE dealer_id = $1`,
        [dealerId],
      ),
    ]);

    const gestures = gesturesResult.rows as GoodFaithGesture[];
    const oem_pending_claims = gestures.filter(
      (g) => g.oem_reimbursable && !g.oem_claim_id,
    ).length;

    const budgetRow = (budgetResult.rows as any[])[0];

    const response: GoodFaithResponse = {
      gestures,
      budget_used: parseFloat(budgetRow?.budget_used ?? "0"),
      budget_total: parseFloat(budgetRow?.budget_total ?? "5000"),
      oem_pending_claims,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error("[api/admin/good-faith] DB unavailable, using shadow data:", err);
    const oem_pending_claims = MOCK_GESTURES.filter(
      (g) => g.oem_reimbursable && g.oem_claim_id === null,
    ).length;
    const response: GoodFaithResponse = {
      gestures: MOCK_GESTURES,
      budget_used: MOCK_BUDGET_USED,
      budget_total: MOCK_BUDGET_TOTAL,
      oem_pending_claims,
    };
    return NextResponse.json(response, { status: 200 });
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/good-faith — create a gesture                              */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  let body: {
    customer_name?: string;
    customer_email?: string;
    gesture_type?: GestureType;
    value_usd?: number;
    reason?: string;
    oem_reimbursable?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { customer_name, customer_email, gesture_type, value_usd, reason } = body;

  if (!customer_name || !customer_email || !gesture_type || value_usd == null || !reason) {
    return NextResponse.json(
      { error: "Missing required fields: customer_name, customer_email, gesture_type, value_usd, reason" },
      { status: 400 },
    );
  }

  const VALID_GESTURE_TYPES: GestureType[] = ["service_credit", "accessory", "loaner", "discount", "apology_gift"];
  if (!VALID_GESTURE_TYPES.includes(gesture_type)) {
    return NextResponse.json({ error: "Invalid gesture_type" }, { status: 400 });
  }
  if (typeof value_usd !== "number" || value_usd <= 0) {
    return NextResponse.json({ error: "value_usd must be a positive number" }, { status: 400 });
  }

  // Shadow mode
  if (!process.env.DATABASE_URL) {
    const mock: GoodFaithGesture = {
      id: `gf-${Date.now()}`,
      customer_name,
      customer_email,
      gesture_type,
      value_usd,
      reason,
      oem_reimbursable: body.oem_reimbursable ?? false,
      oem_claim_id: null,
      status: "pending",
      created_at: new Date().toISOString(),
    };
    try { trackSystem("system.good_faith_created", authResult?.user?.dealer_id ?? "system", { action: "gesture_created", gesture_type }); } catch {}
    return NextResponse.json({ gesture: mock }, { status: 201 });
  }

  try {
    const { query } = await import("@/lib/db");

    const dealerId = authResult?.user?.dealer_id ?? "system";
    const result = await query<{ id: string; created_at: string }>(
      `INSERT INTO good_faith_gestures
         (dealer_id, customer_name, customer_email, gesture_type, value_usd, reason,
          oem_reimbursable, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())
       RETURNING id, created_at`,
      [
        dealerId,
        customer_name,
        customer_email,
        gesture_type,
        value_usd,
        reason,
        body.oem_reimbursable ?? false,
      ],
    );

    // Audit log — never throw
    try {
      await query(
        `INSERT INTO audit_log (dealer_id, action, entity_type, entity_id, metadata, created_at)
         VALUES ($1, 'good_faith_gesture.created', 'good_faith_gesture', $2, $3, NOW())`,
        [
          dealerId,
          (result.rows as any[])[0]?.id,
          JSON.stringify({ gesture_type, value_usd, oem_reimbursable: body.oem_reimbursable ?? false }),
        ],
      );
    } catch (auditErr) {
      console.error("[api/admin/good-faith] Audit log write failed:", auditErr);
    }

    try { trackSystem("system.good_faith_created", authResult?.user?.dealer_id ?? "system", { action: "gesture_created", gesture_type }); } catch {}
    /* Durable-mode counterpart — kept alongside the legacy event so the
       learning system can compute the durable rate over time. Migration
       056 backs this code path. */
    try { trackSystem("system.good_faith_created_durable", authResult?.user?.dealer_id ?? "system", { action: "gesture_created", gesture_type }); } catch {}
    return NextResponse.json({ gesture: (result.rows as any[])[0] }, { status: 201 });
  } catch (err) {
    /* Same prod failure pattern as engagement-reports: when the
       table or one of its columns is missing on the deployed env,
       fall through to a shadow-style success so the operator can
       keep working AND surface the cause + a hint pointing at the
       migration. */
    const message = (err as Error)?.message ?? "unknown";
    console.error("[api/admin/good-faith] POST failed:", err);
    if (
      /relation .*good_faith_gestures.* does not exist/i.test(message) ||
      /column .* does not exist/i.test(message)
    ) {
      const fallback = {
        id: `gf-${Date.now()}`,
        customer_name,
        customer_email,
        gesture_type,
        value_usd,
        reason,
        oem_reimbursable: body.oem_reimbursable ?? false,
        oem_claim_id: null,
        status: "pending" as const,
        created_at: new Date().toISOString(),
      };
      try { trackSystem("system.good_faith_created", authResult?.user?.dealer_id ?? "system", { action: "gesture_created_shadow", gesture_type }); } catch {}
      try { trackSystem("system.good_faith_created_shadow", authResult?.user?.dealer_id ?? "system", { action: "gesture_created_shadow", gesture_type }); } catch {}
      return NextResponse.json(
        {
          gesture: fallback,
          warning: "good_faith_gestures table/column missing — record stored in shadow mode only. Run migration to enable durable persistence.",
        },
        { status: 201 },
      );
    }
    return NextResponse.json(
      {
        error: "Failed to create good faith gesture",
        cause: message.slice(0, 200),
      },
      { status: 500 },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* PATCH /api/admin/good-faith — update status                                */
/* -------------------------------------------------------------------------- */

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  let body: { id?: string; status?: GestureStatus; oem_claim_id?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, status } = body;

  if (!id || !status) {
    return NextResponse.json({ error: "Missing required fields: id, status" }, { status: 400 });
  }

  const VALID_STATUSES: GestureStatus[] = ["pending", "approved", "claimed", "denied"];
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Shadow mode
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ id, status, oem_claim_id: body.oem_claim_id ?? null }, { status: 200 });
  }

  try {
    const { query } = await import("@/lib/db");

    const dealerId = authResult?.user?.dealer_id ?? "system";
    await query(
      `UPDATE good_faith_gestures
       SET status = $1, oem_claim_id = COALESCE($2, oem_claim_id), updated_at = NOW()
       WHERE id = $3 AND dealer_id = $4`,
      [status, body.oem_claim_id ?? null, id, dealerId],
    );

    // Audit log — never throw
    try {
      await query(
        `INSERT INTO audit_log (dealer_id, action, entity_type, entity_id, metadata, created_at)
         VALUES ($1, 'good_faith_gesture.status_updated', 'good_faith_gesture', $2, $3, NOW())`,
        [dealerId, id, JSON.stringify({ status, oem_claim_id: body.oem_claim_id ?? null })],
      );
    } catch (auditErr) {
      console.error("[api/admin/good-faith] Audit log write failed:", auditErr);
    }

    return NextResponse.json({ id, status }, { status: 200 });
  } catch (err) {
    console.error("[api/admin/good-faith] PATCH failed:", err);
    return NextResponse.json({ error: "Failed to update gesture status" }, { status: 500 });
  }
}
