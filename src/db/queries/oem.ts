/**
 * OEM (Original Equipment Manufacturer) database queries.
 *
 * These queries operate at the OEM level — above the dealer tier.
 * All functions gracefully return rich mock data in shadow mode
 * (DATABASE_URL not set) and fall back to mock data when the DB
 * is unavailable or migration 004 has not yet been applied.
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
  enrollment_count?: number | null;
  completion_rate?: number | null;
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
// Mock / shadow-mode data
// ---------------------------------------------------------------------------

const MOCK_STATS: OemNetworkStats = {
  total_dealers: 12,
  active_dealers: 10,
  total_programs: 5,
  active_programs: 4,
  total_enrollments: 38,
  completed_enrollments: 22,
  network_close_rate: 14,
  total_leads_network: 1840,
  total_vehicles_network: 623,
  avg_program_compliance: 76,
};

const MOCK_ENROLLMENTS: OemProgramEnrollment[] = [
  {
    id: "enr-001",
    program_id: "prg-002",
    program_name: "Certified EV Dealer",
    dealer_id: "dlr-001",
    dealer_name: "Wolfpack Downtown",
    status: "completed",
    enrolled_at: "2026-02-01T00:00:00Z",
    completed_at: "2026-03-10T00:00:00Z",
    score: 92,
  },
  {
    id: "enr-002",
    program_id: "prg-001",
    program_name: "Q2 Sales Accelerator",
    dealer_id: "dlr-002",
    dealer_name: "Wolfpack Northside",
    status: "in_progress",
    enrolled_at: "2026-03-01T00:00:00Z",
    completed_at: null,
    score: 67,
  },
  {
    id: "enr-003",
    program_id: "prg-003",
    program_name: "Digital Retailing Standard",
    dealer_id: "dlr-003",
    dealer_name: "Wolfpack Eastgate",
    status: "enrolled",
    enrolled_at: "2026-03-15T00:00:00Z",
    completed_at: null,
    score: null,
  },
  {
    id: "enr-004",
    program_id: "prg-004",
    program_name: "F&I Product Training 2026",
    dealer_id: "dlr-004",
    dealer_name: "Wolfpack Westfield",
    status: "completed",
    enrolled_at: "2026-01-10T00:00:00Z",
    completed_at: "2026-02-28T00:00:00Z",
    score: 88,
  },
  {
    id: "enr-005",
    program_id: "prg-005",
    program_name: "Summer Drive Event",
    dealer_id: "dlr-005",
    dealer_name: "Wolfpack Southpark",
    status: "in_progress",
    enrolled_at: "2026-03-20T00:00:00Z",
    completed_at: null,
    score: 55,
  },
  {
    id: "enr-006",
    program_id: "prg-002",
    program_name: "Certified EV Dealer",
    dealer_id: "dlr-006",
    dealer_name: "Wolfpack Airport",
    status: "enrolled",
    enrolled_at: "2026-03-22T00:00:00Z",
    completed_at: null,
    score: null,
  },
  {
    id: "enr-007",
    program_id: "prg-001",
    program_name: "Q2 Sales Accelerator",
    dealer_id: "dlr-007",
    dealer_name: "Wolfpack Harbor",
    status: "withdrawn",
    enrolled_at: "2026-02-15T00:00:00Z",
    completed_at: null,
    score: null,
  },
  {
    id: "enr-008",
    program_id: "prg-003",
    program_name: "Digital Retailing Standard",
    dealer_id: "dlr-008",
    dealer_name: "Wolfpack Uptown",
    status: "completed",
    enrolled_at: "2026-01-20T00:00:00Z",
    completed_at: "2026-03-05T00:00:00Z",
    score: 95,
  },
];

const MOCK_DEALERS: OemNetworkDealer[] = [
  {
    id: "dlr-001",
    name: "Wolfpack Downtown",
    slug: "wolfpack-downtown",
    subdomain: "downtown",
    phone: "+15551110001",
    email: "downtown@wolfpackauto.com",
    oem_id: "oem-001",
    franchise_code: "TYT",
    vehicle_count: 84,
    lead_count: 312,
    enrolled_programs: 3,
    avg_program_score: 89.3,
    is_active: true,
    created_at: "2025-06-01T00:00:00Z",
  },
  {
    id: "dlr-002",
    name: "Wolfpack Northside",
    slug: "wolfpack-northside",
    subdomain: "northside",
    phone: "+15551110002",
    email: "northside@wolfpackauto.com",
    oem_id: "oem-001",
    franchise_code: "HON",
    vehicle_count: 71,
    lead_count: 248,
    enrolled_programs: 2,
    avg_program_score: 74.5,
    is_active: true,
    created_at: "2025-07-15T00:00:00Z",
  },
  {
    id: "dlr-003",
    name: "Wolfpack Eastgate",
    slug: "wolfpack-eastgate",
    subdomain: "eastgate",
    phone: "+15551110003",
    email: "eastgate@wolfpackauto.com",
    oem_id: "oem-001",
    franchise_code: "CHV",
    vehicle_count: 56,
    lead_count: 185,
    enrolled_programs: 2,
    avg_program_score: null,
    is_active: true,
    created_at: "2025-08-10T00:00:00Z",
  },
  {
    id: "dlr-004",
    name: "Wolfpack Westfield",
    slug: "wolfpack-westfield",
    subdomain: "westfield",
    phone: "+15551110004",
    email: "westfield@wolfpackauto.com",
    oem_id: "oem-001",
    franchise_code: "TYT",
    vehicle_count: 98,
    lead_count: 402,
    enrolled_programs: 4,
    avg_program_score: 91.0,
    is_active: true,
    created_at: "2025-05-20T00:00:00Z",
  },
  {
    id: "dlr-005",
    name: "Wolfpack Southpark",
    slug: "wolfpack-southpark",
    subdomain: "southpark",
    phone: "+15551110005",
    email: "southpark@wolfpackauto.com",
    oem_id: null,
    franchise_code: "KIA",
    vehicle_count: 43,
    lead_count: 127,
    enrolled_programs: 1,
    avg_program_score: 55.0,
    is_active: false,
    created_at: "2025-09-01T00:00:00Z",
  },
];

const MOCK_PROGRAMS: OemProgram[] = [
  {
    id: "prg-001",
    oem_id: "oem-001",
    name: "Q2 Sales Accelerator",
    slug: "q2-sales-accelerator",
    type: "incentive",
    description: "Dealers who sell 10+ certified pre-owned units receive a $500/unit rebate.",
    is_active: true,
    is_required: false,
    incentive_amount: 500,
    incentive_pct: null,
    start_date: "2026-04-01T00:00:00Z",
    end_date: "2026-06-30T00:00:00Z",
    enrollment_count: 8,
    completion_rate: 37,
  },
  {
    id: "prg-002",
    oem_id: "oem-001",
    name: "Certified EV Dealer",
    slug: "certified-ev-dealer",
    type: "certification",
    description: "Comprehensive EV sales + service certification. Required for EV model allocation.",
    is_active: true,
    is_required: true,
    incentive_amount: null,
    incentive_pct: null,
    start_date: "2026-01-01T00:00:00Z",
    end_date: null,
    enrollment_count: 12,
    completion_rate: 58,
  },
  {
    id: "prg-003",
    oem_id: "oem-001",
    name: "Digital Retailing Standard",
    slug: "digital-retailing-standard",
    type: "brand_standard",
    description: "All franchise sites must offer online trade-in valuation and payment estimator.",
    is_active: true,
    is_required: true,
    incentive_amount: null,
    incentive_pct: null,
    start_date: "2025-01-01T00:00:00Z",
    end_date: null,
    enrollment_count: 10,
    completion_rate: 80,
  },
  {
    id: "prg-004",
    oem_id: "oem-001",
    name: "F&I Product Training 2026",
    slug: "fni-product-training-2026",
    type: "training",
    description: "Annual financing & insurance product compliance training. Required by April 30.",
    is_active: true,
    is_required: true,
    incentive_amount: null,
    incentive_pct: null,
    start_date: "2026-01-01T00:00:00Z",
    end_date: "2026-04-30T00:00:00Z",
    enrollment_count: 6,
    completion_rate: 67,
  },
  {
    id: "prg-005",
    oem_id: "oem-001",
    name: "Summer Drive Event",
    slug: "summer-drive-event",
    type: "co_op_advertising",
    description: "50% co-op reimbursement for qualifying digital and broadcast advertising.",
    is_active: false,
    is_required: false,
    incentive_amount: null,
    incentive_pct: 50,
    start_date: "2026-06-01T00:00:00Z",
    end_date: "2026-08-31T00:00:00Z",
    enrollment_count: 2,
    completion_rate: null,
  },
];

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

  // Shadow mode: return rich demo data immediately
  if (!process.env.DATABASE_URL) return MOCK_STATS;

  try {
    // Check if oems table exists (migration may not be applied yet)
    const tableCheck = await pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'oems'
      ) AS exists
    `);
    if (!tableCheck.rows[0]?.exists) return MOCK_STATS;

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
    return MOCK_STATS;
  }
}

// ---------------------------------------------------------------------------
// Dealer Network List (for OEM network management page)
// ---------------------------------------------------------------------------

export async function getOemNetworkDealers(
  oemId?: string,
  limit = 50
): Promise<OemNetworkDealer[]> {
  // Shadow mode: return rich demo data immediately
  if (!process.env.DATABASE_URL) return MOCK_DEALERS.slice(0, limit);

  try {
    const tableCheck = await pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'oems'
      ) AS exists
    `);
    if (!tableCheck.rows[0]?.exists) return MOCK_DEALERS.slice(0, limit);

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
    return MOCK_DEALERS.slice(0, limit);
  }
}

// ---------------------------------------------------------------------------
// OEM Programs list
// ---------------------------------------------------------------------------

export async function getOemPrograms(oemId?: string): Promise<OemProgram[]> {
  // Shadow mode: return rich demo data immediately
  if (!process.env.DATABASE_URL) return MOCK_PROGRAMS;

  try {
    const tableCheck = await pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'oem_programs'
      ) AS exists
    `);
    if (!tableCheck.rows[0]?.exists) return MOCK_PROGRAMS;

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
    return MOCK_PROGRAMS;
  }
}

// ---------------------------------------------------------------------------
// Recent enrollment activity
// ---------------------------------------------------------------------------

export async function getRecentEnrollments(
  oemId?: string,
  limit = 10
): Promise<OemProgramEnrollment[]> {
  // Shadow mode: return rich demo data immediately
  if (!process.env.DATABASE_URL) return MOCK_ENROLLMENTS.slice(0, limit);

  try {
    const tableCheck = await pool.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'oem_program_enrollments'
      ) AS exists
    `);
    if (!tableCheck.rows[0]?.exists) return MOCK_ENROLLMENTS.slice(0, limit);

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
    return MOCK_ENROLLMENTS.slice(0, limit);
  }
}
