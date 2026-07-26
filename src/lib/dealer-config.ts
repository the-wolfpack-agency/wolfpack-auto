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
// Short TTL so Settings changes (name, hours, branding) reflect on the public
// site quickly instead of lagging by minutes, while still sparing the DB from a
// query on every request.
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

/**
 * Normalize `business_hours` to the `Record<string, string>` shape every UI
 * consumer expects (layout banner, /contact, /help, chat).
 *
 * The admin Settings form saves hours as an ARRAY of
 * `{ day, open, close, closed }` objects (stored as JSONB). Rendering that raw
 * array produced "[object Object]" in the top banner and crashed /contact
 * ("Objects are not valid as a React child"). This converts either shape into
 * a plain `{ "Monday": "09:00 - 19:00" }` map.
 */
export function normalizeBusinessHours(raw: unknown): Record<string, string> {
  let val: unknown = raw;
  if (typeof val === "string") {
    try {
      val = JSON.parse(val);
    } catch {
      return DEFAULT_CONFIG.business_hours;
    }
  }

  // Array of { day, open, close, closed } (what the Settings form saves).
  if (Array.isArray(val)) {
    const out: Record<string, string> = {};
    for (const e of val) {
      if (e && typeof e === "object" && "day" in e) {
        const d = e as { day?: string; open?: string; close?: string; closed?: boolean };
        if (!d.day) continue;
        const label = d.day.charAt(0).toUpperCase() + d.day.slice(1);
        out[label] = d.closed
          ? "Closed"
          : [d.open, d.close].filter(Boolean).join(" - ");
      }
    }
    return Object.keys(out).length ? out : DEFAULT_CONFIG.business_hours;
  }

  // Already a plain { label: "hours" } string map.
  if (val && typeof val === "object") {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return Object.keys(out).length ? out : DEFAULT_CONFIG.business_hours;
  }

  return DEFAULT_CONFIG.business_hours;
}

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

        // The DB stores address as JSONB {street, city, state, zip, lat, lng}.
        // Extract the scalar fields so they can be safely rendered in JSX.
        const addr = row.address;
        const addrObj = addr && typeof addr === "object" ? addr : null;
        const streetStr: string = addrObj
          ? String(addrObj.street ?? DEFAULT_CONFIG.address)
          : String(addr ?? DEFAULT_CONFIG.address);
        const cityStr: string = addrObj
          ? String(addrObj.city ?? row.city ?? DEFAULT_CONFIG.city)
          : String(row.city ?? DEFAULT_CONFIG.city);
        const stateStr: string = addrObj
          ? String(addrObj.state ?? row.state ?? DEFAULT_CONFIG.state)
          : String(row.state ?? DEFAULT_CONFIG.state);
        const zipStr: string = addrObj
          ? String(addrObj.zip ?? row.zip ?? DEFAULT_CONFIG.zip)
          : String(row.zip ?? DEFAULT_CONFIG.zip);

        config = {
          id: row.id,
          name: row.name ?? DEFAULT_CONFIG.name,
          tagline: row.tagline ?? DEFAULT_CONFIG.tagline,
          phone: row.phone ?? DEFAULT_CONFIG.phone,
          email: row.email ?? DEFAULT_CONFIG.email,
          address: streetStr,
          city: cityStr,
          state: stateStr,
          zip: zipStr,
          logo_url: row.logo_url ?? DEFAULT_CONFIG.logo_url,
          primary_color: row.primary_color ?? DEFAULT_CONFIG.primary_color,
          secondary_color:
            row.secondary_color ?? DEFAULT_CONFIG.secondary_color,
          accent_color: row.accent_color ?? DEFAULT_CONFIG.accent_color,
          business_hours: normalizeBusinessHours(row.business_hours),
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
