import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackAccounting } from "@/lib/analytics-hooks";

const DEALER_ID = process.env.DEALER_ID ?? "default";

/* -------------------------------------------------------------------------- */
/* Shadow mock data                                                           */
/* -------------------------------------------------------------------------- */

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

const today = new Date().toISOString().slice(0, 10);

const MOCK_LINES = [
  {
    id: "fp-001",
    dealer_id: DEALER_ID,
    vehicle_vin: "1HGCV1F34PA012345",
    vehicle_desc: "2025 Honda Civic Sport — Silver",
    lender: "NextGear Capital",
    principal: 24500.00,
    daily_rate: 0.000164,
    funded_date: "2026-02-10",
    curtailment_date: "2026-04-10",
    payoff_date: null,
    interest_accrued: 0,
    fees: 75.00,
    status: "active" as const,
    notes: null,
    created_at: "2026-02-10T09:00:00Z",
    updated_at: "2026-02-10T09:00:00Z",
  },
  {
    id: "fp-002",
    dealer_id: DEALER_ID,
    vehicle_vin: "5TDJZRFH5PS123456",
    vehicle_desc: "2025 Toyota Highlander XLE — Midnight Black",
    lender: "AFC",
    principal: 38200.00,
    daily_rate: 0.000178,
    funded_date: "2026-01-22",
    curtailment_date: "2026-03-22",
    payoff_date: null,
    interest_accrued: 0,
    fees: 100.00,
    status: "curtailed" as const,
    notes: "First curtailment payment made 3/22",
    created_at: "2026-01-22T10:30:00Z",
    updated_at: "2026-03-22T14:00:00Z",
  },
  {
    id: "fp-003",
    dealer_id: DEALER_ID,
    vehicle_vin: "1FTFW1E8XPFA78901",
    vehicle_desc: "2025 Ford F-150 XLT — Oxford White",
    lender: "Ally Floor Plan",
    principal: 42800.00,
    daily_rate: 0.000151,
    funded_date: "2026-03-01",
    curtailment_date: "2026-05-01",
    payoff_date: null,
    interest_accrued: 0,
    fees: 50.00,
    status: "active" as const,
    notes: null,
    created_at: "2026-03-01T08:15:00Z",
    updated_at: "2026-03-01T08:15:00Z",
  },
  {
    id: "fp-004",
    dealer_id: DEALER_ID,
    vehicle_vin: "WBAJB9C57PB234567",
    vehicle_desc: "2025 BMW 330i — Alpine White",
    lender: "NextGear Capital",
    principal: 41500.00,
    daily_rate: 0.000164,
    funded_date: "2025-12-15",
    curtailment_date: "2026-02-15",
    payoff_date: "2026-03-10",
    interest_accrued: 579.26,
    fees: 75.00,
    status: "paid_off" as const,
    notes: "Sold to customer — payoff completed",
    created_at: "2025-12-15T11:00:00Z",
    updated_at: "2026-03-10T16:00:00Z",
  },
  {
    id: "fp-005",
    dealer_id: DEALER_ID,
    vehicle_vin: "3GNKBKRS1PS345678",
    vehicle_desc: "2025 Chevrolet Equinox LT — Sterling Gray",
    lender: "AFC",
    principal: 29400.00,
    daily_rate: 0.000178,
    funded_date: "2026-03-10",
    curtailment_date: "2026-05-10",
    payoff_date: null,
    interest_accrued: 0,
    fees: 0,
    status: "active" as const,
    notes: null,
    created_at: "2026-03-10T13:45:00Z",
    updated_at: "2026-03-10T13:45:00Z",
  },
  {
    id: "fp-006",
    dealer_id: DEALER_ID,
    vehicle_vin: "5YJ3E1EA2PF456789",
    vehicle_desc: "2025 Tesla Model 3 Long Range — Pearl White",
    lender: "Ally Floor Plan",
    principal: 39900.00,
    daily_rate: 0.000151,
    funded_date: "2026-02-20",
    curtailment_date: "2026-04-20",
    payoff_date: null,
    interest_accrued: 0,
    fees: 50.00,
    status: "active" as const,
    notes: "EV — high demand model",
    created_at: "2026-02-20T09:30:00Z",
    updated_at: "2026-02-20T09:30:00Z",
  },
];

function enrichLine(line: typeof MOCK_LINES[0]) {
  if ((line.status as string) === "paid_off" || (line.status as string) === "repossessed") return line;
  const days = daysBetween(line.funded_date, today);
  const interest = Math.round(line.principal * line.daily_rate * days * 100) / 100;
  return { ...line, interest_accrued: interest, days_floored: days };
}

