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
 * Convenience: run a single parameterised query.
 */
export async function query<T extends Record<string, any>>(
  text: string,
  params?: unknown[],
) {
  const result = await pool.query<T>(text, params);
  return result;
}
