/**
 * GET /api/admin/modules — the current dealer's enabled-module allow-list + the
 *   caller's role + the full catalog. The sidebar reads this to filter the nav.
 * PUT /api/admin/modules — set the current dealer's allow-list. Owner/admin only
 *   (the agency scales a pilot dealer up/down from here — no redeploy).
 *
 * `enabled: null` means "all modules" (the pre-gating default). Gating decisions
 * live in src/lib/admin-modules.ts so client + server agree exactly.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, isAuthenticated } from "@/lib/auth-guard";
import { getEnabledModules, setEnabledModules } from "@/lib/module-access";
import { ALL_MODULE_KEYS, isKnownModuleKey } from "@/lib/admin-modules";
import { auditLog } from "@/lib/audit-log";
import { trackSystem } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* GET                                                                        */
/* -------------------------------------------------------------------------- */

export async function GET(_req: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { role, dealer_id } = authResult.user;
  const enabled = await getEnabledModules(dealer_id);

  return NextResponse.json({
    role,
    enabled, // string[] of module keys, or null = all modules
    all_keys: ALL_MODULE_KEYS,
  });
}

/* -------------------------------------------------------------------------- */
/* PUT                                                                        */
/* -------------------------------------------------------------------------- */

export async function PUT(req: NextRequest) {
  // Only agency admins scale a dealer's modules up or down.
  const authResult = await requireRole(["owner", "admin"]);
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = authResult.user.dealer_id;

  let body: { modules?: unknown };
  try {
    body = (await req.json()) as { modules?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body.modules;

  // null => clear the gate (all modules enabled).
  let modules: string[] | null;
  if (raw === null) {
    modules = null;
  } else if (Array.isArray(raw)) {
    if (!raw.every((k) => typeof k === "string")) {
      return NextResponse.json(
        { error: "modules must be an array of string keys or null" },
        { status: 400 },
      );
    }
    // De-dup + reject unknown keys so a typo can't silently disable everything.
    const unique = Array.from(new Set(raw as string[]));
    const unknown = unique.filter((k) => !isKnownModuleKey(k));
    if (unknown.length > 0) {
      return NextResponse.json(
        { error: `Unknown module keys: ${unknown.join(", ")}` },
        { status: 400 },
      );
    }
    modules = unique;
  } else {
    return NextResponse.json(
      { error: "modules must be an array of string keys or null" },
      { status: 400 },
    );
  }

  if (!process.env.DATABASE_URL) {
    // Dev/shadow: nothing to persist, but honor the contract shape.
    return NextResponse.json({ enabled: modules, updated: true });
  }

  const ok = await setEnabledModules(dealerId, modules);
  if (!ok) {
    return NextResponse.json({ error: "Dealer not found" }, { status: 404 });
  }

  void auditLog("dealer.modules.update", {
    dealer_id: dealerId,
    count: modules === null ? "all" : modules.length,
  }).catch(() => {});

  try {
    trackSystem("system.modules_updated", dealerId, {
      count: modules === null ? -1 : modules.length,
      cleared: modules === null,
    });
  } catch {
    /* analytics must never block */
  }

  return NextResponse.json({ enabled: modules, updated: true });
}