/* -------------------------------------------------------------------------- */
/* GET /api/admin/floor-plan                                                  */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  // Database path
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `SELECT *,
                CASE WHEN status IN ('active','curtailed')
                     THEN EXTRACT(EPOCH FROM (now() - funded_date))::int / 86400
                     ELSE NULL END AS days_floored,
                CASE WHEN status IN ('active','curtailed')
                     THEN ROUND(principal * daily_rate * EXTRACT(EPOCH FROM (now() - funded_date))::int / 86400, 2)
                     ELSE interest_accrued END AS interest_accrued_live
         FROM floor_plan_lines WHERE dealer_id = $1
         ORDER BY funded_date ASC`,
        [authResult.user.dealer_id],
      );

      const lines = result.rows as any[];
      const active = lines.filter((l: any) => l.status === "active" || l.status === "curtailed");
      const totalPrincipal = active.reduce((s: number, l: any) => s + Number(l.principal), 0);
      const totalDailyInterest = active.reduce((s: number, l: any) => s + Number(l.principal) * Number(l.daily_rate), 0);
      const avgDaysFloored = active.length > 0
        ? Math.round(active.reduce((s: number, l: any) => s + (l.days_floored ?? 0), 0) / active.length)
        : 0;

      return NextResponse.json({
        lines,
        stats: {
          active_count: active.length,
          total_principal: Math.round(totalPrincipal * 100) / 100,
          total_daily_interest: Math.round(totalDailyInterest * 100) / 100,
          avg_days_floored: avgDaysFloored,
        },
      });
    } catch (err) {
      console.error("[api/admin/floor-plan] DB error:", err);
      // Fall through to mock
    }
  }

  // Shadow mode
  const enriched = MOCK_LINES.map(enrichLine);
  const active = enriched.filter((l) => l.status === "active" || l.status === "curtailed");
  const totalPrincipal = active.reduce((s, l) => s + l.principal, 0);
  const totalDailyInterest = active.reduce((s, l) => s + l.principal * l.daily_rate, 0);
  const avgDaysFloored = active.length > 0
    ? Math.round(active.reduce((s, l) => s + ((l as any).days_floored ?? 0), 0) / active.length)
    : 0;

  return NextResponse.json({
    lines: enriched,
    stats: {
      active_count: active.length,
      total_principal: Math.round(totalPrincipal * 100) / 100,
      total_daily_interest: Math.round(totalDailyInterest * 100) / 100,
      avg_days_floored: avgDaysFloored,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/floor-plan — add vehicle to floor plan                     */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  let body: {
    vehicle_vin?: string;
    vehicle_desc?: string;
    lender?: string;
    principal?: number;
    daily_rate?: number;
    funded_date?: string;
    curtailment_date?: string;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.vehicle_vin || !body.lender || !body.principal || !body.daily_rate || !body.funded_date) {
    return NextResponse.json(
      { error: "vehicle_vin, lender, principal, daily_rate, and funded_date are required" },
      { status: 422 },
    );
  }

  const id = `fp-${Date.now().toString(36)}`;

  // Analytics (fire-and-forget)
  try {
    trackAccounting("accounting.floor_plan_added", authResult.user.dealer_id, {
      lender: body.lender,
      principal: body.principal,
      vin: body.vehicle_vin,
    });
  } catch { /* swallow */ }

  // Database path
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `INSERT INTO floor_plan_lines
         (id, dealer_id, vehicle_vin, vehicle_desc, lender, principal, daily_rate, funded_date, curtailment_date, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [id, authResult.user.dealer_id, body.vehicle_vin, body.vehicle_desc ?? null, body.lender, body.principal, body.daily_rate, body.funded_date, body.curtailment_date ?? null, body.notes ?? null],
      );
      return NextResponse.json({ line: result.rows[0] }, { status: 201 });
    } catch (err) {
      console.error("[api/admin/floor-plan] DB insert error:", err);
      // Fall through to mock
    }
  }

  // Shadow mode response
  const line = {
    id,
    dealer_id: authResult.user.dealer_id,
    vehicle_vin: body.vehicle_vin,
    vehicle_desc: body.vehicle_desc ?? null,
    lender: body.lender,
    principal: body.principal,
    daily_rate: body.daily_rate,
    funded_date: body.funded_date,
    curtailment_date: body.curtailment_date ?? null,
    payoff_date: null,
    interest_accrued: 0,
    fees: 0,
    status: "active",
    notes: body.notes ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return NextResponse.json({ line }, { status: 201 });
}
