/**
 * OEM (Original Equipment Manufacturer) database queries.
 *
 * These queries operate at the OEM level — above the dealer tier.
 * All functions gracefully return empty/default data when the DB is
 * unavailable or migration 004 has not yet been applied.
 */

import { pool } from "@/lib/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OemRow {
  id: string;
  name: string;
  slug: string;
  brand_code: string;
  logo_url: string;
  primary_color: string;
  contact_email: string;
  is_active: boolean;
  created_at: string;
}

export interface OemProgram {
  id: string;
  oem_id: string;
  name: string;
  slug: string;
  type: string;
  description: string;
  incentive_amount: number | null;
  incentive_pct: number | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  is_required: boolean;
  enrollment_count?: number;
  completion_rate?: number;
}

export interface OemNetworkDealer {
  id: string;
  name: string;
  slug: string;
  subdomain: string;
  phone: string;
  email: string;
  oem_id: string | null;
  franchise_code: string | null;
  is_active: boolean;
  vehicle_count: number;
  lead_count: number;
  enrolled_programs: number;
  avg_program_score: number | null;
  created_at: string;
}

export interface OemNetworkStats {
  total_dealers: number;
  active_dealers: number;
  total_programs: number;
  active_programs: number;
  total_enrollments: number;
  completed_enrollments: number;
  total_leads_network: number;
  total_vehicles_network: number;
  network_close_rate: number;
  avg_program_compliance: number;
}

export interface OemProgramEnrollment {
  id: string;
  program_id: string;
  program_name: string;
  dealer_id: string;
  dealer_name: string;
  status: string;
  enrolled_at: string;
  completed_at: string | null;
  score: number | null;
}

// ---------------------------------------------------------------------------
// OEM Network Overview Stats
// ---------------------------------------------------------------------------

export async function getOemNetworkStats(
  oemId?: string
): Promise<OemNetworkStats> {
  const defaults: OemNetworkStats = {
    total_dealers: 0,
    active_dealers: 0,
    total_programs: 0,
    active_programs: 0,
    total_enrollments: 0,
    completed_enrollments: 0,
    total_leads_network: 0,
    total_vehicles_network: 0,
    network_close_rate: 0,
    avg_program_compliance: 0,
  };

  try {
    

    // Check if oems table exists (migration may not be applied yet)
    const tableCheck = await pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'oems'
      ) AS exists
    `);
    if (!tableCheck.rows[0]?.exists) return defaults;

    const oemFilter = oemId ? `WHERE d.oem_id = $1` : "";
    const params = oemId ? [oemId] : [];

    const [dealerStats, programStats, networkActivity] = await Promise.all([
      // Dealer counts
      pool.query<{
        total_dealers: string;
        active_dealers: string;
      }>(
        `SELECT
           COUNT(*) AS total_dealers,
           COUNT(*) FILTER (WHERE is_active) AS active_dealers
         FROM dealers d ${oemFilter}`,
        params
      ),

      // Program + enrollment counts
      pool.query<{
        total_programs: string;
        active_programs: string;
        total_enrollments: string;
        completed_enrollments: string;
        avg_score: string | null;
      }>(
        `SELECT
           COUNT(DISTINCT p.id)                                        AS total_programs,
           COUNT(DISTINCT p.id) FILTER (WHERE p.is_active)            AS active_programs,
           COUNT(e.id)                                                  AS total_enrollments,
           COUNT(e.id) FILTER (WHERE e.status = 'completed')          AS completed_enrollments,
           AVG(e.score) FILTER (WHERE e.score IS NOT NULL)            AS avg_score
         FROM oem_programs p
         LEFT JOIN oem_program_enrollments e ON e.program_id = p.id
         ${oemId ? "WHERE p.oem_id = $1" : ""}`,
        params
      ),

      // Network-wide lead + vehicle totals
      pool.query<{
        total_leads: string;
        converted_leads: string;
        total_vehicles: string;
      }>(
        `SELECT
           COUNT(DISTINCT l.id)                                               AS total_leads,
           COUNT(DISTINCT l.id) FILTER (WHERE l.converted_at IS NOT NULL)    AS converted_leads,
           COUNT(DISTINCT v.id)                                               AS total_vehicles
         FROM dealers d
         LEFT JOIN leads l ON l.dealer_id = d.id
         LEFT JOIN vehicles v ON v.dealer_id = d.id
         ${oemFilter}`,
        params
      ),
    ]);

    const totalLeads = parseInt(networkActivity.rows[0]?.total_leads ?? "0");
    const convertedLeads = parseInt(
      networkActivity.rows[0]?.converted_leads ?? "0"
    );

    return {
      total_dealers: parseInt(dealerStats.rows[0]?.total_dealers ?? "0"),
      active_dealers: parseInt(dealerStats.rows[0]?.active_dealers ?? "0"),
      total_programs: parseInt(programStats.rows[0]?.total_programs ?? "0"),
      active_programs: parseInt(programStats.rows[0]?.active_programs ?? "0"),
      total_enrollments: parseInt(
        programStats.rows[0]?.total_enrollments ?? "0"
      ),
      completed_enrollments: parseInt(
        programStats.rows[0]?.completed_enrollments ?? "0"
      ),
      total_leads_network: totalLeads,
      total_vehicles_network: parseInt(
        networkActivity.rows[0]?.total_vehicles ?? "0"
      ),
      network_close_rate:
        totalLeads > 0
          ? Math.round((convertedLeads / totalLeads) * 10000) / 100
          : 0,
      avg_program_compliance: programStats.rows[0]?.avg_score
        ? Math.round(parseFloat(programStats.rows[0].avg_score) * 10) / 10
        : 0,
    };
  } catch {
    return defaults;
  }
}

// ---------------------------------------------------------------------------
// Dealer Network List (for OEM network management page)
// ---------------------------------------------------------------------------

export async function getOemNetworkDealers(
  oemId?: string,
  limit = 50
): Promise<OemNetworkDealer[]> {
  try {
    

    const tableCheck = await pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'oems'
      ) AS exists
    `);
    if (!tableCheck.rows[0]?.exists) return [];

    const whereClause = oemId ? "WHERE d.oem_id = $1" : "";
    const params: (string | number)[] = oemId ? [oemId, limit] : [limit];
    const limitParam = oemId ? "$2" : "$1";

    const { rows } = await pool.query<OemNetworkDealer>(
      `SELECT
         d.id,
         d.name,
         d.slug,
         d.subdomain,
         d.phone,
         d.email,
         d.oem_id,
         d.franchise_code,
         d.is_active,
         d.created_at,
         COUNT(DISTINCT v.id)::int                                           AS vehicle_count,
         COUNT(DISTINCT l.id)::int                                           AS lead_count,
         COUNT(DISTINCT e.id)::int                                           AS enrolled_programs,
         AVG(e.score) FILTER (WHERE e.score IS NOT NULL)                    AS avg_program_score
       FROM dealers d
       LEFT JOIN vehicles v ON v.dealer_id = d.id
       LEFT JOIN leads l    ON l.dealer_id = d.id
       LEFT JOIN oem_program_enrollments e ON e.dealer_id = d.id
       ${whereClause}
       GROUP BY d.id
       ORDER BY d.name
       LIMIT ${limitParam}`,
      params
    );

    return rows;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// OEM Programs list
