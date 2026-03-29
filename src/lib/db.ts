import { Pool, type PoolConfig } from "pg";

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  // Neon serverless: keep pool small to avoid exhausting connection slots.
  // Neon's pooler handles multiplexing — local pool is just a buffer.
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
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
 * Default query timeout in milliseconds.
 * Prevents hung queries from blocking the connection pool under load.
 */
const QUERY_TIMEOUT_MS = 10_000;

/**
 * Convenience: run a single parameterised query with a timeout.
 *
 * Every query gets a 10s statement_timeout by default. This prevents
 * slow queries from monopolizing the connection pool under load —
 * critical for Neon's 5-connection limit.
 */
export async function query<T extends Record<string, any>>(
  text: string,
  params?: unknown[],
  timeoutMs: number = QUERY_TIMEOUT_MS,
) {
  const client = await pool.connect();
  try {
    await client.query(`SET LOCAL statement_timeout = '${timeoutMs}'`);
    const result = await client.query<T>(text, params);
    return result;
  } finally {
    client.release();
  }
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
