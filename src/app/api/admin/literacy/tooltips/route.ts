/**
 * GET  /api/admin/literacy/tooltips — list curated tooltips (any staff role)
 * POST /api/admin/literacy/tooltips — create a tooltip (operator+)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireWolfpackStaff,
  isWolfpackStaff,
  getRequestIp,
} from "@/lib/operator-auth";
import { logStaffAction } from "@/lib/wolfpack-staff-audit";
import { trackLiteracy } from "@/lib/analytics-hooks";
import { LiteracyValidationError } from "@/lib/literacy-ontology";
import type { LiteracyRole } from "@/lib/literacy-ontology";
import { createTooltip, listTooltips } from "@/lib/literacy-walkthroughs";
import type { CreateTooltipInput } from "@/lib/literacy-walkthroughs";

const ONTOLOGY_AUDIT_KEY = "wolfpack-ontology";

export async function GET(request: NextRequest) {
  const auth = await requireWolfpackStaff(request);
  if (!isWolfpackStaff(auth)) return auth;

  if (!process.env.DATABASE_URL) {
    // Shadow mode (no database): degrade gracefully instead of crashing.
    return NextResponse.json({ tooltips: [] }, { status: 200 });
  }

  const url = request.nextUrl;
  const concept_id = url.searchParams.get("concept_id") ?? undefined;
  const role = (url.searchParams.get("role") ?? undefined) as
    | LiteracyRole
    | undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  try {
    const tooltips = await listTooltips({ concept_id, role, limit });
    return NextResponse.json({ tooltips });
  } catch (err) {
    console.error("[literacy/tooltips] GET error:", err);
    return NextResponse.json({ tooltips: [] });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireWolfpackStaff(request, "operator");
  if (!isWolfpackStaff(auth)) return auth;

  if (!process.env.DATABASE_URL) {
    // Shadow mode (no database): degrade gracefully instead of crashing.
    return NextResponse.json(
      { error: "service_unavailable", shadow: true },
      { status: 503 },
    );
  }

  let body: Partial<CreateTooltipInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.concept_id || !body.role || !body.short_text) {
    return NextResponse.json(
      { error: "concept_id, role, short_text are required" },
      { status: 400 },
    );
  }

  try {
    const tooltip = await createTooltip(body as CreateTooltipInput);

    trackLiteracy("literacy.tooltip_created", ONTOLOGY_AUDIT_KEY, {
      tooltip_id: tooltip.id,
      concept_id: tooltip.concept_id,
      role: tooltip.role,
      source: tooltip.source,
      staff_id: auth.staff.id,
    });

    await logStaffAction({
      staffId: auth.staff.id,
      action: "literacy.tooltip_created",
      targetType: "literacy_tooltip",
      targetId: tooltip.id,
      metadata: {
        concept_id: tooltip.concept_id,
        role: tooltip.role,
        source: tooltip.source,
      },
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ tooltip }, { status: 201 });
  } catch (err) {
    if (err instanceof LiteracyValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 },
      );
    }
    console.error("[literacy/tooltips] POST error:", err);
    return NextResponse.json(
      { error: "Failed to create tooltip" },
      { status: 500 },
    );
  }
}
