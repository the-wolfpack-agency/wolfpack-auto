import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackAccounting } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Standard dealer chart of accounts                                          */
/* -------------------------------------------------------------------------- */

const STANDARD_ACCOUNTS = [
  { code: "1000", name: "Cash — Operating", type: "asset", category: "current_asset" },
  { code: "1100", name: "Accounts Receivable", type: "asset", category: "current_asset" },
  { code: "1200", name: "Vehicle Inventory", type: "asset", category: "current_asset" },
  { code: "1300", name: "Parts Inventory", type: "asset", category: "current_asset" },
  { code: "1500", name: "Floor Plan Receivable", type: "asset", category: "current_asset" },
  { code: "2000", name: "Accounts Payable", type: "liability", category: "current_liability" },
  { code: "2100", name: "Floor Plan Payable", type: "liability", category: "current_liability" },
  { code: "2200", name: "Sales Tax Payable", type: "liability", category: "current_liability" },
  { code: "2300", name: "Accrued Liabilities", type: "liability", category: "current_liability" },
  { code: "4000", name: "Vehicle Sales", type: "revenue", category: "revenue" },
  { code: "4100", name: "F&I Income", type: "revenue", category: "revenue" },
  { code: "4200", name: "Service Revenue", type: "revenue", category: "revenue" },
  { code: "4300", name: "Parts Revenue", type: "revenue", category: "revenue" },
  { code: "4400", name: "Body Shop Revenue", type: "revenue", category: "revenue" },
  { code: "5000", name: "Cost of Vehicles Sold", type: "expense", category: "cogs" },
  { code: "5100", name: "Floor Plan Interest", type: "expense", category: "cogs" },
  { code: "5200", name: "Cost of Parts Sold", type: "expense", category: "cogs" },
  { code: "6000", name: "Sales Commissions", type: "expense", category: "operating" },
  { code: "6100", name: "Advertising", type: "expense", category: "operating" },
  { code: "6200", name: "Rent", type: "expense", category: "operating" },
  { code: "6300", name: "Utilities", type: "expense", category: "operating" },
  { code: "6400", name: "Insurance", type: "expense", category: "operating" },
  { code: "6500", name: "Payroll", type: "expense", category: "operating" },
  { code: "6600", name: "Office Supplies", type: "expense", category: "operating" },
  { code: "6700", name: "Professional Fees", type: "expense", category: "operating" },
  { code: "7000", name: "Depreciation", type: "expense", category: "non_operating" },
  { code: "7100", name: "Interest Expense", type: "expense", category: "non_operating" },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/accounting/chart-of-accounts                                */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  // Database path
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `SELECT * FROM chart_of_accounts WHERE dealer_id = $1 ORDER BY code`,
        [authResult.user.dealer_id],
      );
      if ((result.rows as any[]).length > 0) {
        return NextResponse.json({ accounts: result.rows });
      }
    } catch (err) {
      console.error("[api/admin/accounting/chart-of-accounts] DB error:", err);
      // Fall through to mock
    }
  }

  // Shadow mode
  return NextResponse.json({ accounts: STANDARD_ACCOUNTS });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/accounting/chart-of-accounts — add custom account          */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  let body: { code?: string; name?: string; type?: string; category?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.code || !body.name || !body.type) {
    return NextResponse.json(
      { error: "code, name, and type are required" },
      { status: 422 },
    );
  }

  // Database path
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `INSERT INTO chart_of_accounts (code, name, type, category, dealer_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [body.code, body.name, body.type, body.category ?? "custom", authResult.user.dealer_id],
      );
      try { trackAccounting("accounting.chart_updated", authResult?.user?.dealer_id ?? "system", { action: "account_added", code: body.code ?? "" }); } catch {}
      return NextResponse.json({ account: result.rows[0] }, { status: 201 });
    } catch (err) {
      console.error("[api/admin/accounting/chart-of-accounts] DB insert error:", err);
      // Fall through to mock
    }
  }

  // Shadow mode
  try { trackAccounting("accounting.chart_updated", authResult?.user?.dealer_id ?? "system", { action: "account_added", code: body.code ?? "" }); } catch {}
  return NextResponse.json({
    account: {
      code: body.code,
      name: body.name,
      type: body.type,
      category: body.category ?? "custom",
    },
  }, { status: 201 });
}
