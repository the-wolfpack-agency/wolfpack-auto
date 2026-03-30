import { Pool, type PoolConfig } from "pg";

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  // Neon serverless: keep pool small to avoid exhausting connection slots.
  // Neon's pooler handles multiplexing — local pool is just a buffer.
  max: 12,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // 10s query timeout — prevents hung queries from monopolizing the pool.
  // Applied at the connection level so it works without explicit transactions.
  statement_timeout: 10_000,
  // SSL: Neon requires SSL. The connection string already includes sslmode=require.
  // Use rejectUnauthorized: false with Neon's pooler (uses pgBouncer which
  // presents its own cert, not the origin server's). Safe because the
  // connection string forces TLS at the transport level.
  ssl: process.env.DATABASE_URL?.includes("neon")
    ? { rejectUnauthorized: false }
    : process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: true }
      : undefined,
};

/**
 * Singleton PostgreSQL connection pool.
 *
 * In development, the pool is attached to `globalThis` so it survives
 * Next.js hot-module reloads without leaking connections.
 */
function createPool(): Pool {
  const globalForPg = globalThis as unknown as { __pgPool?: Pool };

  if (!globalForPg.__pgPool) {
    globalForPg.__pgPool = new Pool(poolConfig);

    globalForPg.__pgPool.on("error", (err) => {
      // Log error message only — never log the full error object
      // which may contain connection strings or credentials
      console.error("[db] Unexpected pool error:", err.message);
    });
  }

  return globalForPg.__pgPool;
}

export const pool = createPool();

/**
 * Convenience: run a single parameterised query.
 *
 * The 10s statement_timeout is set at the pool level (poolConfig.statement_timeout)
 * so every query is automatically bounded. No manual connect/release needed —
 * pool.query() handles connection lifecycle internally and won't leak clients
 * on connection drops (fixes "Connection terminated unexpectedly" crashes).
 */
export async function query<T extends Record<string, any>>(
  text: string,
  params?: unknown[],
) {
  const result = await pool.query<T>(text, params);
  return result;
}

/**
 * Safe query wrapper that respects the circuit breaker.
 *
 * When the DB circuit breaker is OPEN, returns empty rows with
 * `fromCache: true` instead of attempting a query that will fail.
 * On success/failure, records the outcome to the circuit breaker.
 */
export async function safeQuery<T>(
  text: string,
  params?: unknown[],
): Promise<{ rows: T[]; fromCache: boolean }> {
  const { circuitBreaker } = await import("@/lib/circuit-breaker");

  if (circuitBreaker.isOpen()) {
    return { rows: [], fromCache: true };
  }

  try {
    const result = await query(text, params);
    circuitBreaker.recordSuccess();
    return { rows: result.rows as T[], fromCache: false };
  } catch (err) {
    circuitBreaker.recordFailure();
    throw err;
  }
}