// ---------------------------------------------------------------------------

export async function getOemPrograms(oemId?: string): Promise<OemProgram[]> {
  try {
    

    const tableCheck = await pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'oem_programs'
      ) AS exists
    `);
    if (!tableCheck.rows[0]?.exists) return [];

    const whereClause = oemId ? "WHERE p.oem_id = $1" : "";
    const params = oemId ? [oemId] : [];

    const { rows } = await pool.query<OemProgram>(
      `SELECT
         p.*,
         COUNT(e.id)::int                                              AS enrollment_count,
         ROUND(
           100.0 * COUNT(e.id) FILTER (WHERE e.status = 'completed')
           / NULLIF(COUNT(e.id), 0),
           1
         )                                                             AS completion_rate
       FROM oem_programs p
       LEFT JOIN oem_program_enrollments e ON e.program_id = p.id
       ${whereClause}
       GROUP BY p.id
       ORDER BY p.is_required DESC, p.name`,
      params
    );

    return rows;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Recent enrollment activity
// ---------------------------------------------------------------------------

export async function getRecentEnrollments(
  oemId?: string,
  limit = 10
): Promise<OemProgramEnrollment[]> {
  try {
    

    const tableCheck = await pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'oem_program_enrollments'
      ) AS exists
    `);
    if (!tableCheck.rows[0]?.exists) return [];

    const whereClause = oemId ? "WHERE p.oem_id = $1" : "";
    const params: (string | number)[] = oemId ? [oemId, limit] : [limit];
    const limitParam = oemId ? "$2" : "$1";

    const { rows } = await pool.query<OemProgramEnrollment>(
      `SELECT
         e.id,
         e.program_id,
         p.name AS program_name,
         e.dealer_id,
         d.name AS dealer_name,
         e.status,
         e.enrolled_at,
         e.completed_at,
         e.score
       FROM oem_program_enrollments e
       JOIN oem_programs p ON p.id = e.program_id
       JOIN dealers d       ON d.id = e.dealer_id
       ${whereClause}
       ORDER BY e.enrolled_at DESC
       LIMIT ${limitParam}`,
      params
    );

    return rows;
  } catch {
    return [];
  }
}
