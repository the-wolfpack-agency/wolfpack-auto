/**
 * Optimistic locking helper for concurrent write safety.
 *
 * Pattern: the client sends `updated_at` in the PATCH body. The UPDATE query
 * includes `AND updated_at = $expectedUpdatedAt`. If 0 rows affected, the
 * resource was modified by another user and we return 409 Conflict.
 *
 * This prevents lost updates when two users edit the same deal, appointment,
 * or repair order simultaneously.
 */

/* -------------------------------------------------------------------------- */
/* Error class                                                                */
/* -------------------------------------------------------------------------- */

export class ConcurrentModificationError extends Error {
  constructor(resource: string) {
    super(
      `${resource} was modified by another user. Please refresh and try again.`,
    );
    this.name = "ConcurrentModificationError";
  }
}

/* -------------------------------------------------------------------------- */
/* Query builder                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Append an optimistic lock clause to an UPDATE query.
 *
 * @param baseQuery - The UPDATE ... SET ... WHERE ... query
 * @param paramIndex - The next `$N` parameter index to use
 * @param expectedUpdatedAt - The `updated_at` timestamp the client expects
 * @returns { query, params } with the lock clause appended
 *
 * @example
 * ```ts
 * const base = `UPDATE deals SET status = $1 WHERE id = $2 AND dealer_id = $3`;
 * const locked = withOptimisticLock(base, 4, body.updated_at);
 * // locked.query = `UPDATE deals SET status = $1 WHERE id = $2 AND dealer_id = $3 AND updated_at = $4`
 * // locked.params = [body.updated_at]
 * ```
 */
export function withOptimisticLock(
  baseQuery: string,
  paramIndex: number,
  expectedUpdatedAt: string,
): { query: string; params: unknown[] } {
  return {
    query: `${baseQuery} AND updated_at = $${paramIndex}`,
    params: [expectedUpdatedAt],
  };
}

/**
 * Check the result of an optimistic-locked UPDATE and throw if the row
 * was modified by another user (0 rows affected).
 */
export function assertNotStale(
  rowCount: number | null,
  resource: string,
): void {
  if (rowCount === 0) {
    throw new ConcurrentModificationError(resource);
  }
}
