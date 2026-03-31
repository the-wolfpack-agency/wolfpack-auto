/**
 * POST /api/admin/leads/[id]/convert — Convert a lead into a deal worksheet.
 *
 * Fetches lead data (name, email, phone, vehicle interest), creates a new deal
 * with status "working" pre-populated from lead data, and updates the lead
 * status to "converted".
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackLead, trackDeal, trackSecurity } from "@/lib/analytics-hooks";
import { checkIdempotency, recordIdempotency, idempotencyKey } from "@/lib/idempotency";

/** Fallback dealer UUID used when DEALER_ID env var is not set (demo mode). */
const DEALER_ID =
  process.env.DEALER_ID ?? "00000000-0000-4000-a000-000000000001";

/* -------------------------------------------------------------------------- */
/* POST /api/admin/leads/[id]/convert                                         */
/* -------------------------------------------------------------------------- */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Lead ID required" }, { status: 400 });
  }

  const rl = await checkRateLimit(`lead-convert:${dealerId}`, 10, 60);
  if (!rl.allowed) {
    try { trackSecurity("security.rate_limit_triggered", dealerId, { route: "lead-convert", remaining: 0 }); } catch {}
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // Optional body overrides (salesperson, deal_type, selling_price, vehicle_vin)
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional — proceed with defaults from the lead
  }

  // Idempotency — prevent duplicate conversions from double-clicks
  const iKey = idempotencyKey(`/api/admin/leads/${id}/convert`, { id, ...body });
  const cached = checkIdempotency(iKey);
  if (cached) return NextResponse.json(cached, { status: 201 });

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      // 1. Fetch the lead
      const leadResult = await query(
        `SELECT * FROM leads WHERE id = $1 AND dealer_id = $2 AND deleted_at IS NULL`,
        [id, dealerId],
      );

      if ((leadResult.rows as unknown[]).length === 0) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }

      const lead = leadResult.rows[0] as Record<string, unknown>;

      // Prevent double conversion
      if (lead.status === "converted") {
        return NextResponse.json(
          { error: "Lead has already been converted to a deal" },
          { status: 409 },
        );
      }

      // 2. Create the deal from lead data
      const customerName = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim();
      const vehicleInterest = String(lead.vehicle_interest ?? "");

      const dealResult = await query(
        `INSERT INTO deals (
           dealer_id, status, deal_type,
           customer_name, customer_email, customer_phone,
           salesperson,
           vehicle_vin,
           selling_price,
           notes,
           lead_id
         ) VALUES (
           $1, 'working', $2,
           $3, $4, $5,
           $6,
           $7,
           $8,
           $9,
           $10
         ) RETURNING *`,
        [
          dealerId,
          body.deal_type || "retail",
          customerName,
          lead.email || null,
          lead.phone || null,
          body.salesperson || lead.assigned_to || null,
          body.vehicle_vin || null,
          body.selling_price || 0,
          `Converted from lead. Vehicle interest: ${vehicleInterest}`,
          id,
        ],
      );

      // 3. Mark lead as converted
      await query(
        `UPDATE leads SET status = 'converted', updated_at = NOW() WHERE id = $1 AND dealer_id = $2`,
        [id, dealerId],
      );

      // 4. Track analytics
      try { trackLead("lead.converted", dealerId, { lead_id: id, action: "converted_to_deal" }); } catch {}
      try { trackDeal("deal.created", dealerId, { deal_type: String(body.deal_type || "retail"), source: "lead_conversion", lead_id: id }); } catch {}

      const resp = {
        deal: dealResult.rows[0],
        lead_id: id,
        converted: true,
      };
      recordIdempotency(iKey, resp);
      return NextResponse.json(resp, { status: 201 });
    } catch (err) {
      console.error("[api/admin/leads/[id]/convert] DB error, falling back to mock:", err);
      /* fall through to shadow mode */
    }
  }

  /* ---- Shadow mode ---- */
  const newDeal = {
    id: `deal-${Date.now()}`,
    dealer_id: dealerId,
    status: "working",
    deal_type: body.deal_type || "retail",
    customer_name: body.customer_name || "Lead Customer",
    customer_email: body.customer_email || null,
    customer_phone: body.customer_phone || null,
    salesperson: body.salesperson || null,
    vehicle_vin: body.vehicle_vin || null,
    vehicle_year: null,
    vehicle_make: null,
    vehicle_model: null,
    selling_price: body.selling_price || 0,
    trade_vehicle: null,
    trade_value: 0,
    front_gross: 0,
    back_gross: 0,
    total_gross: 0,
    lender: null,
    lender_status: null,
    monthly_payment: 0,
    notes: `Converted from lead ${id}`,
    lead_id: id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try { trackLead("lead.converted", dealerId, { lead_id: id, action: "converted_to_deal" }); } catch {}
  try { trackDeal("deal.created", dealerId, { deal_type: String(newDeal.deal_type), source: "lead_conversion", lead_id: id }); } catch {}

  const resp = {
    deal: newDeal,
    lead_id: id,
    converted: true,
  };
  recordIdempotency(iKey, resp);
  return NextResponse.json(resp, { status: 201 });
}
