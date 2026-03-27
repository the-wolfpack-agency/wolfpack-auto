import { NextResponse } from "next/server";
import Stripe from "stripe";
import { pool } from "@/lib/db";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

// Must use Node.js runtime — Stripe needs raw body + crypto APIs
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const body = await request.text();
  const sig = request.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await pool.query(
          `UPDATE dealers SET
            stripe_subscription_id = $1,
            subscription_status = $2,
            subscription_plan = $3,
            updated_at = NOW()
           WHERE stripe_customer_id = $4`,
          [sub.id, sub.status, (sub.metadata?.plan ?? "starter"), sub.customer]
        );
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await pool.query(
          `UPDATE dealers SET subscription_status = 'canceled', updated_at = NOW() WHERE stripe_customer_id = $1`,
          [sub.customer]
        );
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        await pool.query(
          `UPDATE dealers SET subscription_status = 'past_due', updated_at = NOW() WHERE stripe_customer_id = $1`,
          [inv.customer]
        );
        break;
      }
    }
  } catch (err) {
    console.error("[stripe webhook] DB update failed:", err);
    // Still return 200 so Stripe doesn't retry on transient DB errors
  }

  return NextResponse.json({ received: true });
}
