/**
 * Safe database query wrapper.
 *
 * Catches "relation does not exist" errors (missing tables) and returns
 * empty results instead of crashing. This allows new features to deploy
 * before their database migrations have run.
 *
 * Usage:
 *   import { safeQuery } from "@/lib/safe-query";
 *   const rows = await safeQuery("SELECT * FROM my_table WHERE dealer_id = $1", [dealerId]);
 *   // Returns [] if the table doesn't exist yet
 */

export async function safeQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  try {
    const { query } = await import("@/lib/db");
    const result = await query<T>(sql, params);
    return result.rows;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("does not exist") || msg.includes("relation")) {
      console.warn(`[safe-query] Table not found, returning empty: ${msg.slice(0, 100)}`);
      return [];
    }
    throw err;
  }
}
