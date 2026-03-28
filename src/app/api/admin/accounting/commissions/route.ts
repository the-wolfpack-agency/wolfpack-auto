import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

const DEALER_ID = process.env.DEALER_ID ?? "default";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface CommissionEntry {
  id: string;
  employee_name: string;
  employee_role: "salesperson" | "fi_manager" | "sales_manager";
  sale_id: string;
  deal_description: string;
  gross_basis: number;
  rate_percent: number;
  amount: number;
  pay_period: string;
  paid: boolean;
  paid_date: string | null;
}

/* -------------------------------------------------------------------------- */
/* Shadow / mock data                                                          */
/* -------------------------------------------------------------------------- */

const MOCK_COMMISSIONS: CommissionEntry[] = [
  {
    id: "comm-001",
    employee_name: "Jake Martinez",
    employee_role: "salesperson",
    sale_id: "sale-001",
    deal_description: "2024 Toyota Camry SE — Sarah Johnson",
    gross_basis: 3250,
    rate_percent: 25,
    amount: 812.50,
    pay_period: "2026-03-16/2026-03-31",
    paid: false,
    paid_date: null,
  },
  {
    id: "comm-002",
    employee_name: "Priya Patel",
    employee_role: "fi_manager",
    sale_id: "sale-001",
    deal_description: "2024 Toyota Camry SE — Sarah Johnson",
    gross_basis: 2100,
    rate_percent: 15,
    amount: 315.00,
    pay_period: "2026-03-16/2026-03-31",
    paid: false,
    paid_date: null,
  },
  {
    id: "comm-003",
    employee_name: "Tom Bradley",
    employee_role: "salesperson",
    sale_id: "sale-002",
    deal_description: "2023 Honda CR-V EX-L — David Park",
    gross_basis: 3800,
    rate_percent: 25,
    amount: 950.00,
    pay_period: "2026-03-16/2026-03-31",
    paid: false,
    paid_date: null,
  },
  {
    id: "comm-004",
    employee_name: "Mike Reynolds",
    employee_role: "salesperson",
    sale_id: "sale-003",
    deal_description: "2024 Ford F-150 XLT — Michael Chen",
    gross_basis: 4950,
    rate_percent: 25,
    amount: 1237.50,
    pay_period: "2026-03-16/2026-03-31",
    paid: false,
    paid_date: null,
  },
  {
    id: "comm-005",
    employee_name: "Priya Patel",
    employee_role: "fi_manager",
    sale_id: "sale-003",
    deal_description: "2024 Ford F-150 XLT — Michael Chen",
    gross_basis: 2850,
    rate_percent: 15,
    amount: 427.50,
    pay_period: "2026-03-16/2026-03-31",
    paid: false,
    paid_date: null,
  },
  {
    id: "comm-006",
    employee_name: "Jake Martinez",
    employee_role: "salesperson",
    sale_id: "sale-004",
    deal_description: "2024 Hyundai Tucson SEL — Jennifer Williams",
    gross_basis: 2700,
    rate_percent: 25,
    amount: 675.00,
    pay_period: "2026-03-16/2026-03-31",
    paid: false,
    paid_date: null,
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/accounting/commissions                                       */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { searchParams } = new URL(request.url);
  const payPeriod = searchParams.get("pay_period");

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const conditions = ["dealer_id = $1"];
      const params: unknown[] = [DEALER_ID];
      let idx = 2;

      if (payPeriod) {
        conditions.push(`pay_period = $${idx++}`);
        params.push(payPeriod);
      }

      const result = await query(
        `SELECT * FROM commissions WHERE ${conditions.join(" AND ")} ORDER BY employee_name, paid`,
        params,
      );
      return NextResponse.json({ commissions: result.rows });
    } catch (err) {
      console.error("[api/admin/accounting/commissions] DB error:", err);
    }
  }

  // Shadow mode
  let filtered = [...MOCK_COMMISSIONS];
  if (payPeriod) {
    filtered = filtered.filter((c) => c.pay_period === payPeriod);
  }

  return NextResponse.json({ commissions: filtered });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/accounting/commissions                                      */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  let body: Partial<CommissionEntry> & { action?: "mark_paid"; ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Bulk mark-paid action
  if (body.action === "mark_paid" && body.ids?.length) {
    if (process.env.DATABASE_URL) {
      try {
        const { query } = await import("@/lib/db");
        const placeholders = body.ids.map((_, i) => `$${i + 3}`).join(",");
        await query(
          `UPDATE commissions SET paid = true, paid_date = $1 WHERE dealer_id = $2 AND id IN (${placeholders})`,
          [new Date().toISOString().split("T")[0], DEALER_ID, ...body.ids],
        );
        return NextResponse.json({ success: true, marked_paid: body.ids.length });
      } catch (err) {
        console.error("[api/admin/accounting/commissions] mark_paid error:", err);
      }
    }
    return NextResponse.json({ success: true, marked_paid: body.ids.length, mode: "shadow" });
  }

  // Create commission
  if (!body.employee_name || !body.sale_id || !body.amount) {
    return NextResponse.json(
      { error: "employee_name, sale_id, and amount are required" },
      { status: 400 },
    );
  }

  const newId = `comm-${Date.now()}`;

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      await query(
        `INSERT INTO commissions (id, dealer_id, employee_name, employee_role, sale_id, deal_description,
         gross_basis, rate_percent, amount, pay_period, paid, paid_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,null)`,
        [newId, DEALER_ID, body.employee_name, body.employee_role ?? "salesperson", body.sale_id,
         body.deal_description ?? "", body.gross_basis ?? 0, body.rate_percent ?? 25,
         body.amount, body.pay_period ?? ""],
      );
      return NextResponse.json({ success: true, id: newId });
    } catch (err) {
      console.error("[api/admin/accounting/commissions] POST error:", err);
    }
  }

  return NextResponse.json({ success: true, id: newId, mode: "shadow" });
}
