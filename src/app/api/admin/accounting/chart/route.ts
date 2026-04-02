/**
 * GET  /api/admin/accounting/chart — Get chart of accounts
 * POST /api/admin/accounting/chart — Seed default chart of accounts for a dealer
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackGL } from "@/lib/analytics-hooks";
import { getDefaultChartOfAccounts } from "@/lib/general-ledger";

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  let accounts: Record<string, unknown>[] = [];

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const { rows } = await query(
        `SELECT * FROM chart_of_accounts
         WHERE dealer_id = $1 AND is_active = true
         ORDER BY account_number ASC`,
        [dealerId],
      );
      accounts = rows;
    } catch (err) {
      console.error("[api/accounting/chart] GET error:", err);
    }
  }

  // Fallback: return default chart if DB empty
  if (accounts.length === 0) {
    const defaults = getDefaultChartOfAccounts();
    return NextResponse.json({
      accounts: defaults,
      count: defaults.length,
      source: "defaults",
    });
  }

  return NextResponse.json({ accounts, count: accounts.length, source: "database" });
}

export async function POST(_request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const defaults = getDefaultChartOfAccounts();
  let seeded = 0;

  try {
    const { query } = await import("@/lib/db");

    for (const acct of defaults) {
      await query(
        `INSERT INTO chart_of_accounts
           (dealer_id, account_number, name, description, account_type, sub_type,
            normal_balance, is_header, is_system, depth)
         VALUES ($1, $2, $3, '', $4, $5, $6, $7, true, $8)
         ON CONFLICT (dealer_id, account_number) DO NOTHING`,
        [
          dealerId, acct.account_number, acct.name, acct.account_type,
          acct.sub_type, acct.normal_balance, acct.is_header,
          acct.parent_number ? 1 : 0,
        ],
      );
      seeded++;
    }
  } catch (err) {
    console.error("[api/accounting/chart] POST error:", err);
    return NextResponse.json({ error: "Failed to seed chart of accounts" }, { status: 500 });
  }

  trackGL("gl.account_created", dealerId, {
    action: "seed_defaults",
    account_count: seeded,
  });

  return NextResponse.json({ seeded, total: defaults.length });
}
