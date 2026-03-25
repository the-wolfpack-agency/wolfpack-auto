/**
 * Dealer query functions — parameterized SQL only.
 */

import { query } from "@/lib/db";
import type { Dealer, DealerBranding } from "@/types/dealer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpdateDealerInput {
  name?: string;
  phone?: string;
  email?: string;
  website_url?: string;
  address?: Record<string, unknown>;
  sales_hours?: Record<string, unknown>[];
  service_hours?: Record<string, unknown>[];
  branding?: DealerBranding;
  has_service_center?: boolean;
  has_financing?: boolean;
  has_trade_in?: boolean;
  is_active?: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Lookup dealer by URL slug (e.g., "wolfpack-motors").
 */
export async function getDealerBySlug(slug: string): Promise<Dealer | null> {
  const result = await query(
    `SELECT * FROM dealers WHERE slug = $1 AND is_active = true LIMIT 1`,
    [slug],
  );
  return result.rows[0] as any ?? null;
}

/**
 * Lookup dealer by custom domain (for multi-tenant routing).
 * Matches against the subdomain column.
 */
export async function getDealerByDomain(
  domain: string,
): Promise<Dealer | null> {
  // Strip common suffixes for subdomain matching
  const subdomain = domain
    .replace(/\.wolfpackauto\.com$/, "")
    .replace(/\.localhost$/, "")
    .toLowerCase();

  const result = await query(
    `SELECT * FROM dealers WHERE subdomain = $1 AND is_active = true LIMIT 1`,
    [subdomain],
  );
  return result.rows[0] as any ?? null;
}

/**
 * Update dealer settings. Only updates provided fields.
 * Returns the updated dealer or null if not found.
 */
export async function updateDealer(
  dealerId: string,
  data: UpdateDealerInput,
): Promise<Dealer | null> {
  // Build SET clause dynamically from provided fields.
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) {
    setClauses.push(`name = $${idx++}`);
    params.push(data.name);
  }
  if (data.phone !== undefined) {
    setClauses.push(`phone = $${idx++}`);
    params.push(data.phone);
  }
  if (data.email !== undefined) {
    setClauses.push(`email = $${idx++}`);
    params.push(data.email);
  }
  if (data.website_url !== undefined) {
    setClauses.push(`website_url = $${idx++}`);
    params.push(data.website_url);
  }
  if (data.address !== undefined) {
    setClauses.push(`address = $${idx++}`);
    params.push(JSON.stringify(data.address));
  }
  if (data.sales_hours !== undefined) {
    setClauses.push(`sales_hours = $${idx++}`);
    params.push(JSON.stringify(data.sales_hours));
  }
  if (data.service_hours !== undefined) {
    setClauses.push(`service_hours = $${idx++}`);
    params.push(JSON.stringify(data.service_hours));
  }
  if (data.branding !== undefined) {
    setClauses.push(`branding = $${idx++}`);
    params.push(JSON.stringify(data.branding));
  }
  if (data.has_service_center !== undefined) {
    setClauses.push(`has_service_center = $${idx++}`);
    params.push(data.has_service_center);
  }
  if (data.has_financing !== undefined) {
    setClauses.push(`has_financing = $${idx++}`);
    params.push(data.has_financing);
  }
  if (data.has_trade_in !== undefined) {
    setClauses.push(`has_trade_in = $${idx++}`);
    params.push(data.has_trade_in);
  }
  if (data.is_active !== undefined) {
    setClauses.push(`is_active = $${idx++}`);
    params.push(data.is_active);
  }

  if (setClauses.length === 0) {
    // Nothing to update — return current state
    const current = await query(
      `SELECT * FROM dealers WHERE id = $1 LIMIT 1`,
      [dealerId],
    );
    return (current.rows as any[])[0] ?? null;
  }

  // updated_at is handled by the trigger, but we include it for clarity
  setClauses.push(`updated_at = now()`);

  const result = await query(
    `UPDATE dealers SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
    [...params, dealerId],
  );

  return result.rows[0] as any ?? null;
}

/**
 * Get dealer by ID.
 */
export async function getDealerById(
  dealerId: string,
): Promise<Dealer | null> {
  const result = await query(
    `SELECT * FROM dealers WHERE id = $1 LIMIT 1`,
    [dealerId],
  );
  return result.rows[0] as any ?? null;
}
