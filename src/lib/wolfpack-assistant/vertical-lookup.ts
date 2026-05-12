/**
 * Vertical lookup — resolves a tenant's vertical from the `tenant_verticals`
 * table (migration 080).
 *
 * The lookup is shaped to be inexpensive — a single indexed PK read — so
 * v1 hits Postgres directly on every request. A Redis cache can be layered
 * later when traffic justifies it; the contract here stays the same.
 *
 * Default policy: when a tenant has no row in `tenant_verticals`, the helper
 * returns `'auto'`. This matches the migration 080 backfill (every existing
 * dealer is treated as auto pre-launch for other verticals) and keeps year-1
 * behavior unchanged for any tenant created before the migration ran.
 *
 * DATABASE_URL unset → returns `'auto'`. Same shadow/test-mode pattern as
 * the rest of the registry.
 */

import type { TenantVertical } from "./types";
import { TENANT_VERTICALS } from "./types";

/** Fallback vertical when nothing else is known about a tenant. */
export const DEFAULT_TENANT_VERTICAL: TenantVertical = "auto";

/**
 * Resolve a tenant's vertical. Returns DEFAULT_TENANT_VERTICAL ('auto') when:
 *   - DATABASE_URL is unset (shadow/test mode), or
 *   - the tenant has no `tenant_verticals` row, or
 *   - the row carries an unknown vertical value.
 *
 * Throws nothing — DB errors fall back to the default so the assistant
 * surface keeps working. (The error is logged.)
 */
export async function getTenantVertical(
  tenantId: string | null | undefined,
): Promise<TenantVertical> {
  if (!tenantId) return DEFAULT_TENANT_VERTICAL;
  if (!process.env.DATABASE_URL) return DEFAULT_TENANT_VERTICAL;
  try {
    const { query } = await import("@/lib/db");
    const result = await query<{ vertical: string }>(
      `SELECT vertical FROM tenant_verticals WHERE tenant_id = $1 LIMIT 1`,
      [tenantId],
    );
    const v = result.rows[0]?.vertical;
    if (v && TENANT_VERTICALS.includes(v as TenantVertical)) {
      return v as TenantVertical;
    }
    return DEFAULT_TENANT_VERTICAL;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[vertical-lookup] getTenantVertical failed:", err);
    return DEFAULT_TENANT_VERTICAL;
  }
}

export interface SetTenantVerticalInput {
  tenant_id: string;
  vertical: TenantVertical;
}

/**
 * Upsert a tenant's vertical. Wolfpack staff only — the route layer is the
 * gate. We always emit an audit log row at the call site because this is a
 * sensitive config change.
 */
export async function setTenantVertical(
  input: SetTenantVerticalInput,
): Promise<TenantVertical> {
  if (!TENANT_VERTICALS.includes(input.vertical)) {
    throw new Error(`unknown vertical: ${input.vertical}`);
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("setTenantVertical requires DATABASE_URL");
  }
  const { query } = await import("@/lib/db");
  await query(
    `INSERT INTO tenant_verticals (tenant_id, vertical)
     VALUES ($1, $2)
     ON CONFLICT (tenant_id) DO UPDATE
       SET vertical = EXCLUDED.vertical,
           updated_at = NOW()`,
    [input.tenant_id, input.vertical],
  );
  return input.vertical;
}
