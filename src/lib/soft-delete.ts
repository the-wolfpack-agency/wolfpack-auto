/**
 * Soft-delete helper — marks records as deleted instead of removing them.
 * Adds deleted_at timestamp for audit trail and potential recovery.
 *
 * Usage:
 *   const q = softDeleteQuery("leads", leadId, dealerId);
 *   await query(q.text, q.params);
 */

export function softDeleteQuery(
  table: string,
  id: string,
  dealerId: string,
): { text: string; params: unknown[] } {
  // Whitelist of tables that support soft delete to prevent SQL injection
  const ALLOWED_TABLES = new Set([
    "leads",
    "vehicles",
    "deal_worksheets",
    "deals",
    "service_appointments",
    "repair_orders",
    "reviews",
    "documents",
    "message_templates",
    "follow_up_sequences",
    "webhooks",
    "sales_log",
  ]);

  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`soft-delete: table "${table}" is not in the allow-list`);
  }

  return {
    text: `UPDATE ${table} SET deleted_at = NOW() WHERE id = $1 AND dealer_id = $2 AND deleted_at IS NULL`,
    params: [id, dealerId],
  };
}

/**
 * Filter clause to exclude soft-deleted rows.
 * Append to WHERE conditions in SELECT queries.
 */
export const NOT_DELETED = "deleted_at IS NULL";
