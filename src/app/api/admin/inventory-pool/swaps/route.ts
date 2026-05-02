import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { listSwapProposals, proposeSwaps } from "@/lib/inventory-pool";

const DEMO_SWAPS = [
  {
    id: "demo-swap-1",
    dealer_group_id: "demo-group",
    vin_a: "1HGCV1F34LA000900",
    dealer_a_id: "demo-rooftop-a",
    vin_b: "5TFDY5F10LX000901",
    dealer_b_id: "demo-rooftop-b",
    rationale: "Aged 2021 Honda Accord on rooftop A; rooftop B had 6 recent matching leads with no stock.",
    expected_velocity_lift: 30,
    status: "proposed" as const,
    created_at: new Date().toISOString(),
  },
];

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;

  const url = new URL(request.url);
  const groupId = url.searchParams.get("dealer_group_id");
  if (!groupId) return NextResponse.json({ error: "dealer_group_id required" }, { status: 400 });

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ swaps: DEMO_SWAPS });
  }

  try {
    const rows = await listSwapProposals(groupId);
    return NextResponse.json({ swaps: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) return NextResponse.json({ swaps: DEMO_SWAPS });
    console.error("[inventory-pool/swaps] error:", err);
    return NextResponse.json({ error: "Failed to load swaps" }, { status: 500 });
  }
}

const proposeSchema = z.object({ dealer_group_id: z.string().min(1) });

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = proposeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const result = await proposeSwaps(parsed.data.dealer_group_id);
  return NextResponse.json(result);
}
