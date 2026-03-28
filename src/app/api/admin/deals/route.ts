/**
 * GET  /api/admin/deals — List deal worksheets (filterable)
 * POST /api/admin/deals — Create a new deal worksheet
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

/* -------------------------------------------------------------------------- */
/* Shadow mock data                                                           */
/* -------------------------------------------------------------------------- */

const MOCK_DEALS = [
  {
    id: "deal-001",
    dealer_id: "demo-dealer",
    status: "working",
    deal_type: "retail",
    customer_name: "James Rodriguez",
    customer_email: "james.r@email.com",
    customer_phone: "(512) 555-0147",
    salesperson: "Mike Chen",
    vehicle_year: 2024,
    vehicle_make: "Toyota",
    vehicle_model: "Camry XSE",
    vehicle_vin: "4T1G11AK5RU123456",
    vehicle_stock: "T24-0892",
    vehicle_color: "Midnight Black Metallic",
    vehicle_mileage: 12,
    msrp: 32340,
    selling_price: 31500,
    invoice: 30200,
    trade_vehicle: "2019 Honda Civic EX",
    trade_value: 14500,
    trade_payoff: 6200,
    down_payment: 3000,
    rebates: 1000,
    apr: 5.49,
    term_months: 72,
    monthly_payment: 478.23,
    front_gross: 1300,
    back_gross: 2150,
    total_gross: 3450,
    fi_products: ["extended-warranty", "gap-insurance"],
    lender: "Toyota Financial Services",
    lender_status: "approved",
    notes: "Customer prefers monthly under $500. Trade is clean, no damage.",
    created_at: "2026-03-28T09:15:00Z",
    updated_at: "2026-03-28T14:22:00Z",
  },
  {
    id: "deal-002",
    dealer_id: "demo-dealer",
    status: "pending_approval",
    deal_type: "retail",
    customer_name: "Sarah Mitchell",
    customer_email: "sarah.m@email.com",
    customer_phone: "(512) 555-0293",
    salesperson: "Lisa Park",
    vehicle_year: 2025,
    vehicle_make: "Honda",
    vehicle_model: "CR-V Hybrid Sport-L",
    vehicle_vin: "7FARS6H79RE045678",
    vehicle_stock: "H25-0341",
    vehicle_color: "Canyon River Blue",
    vehicle_mileage: 8,
    msrp: 39845,
    selling_price: 39845,
    invoice: 37100,
    trade_vehicle: null,
    trade_value: 0,
    trade_payoff: 0,
    down_payment: 5000,
    rebates: 0,
    apr: 4.99,
    term_months: 60,
    monthly_payment: 657.81,
    front_gross: 2745,
    back_gross: 3200,
    total_gross: 5945,
    fi_products: ["extended-warranty", "paint-protection", "tire-wheel"],
    lender: "Honda Financial Services",
    lender_status: "submitted",
    notes: "First-time buyer. Excellent credit 780+. Full sticker — no discount.",
    created_at: "2026-03-28T10:30:00Z",
    updated_at: "2026-03-28T13:45:00Z",
  },
  {
    id: "deal-003",
    dealer_id: "demo-dealer",
    status: "funded",
    deal_type: "retail",
    customer_name: "Robert Kim",
    customer_email: "robert.kim@email.com",
    customer_phone: "(512) 555-0871",
    salesperson: "Mike Chen",
    vehicle_year: 2024,
    vehicle_make: "Ford",
    vehicle_model: "F-150 XLT SuperCrew",
    vehicle_vin: "1FTFW1E80RFA12345",
    vehicle_stock: "F24-0567",
    vehicle_color: "Iconic Silver",
    vehicle_mileage: 45,
    msrp: 52890,
    selling_price: 51200,
    invoice: 49500,
    trade_vehicle: "2020 Chevrolet Silverado 1500 LT",
    trade_value: 28000,
    trade_payoff: 12500,
    down_payment: 5000,
    rebates: 2500,
    apr: 6.29,
    term_months: 72,
    monthly_payment: 421.55,
    front_gross: 1700,
    back_gross: 1800,
    total_gross: 3500,
    fi_products: ["extended-warranty", "theft-protection"],
    lender: "Ford Motor Credit",
    lender_status: "funded",
    notes: "Deal funded 3/27. Title work in progress.",
    created_at: "2026-03-25T08:00:00Z",
    updated_at: "2026-03-27T16:30:00Z",
  },
  {
    id: "deal-004",
    dealer_id: "demo-dealer",
    status: "working",
    deal_type: "lease",
    customer_name: "Emily Watson",
    customer_email: "emily.w@email.com",
    customer_phone: "(512) 555-0412",
    salesperson: "David Torres",
    vehicle_year: 2025,
    vehicle_make: "BMW",
    vehicle_model: "X3 xDrive30i",
    vehicle_vin: "5UX43DP05R9E78901",
    vehicle_stock: "B25-0123",
    vehicle_color: "Alpine White",
    vehicle_mileage: 5,
    msrp: 49995,
    selling_price: 48500,
    invoice: 46200,
    trade_vehicle: "2022 BMW X1 sDrive28i",
    trade_value: 22000,
    trade_payoff: 8500,
    down_payment: 4000,
    rebates: 0,
    apr: 3.99,
    term_months: 36,
    monthly_payment: 489.00,
    front_gross: 2300,
    back_gross: 1650,
    total_gross: 3950,
    fi_products: ["maintenance-plan", "tire-wheel"],
    lender: "BMW Financial Services",
    lender_status: "pending",
    notes: "Lease — 10K mi/yr. Residual 58%. Customer wants to finalize today.",
    created_at: "2026-03-28T11:00:00Z",
    updated_at: "2026-03-28T11:45:00Z",
  },
  {
    id: "deal-005",
    dealer_id: "demo-dealer",
    status: "delivered",
    deal_type: "cash",
    customer_name: "William Tran",
    customer_email: "wtran@email.com",
    customer_phone: "(512) 555-0639",
    salesperson: "Lisa Park",
    vehicle_year: 2023,
    vehicle_make: "Lexus",
    vehicle_model: "RX 350 F Sport",
    vehicle_vin: "2T2HZMDA4PC123456",
    vehicle_stock: "L23-0089",
    vehicle_color: "Matador Red Mica",
    vehicle_mileage: 18200,
    msrp: 56500,
    selling_price: 42900,
    invoice: 40000,
    trade_vehicle: null,
    trade_value: 0,
    trade_payoff: 0,
    down_payment: 42900,
    rebates: 0,
    apr: 0,
    term_months: 0,
    monthly_payment: 0,
    front_gross: 2900,
    back_gross: 950,
    total_gross: 3850,
    fi_products: ["paint-protection"],
    lender: null,
    lender_status: null,
    notes: "Cash deal — CPO unit. Delivered 3/26.",
    created_at: "2026-03-24T14:00:00Z",
    updated_at: "2026-03-26T10:00:00Z",
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/deals                                                       */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const url = request.nextUrl;
  const status = url.searchParams.get("status") || "";
  const salesperson = url.searchParams.get("salesperson") || "";
  const dateFrom = url.searchParams.get("date_from") || "";
  const dateTo = url.searchParams.get("date_to") || "";

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const conditions: string[] = ["d.dealer_id = $1"];
      const params: unknown[] = [dealerId];
      let idx = 2;

      if (status) {
        conditions.push(`d.status = $${idx++}`);
        params.push(status);
      }
      if (salesperson) {
        conditions.push(`d.salesperson ILIKE $${idx++}`);
        params.push(`%${salesperson}%`);
      }
      if (dateFrom) {
        conditions.push(`d.created_at >= $${idx++}`);
        params.push(dateFrom);
      }
      if (dateTo) {
        conditions.push(`d.created_at <= $${idx++}`);
        params.push(dateTo);
      }

      const result = await query(
        `SELECT d.*
           FROM deals d
          WHERE ${conditions.join(" AND ")}
          ORDER BY d.updated_at DESC
          LIMIT 100`,
        params,
      );

      return NextResponse.json({ deals: result.rows, total: (result.rows as unknown[]).length });
    } catch (err) {
      console.error("[api/admin/deals] DB error, falling back to mock:", err);
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode ---- */
  let filtered = [...MOCK_DEALS];
  if (status) filtered = filtered.filter((d) => d.status === status);
  if (salesperson)
    filtered = filtered.filter((d) =>
      d.salesperson.toLowerCase().includes(salesperson.toLowerCase()),
    );
  if (dateFrom)
    filtered = filtered.filter((d) => d.created_at >= dateFrom);
  if (dateTo)
    filtered = filtered.filter((d) => d.created_at <= dateTo);

  return NextResponse.json({ deals: filtered, total: filtered.length });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/deals                                                      */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const required = ["customer_name", "vehicle_vin", "selling_price"];
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json(
        { error: `Missing required field: ${field}` },
        { status: 422 },
      );
    }
  }

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `INSERT INTO deals (
           dealer_id, status, deal_type,
           customer_name, customer_email, customer_phone,
           salesperson,
           vehicle_year, vehicle_make, vehicle_model, vehicle_vin,
           vehicle_stock, vehicle_color, vehicle_mileage,
           msrp, selling_price, invoice,
           trade_vehicle, trade_value, trade_payoff,
           down_payment, rebates, apr, term_months,
           monthly_payment, front_gross, back_gross, total_gross,
           fi_products, lender, notes
         ) VALUES (
           $1, 'working', $2,
           $3, $4, $5,
           $6,
           $7, $8, $9, $10,
           $11, $12, $13,
           $14, $15, $16,
           $17, $18, $19,
           $20, $21, $22, $23,
           $24, $25, $26, $27,
           $28, $29, $30
         ) RETURNING *`,
        [
          dealerId,
          body.deal_type || "retail",
          body.customer_name,
          body.customer_email || null,
          body.customer_phone || null,
          body.salesperson || null,
          body.vehicle_year || null,
          body.vehicle_make || null,
          body.vehicle_model || null,
          body.vehicle_vin,
          body.vehicle_stock || null,
          body.vehicle_color || null,
          body.vehicle_mileage || 0,
          body.msrp || 0,
          body.selling_price,
          body.invoice || 0,
          body.trade_vehicle || null,
          body.trade_value || 0,
          body.trade_payoff || 0,
          body.down_payment || 0,
          body.rebates || 0,
          body.apr || 0,
          body.term_months || 0,
          body.monthly_payment || 0,
          body.front_gross || 0,
          body.back_gross || 0,
          body.total_gross || 0,
          JSON.stringify(body.fi_products || []),
          body.lender || null,
          body.notes || null,
        ],
      );

      return NextResponse.json({ deal: result.rows[0], created: true }, { status: 201 });
    } catch (err) {
      console.error("[api/admin/deals] DB insert error, falling back to mock:", err);
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode ---- */
  const newDeal = {
    id: `deal-${Date.now()}`,
    dealer_id: dealerId,
    status: "working",
    deal_type: body.deal_type || "retail",
    customer_name: body.customer_name,
    customer_email: body.customer_email || null,
    customer_phone: body.customer_phone || null,
    salesperson: body.salesperson || null,
    vehicle_year: body.vehicle_year || null,
    vehicle_make: body.vehicle_make || null,
    vehicle_model: body.vehicle_model || null,
    vehicle_vin: body.vehicle_vin,
    vehicle_stock: body.vehicle_stock || null,
    vehicle_color: body.vehicle_color || null,
    vehicle_mileage: body.vehicle_mileage || 0,
    msrp: body.msrp || 0,
    selling_price: body.selling_price,
    invoice: body.invoice || 0,
    trade_vehicle: body.trade_vehicle || null,
    trade_value: body.trade_value || 0,
    trade_payoff: body.trade_payoff || 0,
    down_payment: body.down_payment || 0,
    rebates: body.rebates || 0,
    apr: body.apr || 0,
    term_months: body.term_months || 0,
    monthly_payment: body.monthly_payment || 0,
    front_gross: body.front_gross || 0,
    back_gross: body.back_gross || 0,
    total_gross: body.total_gross || 0,
    fi_products: body.fi_products || [],
    lender: body.lender || null,
    lender_status: null,
    notes: body.notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return NextResponse.json({ deal: newDeal, created: true }, { status: 201 });
}
