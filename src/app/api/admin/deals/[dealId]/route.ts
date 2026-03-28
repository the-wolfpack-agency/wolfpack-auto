/**
 * GET   /api/admin/deals/[dealId] — Single deal detail
 * PATCH /api/admin/deals/[dealId] — Update deal (status, numbers, F&I products)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackDeal } from "@/lib/analytics-hooks";
import { ConcurrentModificationError } from "@/lib/optimistic-lock";

/* -------------------------------------------------------------------------- */
/* Shadow mock — single deal                                                  */
/* -------------------------------------------------------------------------- */

const MOCK_DEAL = {
  id: "deal-001",
  dealer_id: "demo-dealer",
  status: "working",
  deal_type: "retail",
  customer_name: "James Rodriguez",
  customer_email: "james.r@email.com",
  customer_phone: "(512) 555-0147",
  customer_address: "4821 E Riverside Dr, Austin, TX 78741",
  customer_credit_score: 712,
  salesperson: "Mike Chen",
  sales_manager: "Tom Bradley",
  fi_manager: "Jennifer Walsh",
  vehicle_year: 2024,
  vehicle_make: "Toyota",
  vehicle_model: "Camry XSE",
  vehicle_vin: "4T1G11AK5RU123456",
  vehicle_stock: "T24-0892",
  vehicle_color: "Midnight Black Metallic",
  vehicle_mileage: 12,
  vehicle_trim: "XSE V6",
  msrp: 32340,
  selling_price: 31500,
  invoice: 30200,
  holdback: 650,
  pack: 500,
  trade_vehicle: "2019 Honda Civic EX",
  trade_vin: "2HGFC2F79KH567890",
  trade_value: 14500,
  trade_acv: 13800,
  trade_payoff: 6200,
  trade_payoff_good_through: "2026-04-15",
  down_payment: 3000,
  rebates: 1000,
  apr: 5.49,
  term_months: 72,
  money_factor: null,
  residual_pct: null,
  monthly_payment: 478.23,
  amount_financed: 19200,
  total_interest: 15232.56,
  total_cost: 34432.56,
  front_gross: 1300,
  back_gross: 2150,
  total_gross: 3450,
  fi_products: [
    { id: "extended-warranty", name: "Extended Warranty", cost: 650, retail_price: 1495, term: "72 months / 100K miles" },
    { id: "gap-insurance", name: "GAP Insurance", cost: 195, retail_price: 695, term: "Life of loan" },
  ],
  lender: "Toyota Financial Services",
  lender_status: "approved",
  lender_approval_number: "TFS-2026-88741",
  lender_stipulations: ["Proof of income", "Proof of residence"],
  lender_submissions: [
    { lender: "Toyota Financial Services", status: "approved", apr: 5.49, submitted_at: "2026-03-28T12:00:00Z" },
    { lender: "Capital One Auto", status: "declined", apr: null, submitted_at: "2026-03-28T11:45:00Z" },
    { lender: "Chase Auto", status: "pending", apr: null, submitted_at: "2026-03-28T12:30:00Z" },
  ],
  fees: {
    doc_fee: 150,
    title_fee: 33,
    registration_fee: 75,
    tax_rate: 6.25,
    tax_amount: 1031.25,
  },
  notes: "Customer prefers monthly under $500. Trade is clean, no damage. Second visit — came back after sleeping on it.",
  timeline: [
    { action: "Deal created", by: "Mike Chen", at: "2026-03-28T09:15:00Z" },
    { action: "Trade appraised at $14,500", by: "Tom Bradley", at: "2026-03-28T09:45:00Z" },
    { action: "Submitted to Toyota Financial", by: "Jennifer Walsh", at: "2026-03-28T12:00:00Z" },
    { action: "Approved — TFS @ 5.49%", by: "System", at: "2026-03-28T12:22:00Z" },
  ],
  created_at: "2026-03-28T09:15:00Z",
  updated_at: "2026-03-28T14:22:00Z",
};

/* -------------------------------------------------------------------------- */
/* In-memory mutation store for shadow mode                                   */
/* -------------------------------------------------------------------------- */

const mutations = new Map<string, Record<string, unknown>>();

