import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackAccounting } from "@/lib/analytics-hooks";
import { getDealerId } from "@/lib/get-dealer-id";
import { checkIdempotency, recordIdempotency, idempotencyKey } from "@/lib/idempotency";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface SaleEntry {
  id: string;
  date: string;
  stock_number: string;
  vehicle: string;
  vin: string;
  customer_name: string;
  customer_email: string;
  sale_price: number;
  cost: number;
  front_gross: number;
  back_gross: number;
  fi_gross: number;
  total_gross: number;
  salesperson: string;
  fi_manager: string;
  deal_type: "retail" | "wholesale" | "lease";
  trade_in: string | null;
  trade_allowance: number | null;
}

/* -------------------------------------------------------------------------- */
/* Shadow / mock data                                                          */
/* -------------------------------------------------------------------------- */

const MOCK_SALES: SaleEntry[] = [
  {
    id: "sale-001",
    date: "2026-03-27",
    stock_number: "WP-4521",
    vehicle: "2024 Toyota Camry SE",
    vin: "4T1BF1FK5EU123456",
    customer_name: "Sarah Johnson",
    customer_email: "sarah.johnson@email.com",
    sale_price: 29450,
    cost: 26200,
    front_gross: 3250,
    back_gross: 1875,
    fi_gross: 2100,
    total_gross: 7225,
    salesperson: "Jake Martinez",
    fi_manager: "Priya Patel",
    deal_type: "retail",
    trade_in: "2019 Honda Civic LX",
    trade_allowance: 12500,
  },
  {
    id: "sale-002",
    date: "2026-03-27",
    stock_number: "WP-4498",
    vehicle: "2023 Honda CR-V EX-L",
    vin: "7FARW2H89PE012345",
    customer_name: "David Park",
    customer_email: "david.park@email.com",
    sale_price: 34900,
    cost: 31100,
    front_gross: 3800,
    back_gross: 2200,
    fi_gross: 1650,
    total_gross: 7650,
    salesperson: "Tom Bradley",
    fi_manager: "Priya Patel",
    deal_type: "retail",
    trade_in: null,
    trade_allowance: null,
  },
  {
    id: "sale-003",
    date: "2026-03-26",
    stock_number: "WP-4510",
    vehicle: "2024 Ford F-150 XLT",
    vin: "1FTFW1E86PFA78901",
    customer_name: "Michael Chen",
    customer_email: "michael.chen@company.com",
    sale_price: 48750,
    cost: 43800,
    front_gross: 4950,
    back_gross: 3100,
    fi_gross: 2850,
    total_gross: 10900,
    salesperson: "Mike Reynolds",
    fi_manager: "Priya Patel",
    deal_type: "retail",
    trade_in: "2020 Chevrolet Silverado 1500",
    trade_allowance: 28000,
  },
  {
    id: "sale-004",
    date: "2026-03-25",
    stock_number: "WP-4483",
    vehicle: "2024 Hyundai Tucson SEL",
    vin: "5NMS3DAJ5PH234567",
    customer_name: "Jennifer Williams",
    customer_email: "jen.williams@email.com",
    sale_price: 32100,
    cost: 29400,
    front_gross: 2700,
    back_gross: 1400,
    fi_gross: 1950,
    total_gross: 6050,
    salesperson: "Jake Martinez",
    fi_manager: "Priya Patel",
    deal_type: "retail",
    trade_in: "2018 Nissan Rogue S",
    trade_allowance: 10500,
  },
  {
    id: "sale-005",
    date: "2026-03-24",
    stock_number: "WP-4472",
    vehicle: "2023 Chevrolet Equinox LT",
    vin: "3GNAXKEV1PS345678",
    customer_name: "Robert Garcia",
    customer_email: "robert.garcia@email.com",
    sale_price: 28900,
    cost: 26500,
    front_gross: 2400,
    back_gross: 1100,
    fi_gross: 1800,
    total_gross: 5300,
    salesperson: "Tom Bradley",
    fi_manager: "James Kowalski",
    deal_type: "lease",
    trade_in: null,
    trade_allowance: null,
  },
  {
    id: "sale-006",
    date: "2026-03-22",
    stock_number: "WP-4461",
    vehicle: "2024 Toyota RAV4 LE",
    vin: "2T3W1RFV8PW456789",
    customer_name: "Amanda Torres",
    customer_email: "amanda.torres@email.com",
    sale_price: 31200,
    cost: 28600,
    front_gross: 2600,
    back_gross: 1750,
    fi_gross: 2250,
    total_gross: 6600,
    salesperson: "Mike Reynolds",
    fi_manager: "Priya Patel",
    deal_type: "retail",
    trade_in: "2017 Toyota Corolla LE",
    trade_allowance: 8500,
  },
  {
    id: "sale-007",
    date: "2026-03-20",
    stock_number: "WP-4447",
    vehicle: "2023 Ford Bronco Sport Big Bend",
    vin: "3FMCR9B67PRE67890",
    customer_name: "Carlos Mendez",
    customer_email: "carlos.mendez@email.com",
    sale_price: 36800,
    cost: 33200,
    front_gross: 3600,
    back_gross: 2000,
    fi_gross: 1500,
    total_gross: 7100,
    salesperson: "Jake Martinez",
    fi_manager: "James Kowalski",
    deal_type: "retail",
    trade_in: "2021 Nissan Altima S",
    trade_allowance: 15200,
  },
  {
    id: "sale-008",
    date: "2026-03-18",
    stock_number: "WP-4435",
    vehicle: "2024 Honda Accord Sport",
    vin: "1HGCY2F54PA789012",
    customer_name: "Lisa Brown",
    customer_email: "lisa.brown@email.com",
    sale_price: 33500,
    cost: 30100,
    front_gross: 3400,
    back_gross: 1600,
    fi_gross: 2400,
    total_gross: 7400,
    salesperson: "Tom Bradley",
    fi_manager: "Priya Patel",
    deal_type: "retail",
    trade_in: null,
    trade_allowance: null,
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/accounting/sales-log                                         */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const conditions = ["dealer_id = $1"];
      const params: unknown[] = [dealerId];
      let idx = 2;

      if (from) {
        conditions.push(`date >= $${idx++}`);
        params.push(from);
      }
      if (to) {
        conditions.push(`date <= $${idx++}`);
        params.push(to);
      }
      const result = await query( /* audit-safe: A4 reason="dealer_id always pushed as first condition above" */
        `SELECT * FROM sales_log WHERE ${conditions.join(" AND ")} ORDER BY date DESC LIMIT 200`,
        params,
      );
      return NextResponse.json({ sales: result.rows });
    } catch (err) {
      console.error("[api/admin/accounting/sales-log] DB error:", err);
    }
  }

  // Shadow mode
  let filtered = [...MOCK_SALES];
  if (from) filtered = filtered.filter((s) => s.date >= from);
  if (to) filtered = filtered.filter((s) => s.date <= to);

  return NextResponse.json({ sales: filtered });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/accounting/sales-log                                        */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  let body: Partial<SaleEntry>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.vehicle || !body.customer_name || !body.sale_price) {
    return NextResponse.json(
      { error: "vehicle, customer_name, and sale_price are required" },
      { status: 400 },
    );
  }

  // Idempotency — prevent duplicate sale entries from retries
  const iKey = idempotencyKey("/api/admin/accounting/sales-log", body);
  const cached = checkIdempotency(iKey);
  if (cached) return NextResponse.json(cached);

  const newId = `sale-${Date.now()}`;

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      await query(
        `INSERT INTO sales_log (id, dealer_id, date, stock_number, vehicle, vin, customer_name, customer_email,
         sale_price, cost, front_gross, back_gross, fi_gross, total_gross, salesperson, fi_manager, deal_type,
         trade_in, trade_allowance)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [newId, dealerId, body.date ?? new Date().toISOString().split("T")[0], body.stock_number, body.vehicle,
         body.vin, body.customer_name, body.customer_email, body.sale_price, body.cost ?? 0,
         body.front_gross ?? 0, body.back_gross ?? 0, body.fi_gross ?? 0, body.total_gross ?? 0,
         body.salesperson, body.fi_manager, body.deal_type ?? "retail", body.trade_in, body.trade_allowance],
      );
      try { trackAccounting("accounting.sale_logged", dealerId, { front_gross: Number(body.front_gross ?? 0), back_gross: Number(body.back_gross ?? 0), fi_income: Number(body.fi_gross ?? 0), salesperson: String(body.salesperson ?? "") }); } catch {}

      const resp = { success: true, id: newId };
      recordIdempotency(iKey, resp);
      return NextResponse.json(resp);
    } catch (err) {
      console.error("[api/admin/accounting/sales-log] POST DB error:", err);
    }
  }

  try { trackAccounting("accounting.sale_logged", dealerId, { front_gross: Number(body.front_gross ?? 0), back_gross: Number(body.back_gross ?? 0), fi_income: Number(body.fi_gross ?? 0), salesperson: String(body.salesperson ?? "") }); } catch {}

  const resp = { success: true, id: newId, mode: "shadow" };
  recordIdempotency(iKey, resp);
  return NextResponse.json(resp);
}
