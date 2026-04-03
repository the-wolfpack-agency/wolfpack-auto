import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import {
  getActiveAlerts,
  getAlertStats,
  dismissAlert,
  type AlertAction,
} from "@/lib/engagement-alerts";
import { trackServerEvent } from "@/lib/analytics";

/* -------------------------------------------------------------------------- */
/* GET /api/admin/alerts                                                      */
/*                                                                            */
/* Returns active engagement alerts for the current dealer, sorted by         */
/* priority (critical first). Includes stats for the dashboard widget.        */
/* -------------------------------------------------------------------------- */

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ alerts: [], stats: { total: 0, critical: 0, warning: 0, info: 0 } });
  }

  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  try {
    const [alerts, stats] = await Promise.all([
      getActiveAlerts(dealerId),
      getAlertStats(dealerId),
    ]);

    return NextResponse.json(
      { alerts, stats },
      {
        headers: {
          "Cache-Control": "private, no-cache",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
          "Referrer-Policy": "strict-origin-when-cross-origin",
        },
      },
    );
  } catch (err) {
    console.error("[api/admin/alerts] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to load engagement alerts" },
      { status: 500 },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* PATCH /api/admin/alerts                                                    */
/*                                                                            */
/* Dismiss or action an alert.                                                */
/* Body: { alert_id: string, action: 'dismiss' | 'contacted' | 'scheduled' } */
/* -------------------------------------------------------------------------- */

const VALID_ACTIONS = new Set<AlertAction>(["dismiss", "contacted", "scheduled"]);

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  let body: { alert_id?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { alert_id, action } = body;

  if (!alert_id || typeof alert_id !== "string") {
    return NextResponse.json(
      { error: "alert_id is required" },
      { status: 400 },
    );
  }

  if (!action || !VALID_ACTIONS.has(action as AlertAction)) {
    return NextResponse.json(
      { error: "action must be one of: dismiss, contacted, scheduled" },
      { status: 400 },
    );
  }

  try {
    await dismissAlert(alert_id, dealerId, action as AlertAction);

    // Track the alert action for the learning system
    trackServerEvent("system.alert_actioned", {
      alert_id,
      action,
      dealer_id: dealerId,
    });

    return NextResponse.json({ success: true, alert_id, action });
  } catch (err) {
    console.error("[api/admin/alerts] Dismiss error:", err);
    return NextResponse.json(
      { error: "Failed to update alert" },
      { status: 500 },
    );
  }
}
