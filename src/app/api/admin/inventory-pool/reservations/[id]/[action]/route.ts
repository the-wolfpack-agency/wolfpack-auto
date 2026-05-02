import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { actOnReservation, type ReservationAction } from "@/lib/inventory-pool";

const ALLOWED: ReservationAction[] = ["approve", "reject", "fulfill"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;
  const { id, action } = await params;

  if (!id) return NextResponse.json({ error: "Reservation id required" }, { status: 400 });
  if (!ALLOWED.includes(action as ReservationAction)) {
    return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
  }

  let body: { reason?: string } = {};
  try { body = (await request.json()) as { reason?: string }; } catch { /* body optional */ }

  const result = await actOnReservation(id, auth.user.dealer_id, action as ReservationAction, body.reason);
  if (!result.ok && process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Reservation not found or not authorized" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, status: result.status });
}
