import { Pool, type PoolConfig } from "pg";

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Enforce SSL in production
  ssl:
    process.env.NODE_ENV === "production"
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
      console.error("[db] Unexpected pool error:", err);
    });
  }

  return globalForPg.__pgPool;
}

export const pool = createPool();

/**
 * Convenience: run a single parameterised query.
 */
export async function query<T extends Record<string, unknown>>(
  text: string,
  params?: unknown[],
) {
  const result = await pool.query<T>(text, params);
  return result;
}
