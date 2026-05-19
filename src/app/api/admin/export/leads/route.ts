import { NextRequest, NextResponse } from "next/server";
import type { Lead, LeadStatus, LeadTemperature } from "@/types/lead";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackSystem } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* CSV helpers                                                                */
/* -------------------------------------------------------------------------- */

function escapeCsv(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function leadToCsvRow(lead: Lead): string {
  return [
    escapeCsv(`${lead.first_name} ${lead.last_name}`),
    escapeCsv(lead.email),
    escapeCsv(lead.phone),
    escapeCsv(lead.vehicle_interest),
    escapeCsv(lead.status),
    escapeCsv(lead.temperature),
    escapeCsv(lead.assigned_to),
    escapeCsv(lead.source),
    escapeCsv(
      new Date(lead.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    ),
  ].join(",");
}

const CSV_HEADER =
  "Name,Email,Phone,Vehicle Interest,Status,Temperature,Assigned To,Source,Created Date";

/* -------------------------------------------------------------------------- */
/* Sample data (mirrors /api/admin/leads)                                     */
/* -------------------------------------------------------------------------- */

const SAMPLE_LEADS: Lead[] = [
  {
    id: "lead-001", dealer_id: "demo-dealer", first_name: "Marcus", last_name: "Johnson",
    email: "marcus.johnson@email.com", phone: "+15551234567", vehicle_id: null,
    vehicle_interest: "2024 Toyota Camry SE", source: "website_form", status: "new",
    temperature: "hot", notes: "", structured_notes: [], assigned_to: null,
    message: "", follow_up_date: null, activity: [],
    utm_source: "google", utm_medium: "cpc", utm_campaign: "spring-sale",
    referrer_url: "https://www.google.com",
    created_at: "2026-03-24T10:00:00Z", updated_at: "2026-03-24T10:00:00Z",
  },
  {
    id: "lead-002", dealer_id: "demo-dealer", first_name: "Emily", last_name: "Nakamura",
    email: "emily.n@outlook.com", phone: "+15559876543", vehicle_id: null,
    vehicle_interest: "2025 Honda CR-V Hybrid", source: "vdp_inquiry", status: "contacted",
    temperature: "warm", notes: "", structured_notes: [], assigned_to: "Sarah Chen",
    message: "", follow_up_date: null, activity: [],
    utm_source: null, utm_medium: null, utm_campaign: null,
    referrer_url: "https://www.autotrader.com",
    created_at: "2026-03-22T09:00:00Z", updated_at: "2026-03-23T16:00:00Z",
  },
  {
    id: "lead-003", dealer_id: "demo-dealer", first_name: "Robert", last_name: "Garcia",
    email: "rgarcia@gmail.com", phone: "+15554567890", vehicle_id: null,
    vehicle_interest: "2024 Ford F-150 XLT", source: "chat", status: "qualified",
    temperature: "hot", notes: "", structured_notes: [], assigned_to: "James Kowalski",
    message: "", follow_up_date: null, activity: [],
    utm_source: null, utm_medium: null, utm_campaign: null, referrer_url: null,
    created_at: "2026-03-20T15:00:00Z", updated_at: "2026-03-21T11:00:00Z",
  },
  {
    id: "lead-004", dealer_id: "demo-dealer", first_name: "Aisha", last_name: "Williams",
    email: "aisha.w@yahoo.com", phone: null, vehicle_id: null,
    vehicle_interest: "2025 Hyundai Tucson", source: "third_party", status: "appointment_set",
    temperature: "warm", notes: "", structured_notes: [], assigned_to: "Priya Patel",
    message: "", follow_up_date: null, activity: [],
    utm_source: "cars_com", utm_medium: "listing", utm_campaign: null,
    referrer_url: "https://www.cars.com",
    created_at: "2026-03-19T08:00:00Z", updated_at: "2026-03-22T13:00:00Z",
  },
  {
    id: "lead-005", dealer_id: "demo-dealer", first_name: "David", last_name: "Kim",
    email: "david.k@email.com", phone: "+15553456789", vehicle_id: null,
    vehicle_interest: "2023 BMW 3 Series", source: "walk_in", status: "sold",
    temperature: "hot", notes: "", structured_notes: [], assigned_to: "Tom Bradley",
    message: "", follow_up_date: null, activity: [],
    utm_source: null, utm_medium: null, utm_campaign: null, referrer_url: null,
    created_at: "2026-03-15T10:00:00Z", updated_at: "2026-03-18T17:00:00Z",
  },
  {
    id: "lead-006", dealer_id: "demo-dealer", first_name: "Jessica", last_name: "Martinez",
    email: "jmartinez@protonmail.com", phone: "+15552345678", vehicle_id: null,
    vehicle_interest: "2024 Chevrolet Equinox", source: "website_form", status: "lost",
    temperature: "cold", notes: "", structured_notes: [], assigned_to: "Sarah Chen",
    message: "", follow_up_date: null, activity: [],
    utm_source: "google", utm_medium: "organic", utm_campaign: null,
    referrer_url: "https://www.google.com",
    created_at: "2026-03-10T14:00:00Z", updated_at: "2026-03-17T10:00:00Z",
  },
  {
    id: "lead-007", dealer_id: "demo-dealer", first_name: "Tyler", last_name: "Brooks",
    email: "tbrooks@icloud.com", phone: "+15558765432", vehicle_id: null,
    vehicle_interest: "2025 Subaru Outback", source: "phone", status: "new",
    temperature: "cool", notes: "", structured_notes: [], assigned_to: null,
    message: "", follow_up_date: null, activity: [],
    utm_source: null, utm_medium: null, utm_campaign: null, referrer_url: null,
    created_at: "2026-03-25T11:30:00Z", updated_at: "2026-03-25T11:30:00Z",
  },
  {
    id: "lead-008", dealer_id: "demo-dealer", first_name: "Lauren", last_name: "Okafor",
    email: "lauren.okafor@gmail.com", phone: "+15551112233", vehicle_id: null,
    vehicle_interest: "2024 Tesla Model 3", source: "website_form", status: "contacted",
    temperature: "warm", notes: "", structured_notes: [], assigned_to: "Mike Chen",
    message: "", follow_up_date: null, activity: [],
    utm_source: "facebook", utm_medium: "social", utm_campaign: "ev-promo",
    referrer_url: "https://www.facebook.com",
    created_at: "2026-03-23T16:00:00Z", updated_at: "2026-03-24T09:00:00Z",
  },
  {
    id: "lead-009", dealer_id: "demo-dealer", first_name: "Chen", last_name: "Wei",
    email: "chen.wei@outlook.com", phone: "+15554443322", vehicle_id: null,
    vehicle_interest: "2025 Mazda CX-5", source: "vdp_inquiry", status: "new",
    temperature: "warm", notes: "", structured_notes: [], assigned_to: null,
    message: "", follow_up_date: null, activity: [],
    utm_source: null, utm_medium: null, utm_campaign: null, referrer_url: null,
    created_at: "2026-03-25T14:00:00Z", updated_at: "2026-03-25T14:00:00Z",
  },
  {
    id: "lead-010", dealer_id: "demo-dealer", first_name: "Patricia", last_name: "Hernandez",
    email: "p.hernandez@email.com", phone: "+15556667788", vehicle_id: null,
    vehicle_interest: "2024 Kia Telluride SX", source: "chat", status: "qualified",
    temperature: "hot", notes: "", structured_notes: [], assigned_to: "Priya Patel",
    message: "", follow_up_date: null, activity: [],
    utm_source: null, utm_medium: null, utm_campaign: null, referrer_url: null,
    created_at: "2026-03-23T11:00:00Z", updated_at: "2026-03-25T09:00:00Z",
  },
];

const VALID_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "appointment_set", "sold", "lost"];
const VALID_TEMPS: LeadTemperature[] = ["hot", "warm", "cool", "cold"];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/export/leads                                                */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  const { searchParams } = new URL(request.url);

  const statusFilter = searchParams.get("status") as LeadStatus | null;
  const tempFilter = searchParams.get("temperature") as LeadTemperature | null;
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");

  const today = new Date().toISOString().slice(0, 10);

  let leads: Lead[];

  // Try PostgreSQL first
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      const conditions: string[] = ["dealer_id = $1"];
      const params: unknown[] = [dealerId];
      let idx = 2;

      if (statusFilter && VALID_STATUSES.includes(statusFilter)) {
        conditions.push(`status = $${idx++}`);
        params.push(statusFilter);
      }
      if (tempFilter && VALID_TEMPS.includes(tempFilter)) {
        conditions.push(`temperature = $${idx++}`);
        params.push(tempFilter);
      }
      if (dateFrom) {
        conditions.push(`created_at >= $${idx++}::timestamptz`);
        params.push(dateFrom);
      }
      if (dateTo) {
        conditions.push(`created_at <= $${idx++}::timestamptz`);
        params.push(`${dateTo}T23:59:59Z`);
      }

      const where = conditions.join(" AND ");
      const result = await query( /* audit-safe: A4 reason="dealer_id always pushed as first condition above" */
        `SELECT * FROM leads WHERE ${where} ORDER BY created_at DESC`,
        params,
      );
      leads = result.rows as any[];
    } catch (err) {
      console.error("[export/leads] DB query failed, falling back to sample data:", err);
      leads = [...SAMPLE_LEADS];
    }
  } else {
    leads = [...SAMPLE_LEADS];
  }

  // Apply in-memory filters on sample data (DB handles its own)
  if (!process.env.DATABASE_URL) {
    if (statusFilter && VALID_STATUSES.includes(statusFilter)) {
      leads = leads.filter((l) => l.status === statusFilter);
    }
    if (tempFilter && VALID_TEMPS.includes(tempFilter)) {
      leads = leads.filter((l) => l.temperature === tempFilter);
    }
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      leads = leads.filter((l) => new Date(l.created_at).getTime() >= from);
    }
    if (dateTo) {
      const to = new Date(`${dateTo}T23:59:59Z`).getTime();
      leads = leads.filter((l) => new Date(l.created_at).getTime() <= to);
    }
  }

  // Build CSV
  const rows = [CSV_HEADER, ...leads.map(leadToCsvRow)];
  const csv = rows.join("\n");

  trackSystem("system.inventory_exported", dealerId, { table: "leads", count: leads.length });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-export-${today}.csv"`,
    },
  });
}
