import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { joinPool, recomputeVisibilities, type SharePolicy } from "@/lib/inventory-pool";

const schema = z.object({
  dealer_group_id: z.string().min(1),
  share_policy: z.enum(["all", "used_only", "aged_only", "opt_in_per_vehicle"]).default("all"),
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

  const { dealer_group_id, share_policy } = parsed.data;
  const result = await joinPool(dealer_group_id, auth.user.dealer_id, share_policy as SharePolicy);
  // Re-derive visibilities for the group right away so the dealer sees pooled stock.
  await recomputeVisibilities(dealer_group_id).catch(() => {});

  return NextResponse.json({ ok: result.ok, membership_id: result.membership_id });
}
