import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { requestReservation, listIncomingReservations, listOutgoingReservations } from "@/lib/inventory-pool";

const schema = z.object({
  vin: z.string().min(11),
  owning_dealer_id: z.string().min(1),
  customer_id: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;

  // Shadow-mode guard — sibling admin routes return 503 when DATABASE_URL is
  // unset so dev/preview deployments don't masquerade real writes. Required
  // by AVAIL-001 (security-regressions.test.ts).
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  const result = await requestReservation({
    vin: parsed.data.vin,
    requestingDealerId: auth.user.dealer_id,
    owningDealerId: parsed.data.owning_dealer_id,
    customerId: parsed.data.customer_id,
    notes: parsed.data.notes,
  });
  return NextResponse.json({ ok: result.ok, reservation_id: result.reservation_id });
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;
  const dealerId = auth.user.dealer_id;

  const url = new URL(request.url);
  const direction = url.searchParams.get("direction");
  if (direction === "incoming") {
    return NextResponse.json({ reservations: await listIncomingReservations(dealerId) });
  }
  if (direction === "outgoing") {
    return NextResponse.json({ reservations: await listOutgoingReservations(dealerId) });
  }
  // default: both
  const [incoming, outgoing] = await Promise.all([
    listIncomingReservations(dealerId),
    listOutgoingReservations(dealerId),
  ]);
  return NextResponse.json({ incoming, outgoing });
}
