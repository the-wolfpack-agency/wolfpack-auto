/**
 * POST /api/admin/maintenance-leads/[id]/dismiss
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-guard";
import { trackServerEvent } from "@/lib/analytics";
import { dismissLead } from "@/lib/connected-vehicle";

export const runtime = "nodejs";

const Body = z.object({ reason: z.string().min(1).max(500) });

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true, mode: "shadow" });
  }

  try {
    const lead = await dismissLead(id, parsed.reason);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    try {
      await trackServerEvent("maintenance.lead_dismissed", {
        lead_id: id,
        lead_type: lead.lead_type,
        urgency: lead.urgency,
        reason: parsed.reason,
      });
    } catch {
      /* analytics never blocks */
    }
    return NextResponse.json({ ok: true, lead });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ ok: true, mode: "shadow" });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
