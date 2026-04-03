/**
 * Dataflow Health — shared utilities for checking data pipeline integrity.
 *
 * Used by:
 *  - /api/analytics/events route (logs warnings, surfaces in response)
 *  - /api/admin/analytics/verification route (full verification)
 *  - Dataflow integrity tests
 */

/**
 * Returns a list of dataflow warnings for the current process.
 * Each warning identifies a missing configuration that will cause data loss.
 */
export function getDataflowWarnings(): string[] {
  const warnings: string[] = [];
  if (!process.env.DATABASE_URL) {
    warnings.push("DATABASE_URL not set — events will NOT be persisted to PostgreSQL. DATA LOSS RISK.");
  }
  if (!process.env.QDRANT_URL) {
    warnings.push("QDRANT_URL not set — insights will NOT be stored in vector DB.");
  }
  if (process.env.NEO4J_URL === "") {
    warnings.push("NEO4J_URL is empty — journey graph writes are explicitly disabled.");
  } else if (!process.env.NEO4J_URL) {
    warnings.push("NEO4J_URL not set — journey graphs will NOT be written. DATA LOSS RISK.");
  }
  if (!process.env.NEO4J_PASSWORD) {
    warnings.push("NEO4J_PASSWORD not set — using insecure default credentials.");
  }
  return warnings;
}

/** PG write stats — tracked per-process for health reporting. */
let pgWriteStats = { attempted: 0, succeeded: 0, failed: 0, lastError: "" };

export function getPgWriteStats() {
  return { ...pgWriteStats };
}

export function recordPgWrite(count: number, success: boolean, error?: string) {
  pgWriteStats.attempted += count;
  if (success) {
    pgWriteStats.succeeded += count;
  } else {
    pgWriteStats.failed += count;
    if (error) pgWriteStats.lastError = error;
  }
}
