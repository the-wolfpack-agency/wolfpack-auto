// GET: return the current dealer's billing/subscription status
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackSystem } from "@/lib/analytics-hooks";

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      subscription_status: "trial",
      subscription_plan: "starter",
      trial_ends_at: null,
      stripe_customer_id: null,
      billing_email: null,
    });
  }

  const dealerId = authResult.user.dealer_id;

  try {
    const { rows } = await pool.query( /* audit-safe: A4 reason="lookup-by-dealer-pk-from-session-bound dealer_id" */
      `SELECT
         subscription_status,
         subscription_plan,
         trial_ends_at,
         stripe_customer_id,
         billing_email
       FROM dealers
       WHERE id = $1`,
      [dealerId]
    );

    if (!rows.length) {
      return NextResponse.json({ subscription_status: "unknown" });
    }

    trackSystem("system.settings_updated", dealerId, { module: "billing" });
    return NextResponse.json(rows[0]);
  } catch {
    // Migration 005 not yet applied — return a safe trial default
    return NextResponse.json({
      subscription_status: "trial",
      subscription_plan: "starter",
      trial_ends_at: null,
      stripe_customer_id: null,
      billing_email: null,
    });
  }
}
