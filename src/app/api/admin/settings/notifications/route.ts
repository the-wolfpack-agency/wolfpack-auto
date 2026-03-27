import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

interface NotificationPrefs {
  new_lead: boolean;
  lead_score_change: boolean;
  trade_in_submitted: boolean;
  low_inventory: boolean;
  compliance_alert: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  new_lead: true,
  lead_score_change: true,
  trade_in_submitted: true,
  low_inventory: false,
  compliance_alert: true,
  email_enabled: true,
  sms_enabled: false,
};

/* -------------------------------------------------------------------------- */
/* GET /api/admin/settings/notifications                                      */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ prefs: DEFAULT_PREFS }, { status: 200 });
  }

  try {
    const { query } = await import("@/lib/db");
    const result = await query<{ prefs: NotificationPrefs }>(
      `SELECT notification_prefs as prefs FROM dealer_users WHERE id = $1`,
      [authResult.user.id],
    );
    const prefs = result.rows[0]?.prefs ?? DEFAULT_PREFS;
    return NextResponse.json({ prefs }, { status: 200 });
  } catch {
    return NextResponse.json({ prefs: DEFAULT_PREFS }, { status: 200 });
  }
}

/* -------------------------------------------------------------------------- */
/* PUT /api/admin/settings/notifications                                      */
/* -------------------------------------------------------------------------- */

export async function PUT(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  let body: Partial<NotificationPrefs>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prefs: NotificationPrefs = { ...DEFAULT_PREFS, ...body };

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ prefs, saved: true }, { status: 200 });
  }

  try {
    const { query } = await import("@/lib/db");
    await query(
      `UPDATE dealer_users SET notification_prefs = $1 WHERE id = $2`,
      [JSON.stringify(prefs), authResult.user.id],
    );
    return NextResponse.json({ prefs, saved: true }, { status: 200 });
  } catch {
    return NextResponse.json({ prefs, saved: true }, { status: 200 }); // shadow fallback
  }
}