/* -------------------------------------------------------------------------- */
/* GET /api/admin/deals/[dealId]                                              */
/* -------------------------------------------------------------------------- */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const { dealId } = await params;

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `SELECT * FROM deals WHERE id = $1 AND dealer_id = $2`,
        [dealId, dealerId],
      );
      if ((result.rows as unknown[]).length === 0) {
        return NextResponse.json({ error: "Deal not found" }, { status: 404 });
      }
      return NextResponse.json({ deal: result.rows[0] });
    } catch (err) {
      console.error(`[api/admin/deals/${dealId}] DB error:`, err);
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode ---- */
  const overrides = mutations.get(dealId) ?? {};
  return NextResponse.json({ deal: { ...MOCK_DEAL, id: dealId, ...overrides } });
}

/* -------------------------------------------------------------------------- */
/* PATCH /api/admin/deals/[dealId]                                            */
/* -------------------------------------------------------------------------- */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const { dealId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ALLOWED_FIELDS = new Set([
    "status", "deal_type", "customer_name", "customer_email", "customer_phone",
    "customer_address", "customer_credit_score", "salesperson", "sales_manager", "fi_manager",
    "selling_price", "trade_value", "trade_payoff", "down_payment", "rebates",
    "apr", "term_months", "money_factor", "residual_pct",
    "monthly_payment", "amount_financed", "front_gross", "back_gross", "total_gross",
    "fi_products", "lender", "lender_status", "notes",
  ]);

  // Optimistic locking: client sends updated_at to prevent lost updates
  const expectedUpdatedAt = typeof body.updated_at === "string" ? body.updated_at : null;

  const updates: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(key)) updates[key] = val;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 422 });
  }

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const setClauses: string[] = ["updated_at = NOW()"];
      const queryParams: unknown[] = [];
      let idx = 1;

      for (const [key, val] of Object.entries(updates)) {
        if (key === "fi_products") {
          setClauses.push(`${key} = $${idx++}::jsonb`);
          queryParams.push(JSON.stringify(val));
        } else {
          setClauses.push(`${key} = $${idx++}`);
          queryParams.push(val);
        }
      }

      // Build WHERE clause with optional optimistic lock
      let whereClause = `WHERE id = $${idx} AND dealer_id = $${idx + 1}`;
      const finalParams = [...queryParams, dealId, dealerId];

      if (expectedUpdatedAt) {
        whereClause += ` AND updated_at = $${idx + 2}`;
        finalParams.push(expectedUpdatedAt);
      }

      const result = await query(
        `UPDATE deals SET ${setClauses.join(", ")}
          ${whereClause}
          RETURNING *`,
        finalParams,
      );

      if ((result.rows as unknown[]).length === 0) {
        // Distinguish between not-found and concurrent modification
        if (expectedUpdatedAt) {
          // Check if the deal exists at all
          const existsCheck = await query(
            `SELECT id FROM deals WHERE id = $1 AND dealer_id = $2`,
            [dealId, dealerId],
          );
          if ((existsCheck.rows as unknown[]).length > 0) {
            return NextResponse.json(
              { error: new ConcurrentModificationError("Deal").message },
              { status: 409 },
            );
          }
        }
        return NextResponse.json({ error: "Deal not found" }, { status: 404 });
      }

      try {
        const status = updates.status as string | undefined;
        if (status === "presented" || status === "accepted" || status === "funded" || status === "unwound") {
          trackDeal(`deal.${status}` as "deal.presented" | "deal.accepted" | "deal.funded" | "deal.unwound", dealerId, { deal_id: dealId, gross: Number(updates.total_gross ?? 0) });
        }
      } catch {}

      return NextResponse.json({ deal: result.rows[0], updated: true });
    } catch (err) {
      console.error(`[api/admin/deals/${dealId}] DB update error:`, err);
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode ---- */
  const existing = mutations.get(dealId) ?? {};
  const merged = { ...existing, ...updates, updated_at: new Date().toISOString() };
  mutations.set(dealId, merged);

  try {
    const status = updates.status as string | undefined;
    if (status === "presented" || status === "accepted" || status === "funded" || status === "unwound") {
      trackDeal(`deal.${status}` as "deal.presented" | "deal.accepted" | "deal.funded" | "deal.unwound", dealerId, { deal_id: dealId, gross: Number(updates.total_gross ?? 0) });
    }
  } catch {}

  return NextResponse.json({
    deal: { ...MOCK_DEAL, id: dealId, ...merged },
    updated: true,
  });
}
