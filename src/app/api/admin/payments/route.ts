/**
 * GET  /api/admin/payments — List payment transactions
 * POST /api/admin/payments — Create a payment (via Stripe Connect)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackPayment } from "@/lib/analytics-hooks";
import { createPayment, calculateFees, isStripeConfigured, getStripeStatus } from "@/lib/stripe-payments";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const { searchParams } = request.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50") || 50, 200);
  const status = searchParams.get("status");

  let transactions: Record<string, unknown>[] = [];
  let total = 0;

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const statusFilter = status ? "AND status = $3" : "";
      const params: unknown[] = [dealerId, limit];
      if (status) params.push(status);

      const { rows } = await query(
        `SELECT * FROM payment_transactions
         WHERE dealer_id = $1 ${statusFilter}
         ORDER BY created_at DESC LIMIT $2`,
        params,
      );
      transactions = rows;

      const { rows: countRows } = await query(
        `SELECT COUNT(*) as total FROM payment_transactions WHERE dealer_id = $1`,
        [dealerId],
      );
      total = Number(countRows[0]?.total) || 0;
    } catch (err) {
      console.error("[api/payments] GET error:", err);
    }
  }

  return NextResponse.json({
    transactions,
    total,
    stripe: getStripeStatus(),
  });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  let body: {
    amount?: number;
    payment_type?: string;
    source_type?: string;
    source_id?: string;
    customer_name?: string;
    customer_email?: string;
    description?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.amount || body.amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive number (in cents)" }, { status: 400 });
  }

  // Get dealer's Stripe account
  let stripeAccountId = "";
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const { rows } = await query(
        `SELECT stripe_account_id FROM dealer_stripe_accounts
         WHERE dealer_id = $1 AND status = 'active' LIMIT 1`,
        [dealerId],
      );
      stripeAccountId = rows[0]?.stripe_account_id ?? "";
    } catch (err) {
      console.error("[api/payments] DB error:", err);
    }
  }

  if (!stripeAccountId && isStripeConfigured()) {
    return NextResponse.json(
      { error: "No Stripe Connect account found. Complete onboarding first." },
      { status: 400 },
    );
  }

  const fees = calculateFees(body.amount);
  const result = await createPayment({
    dealer_stripe_account_id: stripeAccountId || "shadow_account",
    amount: body.amount,
    payment_type: (body.payment_type as any) ?? "deal",
    source_type: body.source_type,
    source_id: body.source_id,
    customer_name: body.customer_name,
    customer_email: body.customer_email,
    description: body.description,
  });

  // Save to DB
  if (process.env.DATABASE_URL && result) {
    try {
      const { query } = await import("@/lib/db");
      await query(
        `INSERT INTO payment_transactions
           (dealer_id, stripe_payment_intent_id, stripe_account_id,
            payment_type, source_type, source_id,
            customer_name, customer_email,
            amount, platform_fee, stripe_fee, net_amount,
            status, description)
         VALUES ($1, $2, $3, $4, $5, $6::uuid, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          dealerId, result.payment_intent_id, stripeAccountId || "shadow",
          body.payment_type ?? "deal", body.source_type ?? null, body.source_id ?? null,
          body.customer_name ?? null, body.customer_email ?? null,
          body.amount, result.platform_fee, result.stripe_fee_estimate, result.net_amount,
          result.status, body.description ?? "",
        ],
      );
    } catch (err) {
      console.error("[api/payments] DB save error:", err);
    }
  }

  trackPayment("payment.created", dealerId, {
    amount: body.amount,
    payment_type: body.payment_type ?? "deal",
    status: result?.status ?? "failed",
    platform_fee: fees.platform_fee,
  });

  return NextResponse.json(result);
}
