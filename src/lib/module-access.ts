/**
 * Per-dealer module access — server helpers for the pilot's module gating.
 *
 * Reads/writes `dealers.enabled_modules` (migration 085) and enforces it. The
 * gating DECISION lives in the shared, pure `admin-modules.ts` (`isModuleVisible`)
 * so the sidebar (client) and this guard (server) agree exactly.
 *
 * NULL enabled_modules = all modules (backward compatible). Agency roles bypass;
 * dealer roles (manager/staff/sub_dealer) see only enabled + CORE modules.
 */
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { isModuleVisible } from "@/lib/admin-modules";

/**
 * The dealer's enabled-module allow-list, or null for "all modules".
 * Returns null when the DB is unconfigured (dev/shadow) so the UI degrades to the
 * pre-gating full nav rather than an empty sidebar.
 */
export async function getEnabledModules(dealerId: string): Promise<string[] | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { rows } = await /* audit-safe: A4 reason="dealers.id IS the dealer_id; parameter is from the caller's session, so this reads only the calling tenant's row" */ pool.query(
      `SELECT enabled_modules FROM dealers WHERE id = $1 LIMIT 1`,
      [dealerId],
    );
    const val = rows[0]?.enabled_modules;
    // Postgres TEXT[] comes back as a JS array; NULL -> null (= all modules).
    return Array.isArray(val) ? (val as string[]) : null;
  } catch (err) {
    console.error("[getEnabledModules] Error:", err);
    return null; // Fail open to the full nav rather than lock the dealer out.
  }
}

/**
 * Persist a dealer's enabled-module allow-list. `null` clears the gate (all
 * modules). Caller MUST have already authorized the write (owner/admin).
 */
export async function setEnabledModules(
  dealerId: string,
  modules: string[] | null,
): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const { rowCount } = await /* audit-safe: A4 reason="dealers.id IS the dealer_id; parameter is from the caller's session-resolved tenant, so this writes only the calling tenant's row" */ pool.query(
    `UPDATE dealers SET enabled_modules = $2, updated_at = NOW() WHERE id = $1`,
    [dealerId, modules],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Guard a gated admin page / API by module key. Defense-in-depth on top of the
 * sidebar filter: a dealer who deep-links to a module they don't have enabled gets
 * a 403 (their own tenant's data is still RLS-scoped, so this is an entitlement
 * gate, not a data-isolation boundary). Agency roles always pass.
 *
 * Returns the authenticated user, or a 401/403 NextResponse.
 */
export async function requireModule(moduleKey: string) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { role, dealer_id } = authResult.user;
  const enabled = await getEnabledModules(dealer_id);
  if (!isModuleVisible(role, enabled, moduleKey)) {
    return NextResponse.json(
      { error: "Module not enabled for this dealer" },
      { status: 403 },
    );
  }
  return authResult;
}
