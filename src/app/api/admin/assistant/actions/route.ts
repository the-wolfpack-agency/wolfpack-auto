/**
 * GET /api/admin/assistant/actions
 *
 * List the registered assistant actions available to the current dealer
 * user. Filtered by the caller's role + (optionally) by category +
 * side_effect. The conversational layer (year-one Q3-Q4) will use this
 * endpoint to populate its action allowlist before mapping prompts.
 *
 * Dealer users get the subset of actions whose allowed_roles contains
 * their role (or "any"). Wolfpack staff get the full set so they can
 * curate.
 *
 * Emits `assistant.action_listed` for the learning loop.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackAssistant } from "@/lib/analytics-hooks";
import {
  getTenantVertical,
  listActions,
  type AssistantCategory,
  type AssistantRole,
  type AssistantSideEffect,
} from "@/lib/wolfpack-assistant";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;

  if (!process.env.DATABASE_URL) {
    // Shadow mode (no database): degrade gracefully instead of crashing.
    return NextResponse.json(
      { actions: [], count: 0, role: null, vertical: null },
      { status: 200 },
    );
  }

  const url = request.nextUrl;
  const category = (url.searchParams.get("category") ?? undefined) as
    | AssistantCategory
    | undefined;
  const sideEffect = (url.searchParams.get("side_effect") ?? undefined) as
    | AssistantSideEffect
    | undefined;
  const includeInactive = url.searchParams.get("include_inactive") === "true";

  // Dealer-side roles drive the allowlist filter.
  const role = (auth.user.role ?? "admin") as AssistantRole;

  // Resolve the tenant's vertical (defaults to 'auto' pre-launch). Returns
  // the action subset where vertical = tenant_vertical OR vertical = 'any'.
  const tenantVertical = await getTenantVertical(auth.user.dealer_id);

  try {
    const actions = await listActions({
      category,
      side_effect: sideEffect,
      active_only: !includeInactive,
      role,
      vertical: tenantVertical,
      limit: 500,
    });
    try {
      trackAssistant("assistant.action_listed", auth.user.dealer_id, {
        role,
        category: category ?? "",
        side_effect: sideEffect ?? "",
        vertical: tenantVertical,
        result_count: actions.length,
      });
    } catch { /* analytics must never block */ }

    return NextResponse.json({
      actions,
      count: actions.length,
      role,
      vertical: tenantVertical,
    });
  } catch (err) {
    console.error("[assistant/actions] GET error:", err);
    return NextResponse.json({ actions: [], count: 0, role, vertical: tenantVertical });
  }
}
