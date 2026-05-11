/**
 * Append-only audit log for Wolfpack staff actions.
 *
 * Writes to wolfpack_staff_audit_log (migration 064). The row is immutable
 * once written — no UPDATE / DELETE paths exist on this side of the code.
 *
 * Every mutating operator route MUST call `logStaffAction(...)` before
 * returning. Failure to write the audit row is logged but never blocks
 * the response.
 */

export interface StaffAuditEntry {
  staffId: string;
  action: string;
  targetType?: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Append a single audit row. Fire-and-forget at the call site.
 *
 * Returns the inserted row id when DATABASE_URL is set, or `null` when
 * running without a database (tests / shadow mode).
 */
export async function logStaffAction(entry: StaffAuditEntry): Promise<number | null> {
  if (!process.env.DATABASE_URL) {
    // Local / test mode — log to console so it is visible in CI output.
    console.log(
      `[wolfpack-staff-audit] (no DB) staff=${entry.staffId} action=${entry.action} target=${entry.targetType ?? "-"}:${entry.targetId ?? "-"}`,
    );
    return null;
  }

  try {
    const { query } = await import("@/lib/db");
    const result = await query<{ id: number }>(
      `INSERT INTO wolfpack_staff_audit_log
         (staff_id, action, target_type, target_id, metadata, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        entry.staffId,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        JSON.stringify(entry.metadata ?? {}),
        entry.ipAddress ?? null,
        entry.userAgent ?? null,
      ],
    );
    return result.rows[0]?.id ?? null;
  } catch (err) {
    // Audit failures must never break the request.
    console.error("[wolfpack-staff-audit] Insert failed:", err);
    return null;
  }
}
