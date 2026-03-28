/**
 * Simple idempotency check using a request fingerprint.
 * Prevents duplicate records from double-clicks or retries.
 *
 * Uses an in-memory map with TTL cleanup. For multi-instance deployments,
 * replace with Redis-backed implementation.
 */

import crypto from "crypto";

interface IdempotencyEntry {
  timestamp: number;
  response: unknown;
}

const recentRequests = new Map<string, IdempotencyEntry>();
const TTL = 60_000; // 1 minute

/**
 * Check if a request with this key was recently processed.
 * Returns the cached response if found, or null if this is a new request.
 */
export function checkIdempotency(key: string): unknown | null {
  const entry = recentRequests.get(key);
  if (entry && Date.now() - entry.timestamp < TTL) return entry.response;

  // Clean old entries on every check to prevent unbounded growth
  for (const [k, v] of recentRequests) {
    if (Date.now() - v.timestamp > TTL) recentRequests.delete(k);
  }

  return null;
}

/**
 * Record a successful response for idempotency dedup.
 */
export function recordIdempotency(key: string, response: unknown): void {
  recentRequests.set(key, { timestamp: Date.now(), response });
}

/**
 * Generate an idempotency key from a request body.
 * Uses SHA-256 hash of the JSON-serialized body + route path.
 */
export function idempotencyKey(route: string, body: unknown): string {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify({ route, body }))
    .digest("hex");
  return `idemp:${hash}`;
}

/**
 * Clear all cached entries (useful for testing).
 */
export function clearIdempotencyCache(): void {
  recentRequests.clear();
}
