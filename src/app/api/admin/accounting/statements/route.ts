/**
 * GET /api/admin/accounting/statements — Generate financial statements
 *
 * Query params:
 *   type: trial_balance | pnl | balance_sheet
 *   period: YYYY-MM (optional, defaults to current month)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackGL } from "@/lib/analytics-hooks";
import {
  generateTrialBalance,
  generateProfitAndLoss,
  type AccountType,
  type NormalBalance,
} from "@/lib/general-ledger";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type") ?? "trial_balance";

  if (!["trial_balance", "pnl", "balance_sheet"].includes(type)) {
    return NextResponse.json(
      { error: "type must be trial_balance, pnl, or balance_sheet" },
      { status: 400 },
    );
  }

  // Load account balances from DB
  let accounts: {
    account_number: string;
    name: string;
    account_type: AccountType;
    sub_type: string;
    balance: number;
    normal_balance: NormalBalance;
  }[] = [];

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const { rows } = await query(
        `SELECT account_number, name, account_type, sub_type,
                current_balance as balance, normal_balance
         FROM chart_of_accounts
         WHERE dealer_id = $1 AND is_active = true AND is_header = false
         ORDER BY account_number ASC`,
        [dealerId],
      );
      accounts = rows.map((r: Record<string, unknown>) => ({
        account_number: r.account_number as string,
        name: r.name as string,
        account_type: r.account_type as AccountType,
        sub_type: r.sub_type as string,
        balance: Number(r.balance) || 0,
        normal_balance: r.normal_balance as NormalBalance,
      }));
    } catch (err) {
      console.error("[api/accounting/statements] DB error:", err);
    }
  }

  let result: Record<string, unknown>;

  switch (type) {
    case "trial_balance": {
      const tb = generateTrialBalance(accounts);
      result = { type: "trial_balance", ...tb };
      trackGL("gl.trial_balance_generated", dealerId, {
        account_count: tb.rows.length,
        is_balanced: tb.is_balanced,
      });
      break;
    }
    case "pnl": {
      const pnl = generateProfitAndLoss(accounts);
      result = { type: "pnl", ...pnl };
      trackGL("gl.pnl_generated", dealerId, {
        revenue: pnl.revenue,
        net_income: pnl.net_income,
      });
      break;
    }
    case "balance_sheet": {
      const assets = accounts.filter((a) => a.account_type === "asset").reduce((s, a) => s + a.balance, 0);
      const liabilities = accounts.filter((a) => a.account_type === "liability").reduce((s, a) => s + a.balance, 0);
      const equity = accounts.filter((a) => a.account_type === "equity").reduce((s, a) => s + a.balance, 0);
      result = {
        type: "balance_sheet",
        total_assets: Math.round(assets * 100) / 100,
        total_liabilities: Math.round(liabilities * 100) / 100,
        total_equity: Math.round(equity * 100) / 100,
        is_balanced: Math.round(assets * 100) === Math.round((liabilities + equity) * 100),
        accounts,
      };
      trackGL("gl.balance_sheet_generated", dealerId, {
        total_assets: Math.round(assets * 100) / 100,
      });
      break;
    }
    default:
      result = { error: "Unknown statement type" };
  }

  return NextResponse.json({
    ...result,
    generated_at: new Date().toISOString(),
  });
}
