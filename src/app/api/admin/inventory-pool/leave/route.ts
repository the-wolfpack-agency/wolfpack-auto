import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { leavePool } from "@/lib/inventory-pool";

const schema = z.object({ dealer_group_id: z.string().min(1) });

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  const result = await leavePool(parsed.data.dealer_group_id, auth.user.dealer_id);
  return NextResponse.json({ ok: result.ok });
}
