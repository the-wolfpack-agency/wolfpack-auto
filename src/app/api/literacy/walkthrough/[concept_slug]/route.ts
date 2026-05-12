/**
 * GET /api/literacy/walkthrough/[concept_slug]
 *
 * Public-side walkthrough fetch for any authenticated dealer-side user.
 *
 * Returns the active walkthrough (steps + metadata) that matches the
 * caller's session role, falling back to role='any' when no role-specific
 * walkthrough exists. The body shape matches what `<Walkthrough>`
 * consumes — the component decides whether to auto-trigger based on
 * `trigger_condition`.
 *
 * Role-awareness: the role is derived from the session (`session.user.role`
 * for dealer users; falls back to `any` for users without a literacy-aware
 * role mapping). The endpoint never trusts a query-string role; that
 * decision must come from the server-side session.
 *
 * Per-dealer outcome rows are written by the component via the existing
 * literacy_outcomes table — this route does not write outcomes itself
 * (separating fetch + outcome write keeps the GET cacheable in future).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackLiteracy } from "@/lib/analytics-hooks";
import { getWalkthroughForRole } from "@/lib/literacy-walkthroughs";
import type { LiteracyRole } from "@/lib/literacy-ontology";
import { LITERACY_ROLES } from "@/lib/literacy-ontology";

/**
 * Map a dealer-side user role (owner/admin/manager/staff) to the literacy
 * ontology's audience role. Today the mapping is coarse; the literacy
 * authoring tool exposes the full 9-role taxonomy when staff curate
 * content.
 */
function resolveLiteracyRole(userRole: string | undefined): LiteracyRole {
  if (!userRole) return "any";
  if (LITERACY_ROLES.includes(userRole as LiteracyRole)) {
    return userRole as LiteracyRole;
  }
  switch (userRole) {
    case "owner":
    case "admin":
      return "gm";
    case "manager":
      return "gm";
    case "staff":
      return "salesperson";
    default:
      return "any";
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ concept_slug: string }> },
) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;

  const params = await Promise.resolve(context.params);
  const slug = params.concept_slug;
  if (!slug || typeof slug !== "string" || slug.length === 0) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const role = resolveLiteracyRole(auth.user.role);

  try {
    const walkthrough = await getWalkthroughForRole(slug, role);
    if (!walkthrough) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Fire-and-forget analytics — never block the response.
    trackLiteracy("walkthrough.viewed", auth.user.dealer_id, {
      walkthrough_id: walkthrough.id,
      slug: walkthrough.slug,
      role,
      surface: walkthrough.surface ?? "",
      step_count: walkthrough.steps.length,
      user_id: auth.user.id,
    });

    return NextResponse.json({ walkthrough, resolved_role: role });
  } catch (err) {
    console.error("[literacy/walkthrough/[concept_slug]] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load walkthrough" },
      { status: 500 },
    );
  }
}
