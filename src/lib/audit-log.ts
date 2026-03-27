/**
 * Simple audit logging for PII access and data mutations.
 *
 * Writes to an `audit_logs` table in PostgreSQL. Auto-creates the table
 * on first use. All calls are fire-and-forget — failures are caught
 * silently so they never block the request path.
 */

let migrationDone = false;

/**
 * Ensure the audit_logs table exists. Runs once per process lifetime.
 */
async function ensureTable(): Promise<void> {
  if (migrationDone) return;

  try {
    const { query } = await import("@/lib/db");
    await query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id            BIGSERIAL PRIMARY KEY,
        timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        action        TEXT        NOT NULL,
        details       JSONB       NOT NULL DEFAULT '{}',
        user_id       TEXT,
        dealer_id     TEXT,
        ip_address    TEXT
      )
    `);
    migrationDone = true;
  } catch (err) {
    // Swallow — table may already exist or DB may be unavailable
    console.error("[audit-log] Migration check failed:", err);
  }
}

/**
 * Record an auditable action.
 *
 * This function is intentionally non-blocking. Callers should invoke it
 * with `void auditLog(...)` so it does not delay the HTTP response.
 *
 * @param action    - e.g. 'lead.create', 'vehicle.update', 'data.export'
 * @param details   - arbitrary JSONB payload
 * @param userId    - authenticated user ID (if known)
 * @param dealerId  - scoping dealer
 * @param ipAddress - request IP (if available)
 */
export async function auditLog(
  action: string,
  details: Record<string, unknown>,
  userId?: string,
  dealerId?: string,
  ipAddress?: string,
): Promise<void> {
  // Skip entirely if no DATABASE_URL
  if (!process.env.DATABASE_URL) return;

  try {
    await ensureTable();
    const { query } = await import("@/lib/db");
    await query(
      `INSERT INTO audit_logs (action, details, user_id, dealer_id, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        action,
        JSON.stringify(details),
        userId ?? null,
        dealerId ?? null,
        ipAddress ?? null,
      ],
    );
  } catch (err) {
    // Never throw — audit logging must not break the request
    console.error("[audit-log] Write failed:", err);
  }
}
