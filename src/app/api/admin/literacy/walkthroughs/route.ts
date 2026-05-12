/**
 * GET  /api/admin/literacy/walkthroughs — list curated walkthroughs (any staff role)
 * POST /api/admin/literacy/walkthroughs — create a walkthrough (operator+)
 *
 * Walkthroughs are agency-shared curated content (migration 076). The
 * write gate is `requireWolfpackStaff` — a dealer session, even an "admin"
 * dealer, gets 401.
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
import {
  createWalkthrough,
  listWalkthroughs,
} from "@/lib/literacy-walkthroughs";
import type { CreateWalkthroughInput } from "@/lib/literacy-walkthroughs";

const ONTOLOGY_AUDIT_KEY = "wolfpack-ontology";

export async function GET(request: NextRequest) {
  const auth = await requireWolfpackStaff(request);
  if (!isWolfpackStaff(auth)) return auth;

  const url = request.nextUrl;
  const role = (url.searchParams.get("role") ?? undefined) as
    | LiteracyRole
    | undefined;
  const surface = url.searchParams.get("surface") ?? undefined;
  const activeParam = url.searchParams.get("active");
  const active =
    activeParam === null || activeParam === undefined
      ? undefined
      : activeParam === "true";
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  try {
    const walkthroughs = await listWalkthroughs({ role, surface, active, limit });
    return NextResponse.json({ walkthroughs });
  } catch (err) {
    console.error("[literacy/walkthroughs] GET error:", err);
    return NextResponse.json({ walkthroughs: [] });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireWolfpackStaff(request, "operator");
  if (!isWolfpackStaff(auth)) return auth;

  let body: Partial<CreateWalkthroughInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.slug || !body.name || !body.role || !body.steps) {
    return NextResponse.json(
      { error: "slug, name, role, steps are required" },
      { status: 400 },
    );
  }

  try {
    const walkthrough = await createWalkthrough(body as CreateWalkthroughInput);

    trackLiteracy("literacy.walkthrough_created", ONTOLOGY_AUDIT_KEY, {
      walkthrough_id: walkthrough.id,
      slug: walkthrough.slug,
      role: walkthrough.role,
      surface: walkthrough.surface ?? "",
      source: walkthrough.source,
      step_count: walkthrough.steps.length,
      staff_id: auth.staff.id,
    });

    await logStaffAction({
      staffId: auth.staff.id,
      action: "literacy.walkthrough_created",
      targetType: "literacy_walkthrough",
      targetId: walkthrough.id,
      metadata: {
        slug: walkthrough.slug,
        role: walkthrough.role,
        surface: walkthrough.surface,
        source: walkthrough.source,
        step_count: walkthrough.steps.length,
      },
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ walkthrough }, { status: 201 });
  } catch (err) {
    if (err instanceof LiteracyValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 },
      );
    }
    console.error("[literacy/walkthroughs] POST error:", err);
    return NextResponse.json(
      { error: "Failed to create walkthrough" },
      { status: 500 },
    );
  }
}
