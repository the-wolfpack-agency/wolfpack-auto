/**
 * Lead query functions — parameterized SQL only.
 */

import { query } from "@/lib/db";
import type { Lead, LeadSource, LeadStatus } from "@/types/lead";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateLeadInput {
  dealer_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  vehicle_id?: string | null;
  vehicle_interest?: string;
  source: LeadSource;
  notes?: string;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  referrer_url?: string | null;
}

export interface LeadFilters {
  status?: LeadStatus;
  source?: LeadSource;
  search?: string; // free-text search across name/email
}

export interface LeadStats {
  total: number;
  new: number;
  contacted: number;
  qualified: number;
  appointment_set: number;
  sold: number;
  lost: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Insert a new lead. Returns the created lead.
 */
export async function createLead(input: CreateLeadInput): Promise<Lead> {
  const result = await query(
    `INSERT INTO leads (
      dealer_id, first_name, last_name, email, phone,
      vehicle_id, vehicle_interest, source, notes,
      utm_source, utm_medium, utm_campaign, referrer_url
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING *`,
    [
      input.dealer_id,
      input.first_name,
      input.last_name,
      input.email,
      input.phone ?? null,
      input.vehicle_id ?? null,
      input.vehicle_interest ?? "",
      input.source,
      input.notes ?? "",
      input.utm_source ?? null,
      input.utm_medium ?? null,
      input.utm_campaign ?? null,
      input.referrer_url ?? null,
    ],
  );

  return result.rows as any[][0];
}

/**
 * Paginated lead list with optional filters.
 */
export async function getLeads(
  dealerId: string,
  filters: LeadFilters = {},
  page = 1,
  pageSize = 50,
): Promise<Lead[]> {
  const offset = (page - 1) * pageSize;
  const conditions: string[] = ["dealer_id = $1"];
  const params: unknown[] = [dealerId];
  let idx = 2;

  if (filters.status) {
    conditions.push(`status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters.source) {
    conditions.push(`source = $${idx++}`);
    params.push(filters.source);
  }
  if (filters.search) {
    conditions.push(
      `(first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR email ILIKE $${idx})`,
    );
    params.push(`%${filters.search}%`);
    idx++;
  }

  const where = conditions.join(" AND ");

  const result = await query(
    `SELECT * FROM leads
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, pageSize, offset],
  );
  return result.rows as any[];
}

/**
 * Update a lead's status. Scoped to dealer for RLS compliance.
 */
export async function updateLeadStatus(
  leadId: string,
  dealerId: string,
  status: LeadStatus,
): Promise<Lead | null> {
  const result = await query(
    `UPDATE leads
     SET status = $1, updated_at = now()
     WHERE id = $2 AND dealer_id = $3
     RETURNING *`,
    [status, leadId, dealerId],
  );
  return result.rows as any[][0] ?? null;
}

/**
 * Lead counts by status for the dealer dashboard.
 */
export async function getLeadStats(dealerId: string): Promise<LeadStats> {
  const result = await query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count
     FROM leads
     WHERE dealer_id = $1
     GROUP BY status`,
    [dealerId],
  );

  const stats: LeadStats = {
    total: 0,
    new: 0,
    contacted: 0,
    qualified: 0,
    appointment_set: 0,
    sold: 0,
    lost: 0,
  };

  for (const row of result.rows as any[]) {
    const count = parseInt(row.count, 10);
    stats.total += count;
    if (row.status in stats) {
      stats[row.status as keyof Omit<LeadStats, "total">] = count;
    }
  }

  return stats;
}
