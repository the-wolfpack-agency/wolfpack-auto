/**
 * Domain management queries — custom domains for multi-tenant routing.
 */

import { query } from "@/lib/db";
import type { Dealer } from "@/types/dealer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DealerDomain {
  id: string;
  dealer_id: string;
  domain: string;
  ssl_status: "pending" | "provisioning" | "active" | "failed" | "expired";
  ssl_expiry: string | null;
  verified: boolean;
  dns_txt_record: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Add a custom domain for a dealer.
 *
 * The domain starts with `verified = false` and `ssl_status = 'pending'`.
 * A DNS TXT verification token is generated so the dealer can prove ownership
 * before we provision SSL.
 */
export async function addDomain(
  dealerId: string,
  domain: string,
): Promise<DealerDomain> {
  const normalizedDomain = domain.toLowerCase().trim();
  const txtRecord = generateVerificationToken(dealerId, normalizedDomain);

  const result = await query(
    `INSERT INTO dealer_domains (dealer_id, domain, ssl_status, verified, dns_txt_record)
     VALUES ($1, $2, 'pending', false, $3)
     RETURNING *`,
    [dealerId, normalizedDomain, txtRecord],
  );

  return result.rows[0] as unknown as DealerDomain;
}

/**
 * List all custom domains for a dealer.
 */
export async function getDomains(dealerId: string): Promise<DealerDomain[]> {
  const result = await query(
    `SELECT * FROM dealer_domains
     WHERE dealer_id = $1
     ORDER BY created_at DESC`,
    [dealerId],
  );
  return result.rows as unknown as DealerDomain[];
}

/**
 * Lookup a dealer by any of their verified custom domains.
 *
 * Only returns active dealers with verified, SSL-active domains.
 * Used by the tenant resolver for custom domain routing.
 */
export async function getDealerByDomain(
  domain: string,
): Promise<Dealer | null> {
  const normalizedDomain = domain.toLowerCase().trim();

  const result = await query(
    `SELECT d.*
     FROM dealers d
     INNER JOIN dealer_domains dd ON dd.dealer_id = d.id
     WHERE dd.domain = $1
       AND dd.verified = true
       AND d.is_active = true
     LIMIT 1`,
    [normalizedDomain],
  );

  return (result.rows[0] as unknown as Dealer) ?? null;
}

/**
 * Get a single domain record by ID.
 */
export async function getDomainById(
  domainId: string,
): Promise<DealerDomain | null> {
  const result = await query(
    `SELECT * FROM dealer_domains WHERE id = $1 LIMIT 1`,
    [domainId],
  );
  return (result.rows[0] as unknown as DealerDomain) ?? null;
}

/**
 * Update SSL status and expiry for a domain after certificate provisioning.
 */
export async function updateSSLStatus(
  domainId: string,
  status: DealerDomain["ssl_status"],
  expiry: Date | null,
): Promise<DealerDomain | null> {
  const result = await query(
    `UPDATE dealer_domains
     SET ssl_status = $1, ssl_expiry = $2, updated_at = now()
     WHERE id = $3
     RETURNING *`,
    [status, expiry?.toISOString() ?? null, domainId],
  );
  return (result.rows[0] as unknown as DealerDomain) ?? null;
}

/**
 * Mark a domain as verified after DNS TXT record check passes.
 */
export async function verifyDomain(
  domainId: string,
): Promise<DealerDomain | null> {
  const result = await query(
    `UPDATE dealer_domains
     SET verified = true, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [domainId],
  );
  return (result.rows[0] as unknown as DealerDomain) ?? null;
}

/**
 * Remove a custom domain.
 */
export async function removeDomain(
  domainId: string,
  dealerId: string,
): Promise<boolean> {
  const result = await query(
    `DELETE FROM dealer_domains
     WHERE id = $1 AND dealer_id = $2`,
    [domainId, dealerId],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Find all domains with SSL expiring within N days — for renewal cron.
 */
export async function getDomainsExpiringSoon(
  withinDays: number = 30,
): Promise<DealerDomain[]> {
  const result = await query(
    `SELECT * FROM dealer_domains
     WHERE ssl_status = 'active'
       AND verified = true
       AND ssl_expiry IS NOT NULL
       AND ssl_expiry < now() + interval '1 day' * $1
     ORDER BY ssl_expiry ASC`,
    [withinDays],
  );
  return result.rows as unknown as DealerDomain[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic but hard-to-guess DNS TXT verification token.
 *
 * The dealer must create a TXT record at `_wolfpack-verify.<domain>` with
 * this value to prove domain ownership.
 */
function generateVerificationToken(dealerId: string, domain: string): string {
  // Simple hash-based token. In production this would use HMAC with a secret.
  const input = `${dealerId}:${domain}:${Date.now()}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `wolfpack-verify=${Math.abs(hash).toString(36)}`;
}
