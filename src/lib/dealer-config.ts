/**
 * Central dealer configuration loader.
 *
 * Tries PostgreSQL first, falls back to DEFAULT_CONFIG so the site
 * renders identically when no database is connected.
 */

// Re-export shared types (safe for client components)
export type { DealerConfig } from "@/lib/dealer-config-shared";
export { DEFAULT_CONFIG } from "@/lib/dealer-config-shared";

import type { DealerConfig } from "@/lib/dealer-config-shared";
import { DEFAULT_CONFIG } from "@/lib/dealer-config-shared";

/** In-memory cache: { config, expiresAt } */
let _cache: { config: DealerConfig; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load the dealer configuration.
 *
 * Resolution order:
 *   1. In-memory cache (if fresh)
 *   2. PostgreSQL `dealers` table (if DATABASE_URL is set)
 *   3. DEFAULT_CONFIG (Wolfpack Motors defaults)
 */
export async function getDealerConfig(
  dealerId?: string
): Promise<DealerConfig> {
  // Return cached config if still fresh
  if (_cache && Date.now() < _cache.expiresAt) {
    return _cache.config;
  }

  let config: DealerConfig = DEFAULT_CONFIG;

  // Attempt PostgreSQL lookup when a connection string is available
  if (process.env.DATABASE_URL) {
    try {
      // Dynamic import so the app doesn't crash when pg is not installed
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      const id = dealerId ?? process.env.DEALER_ID ?? "wolfpack-motors";
      const { rows } = await pool.query(
        `SELECT * FROM dealers WHERE id = $1 LIMIT 1`,
        [id]
      );
      await pool.end();

      if (rows.length > 0) {
        const row = rows[0];
        config = {
          id: row.id,
          name: row.name ?? DEFAULT_CONFIG.name,
          tagline: row.tagline ?? DEFAULT_CONFIG.tagline,
          phone: row.phone ?? DEFAULT_CONFIG.phone,
          email: row.email ?? DEFAULT_CONFIG.email,
          address: row.address ?? DEFAULT_CONFIG.address,
          city: row.city ?? DEFAULT_CONFIG.city,
          state: row.state ?? DEFAULT_CONFIG.state,
          zip: row.zip ?? DEFAULT_CONFIG.zip,
          logo_url: row.logo_url ?? DEFAULT_CONFIG.logo_url,
          primary_color: row.primary_color ?? DEFAULT_CONFIG.primary_color,
          secondary_color:
            row.secondary_color ?? DEFAULT_CONFIG.secondary_color,
          accent_color: row.accent_color ?? DEFAULT_CONFIG.accent_color,
          business_hours:
            row.business_hours ?? DEFAULT_CONFIG.business_hours,
          social: row.social ?? DEFAULT_CONFIG.social,
        };
      }
    } catch {
      // Database unavailable — fall through to default config
    }
  }

  _cache = { config, expiresAt: Date.now() + CACHE_TTL_MS };
  return config;
}
