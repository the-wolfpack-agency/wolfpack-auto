/**
 * GET /api/admin/payments/reconciliation — Daily payment reconciliation
 *
 * Query params:
 *   date: YYYY-MM-DD (defaults to today)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackPayment } from "@/lib/analytics-hooks";
import { buildReconciliation, type PaymentType, type PaymentStatus } from "@/lib/stripe-payments";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const date = request.nextUrl.searchParams.get("date") ?? new Date().toISOString().split("T")[0];

  let transactions: {
    amount: number;
    status: PaymentStatus;
    payment_type: PaymentType;
    payment_method: string;
    platform_fee: number;
    stripe_fee: number;
    refund_amount?: number;
  }[] = [];

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const { rows } = await query(
        `SELECT amount, status, payment_type, payment_method,
                platform_fee, stripe_fee
         FROM payment_transactions
         WHERE dealer_id = $1 AND created_at::date = $2::date`,
        [dealerId, date],
      );
      transactions = rows.map((r: Record<string, unknown>) => ({
        amount: Number(r.amount) || 0,
        status: r.status as PaymentStatus,
        payment_type: r.payment_type as PaymentType,
        payment_method: (r.payment_method as string) ?? "card",
        platform_fee: Number(r.platform_fee) || 0,
        stripe_fee: Number(r.stripe_fee) || 0,
      }));
    } catch (err) {
      console.error("[api/payments/reconciliation] DB error:", err);
    }
  }

  const summary = buildReconciliation(transactions, date);

  trackPayment("payment.reconciled", dealerId, {
    date,
    total_transactions: summary.total_transactions,
    net_amount: summary.net_amount,
  });

  return NextResponse.json(summary);
}
