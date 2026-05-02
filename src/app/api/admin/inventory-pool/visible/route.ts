import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { searchPool } from "@/lib/inventory-pool";

const DEMO_VISIBLE = [
  { vin: "1HGCV1F34LA999001", year: 2022, make: "Honda", model: "Accord",
    owning_dealer_id: "demo-sister-1", price: 23_500, days_on_lot: 42 },
  { vin: "5TFDY5F10LX999002", year: 2021, make: "Toyota", model: "Tundra",
    owning_dealer_id: "demo-sister-2", price: 38_900, days_on_lot: 18 },
];

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ inventory: DEMO_VISIBLE });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? undefined;

  try {
    const rows = await searchPool(auth.user.dealer_id, q);
    return NextResponse.json({ inventory: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ inventory: DEMO_VISIBLE });
    }
    console.error("[inventory-pool/visible] error:", err);
    return NextResponse.json({ error: "Failed to load pooled inventory" }, { status: 500 });
  }
}
