import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackService, trackSecurity } from "@/lib/analytics-hooks";
import { getDealerId } from "@/lib/get-dealer-id";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface ROLineItem {
  id: string;
  description: string;
  labor_hours: number;
  labor_rate: number;
  parts_cost: number;
  line_total: number;
}

export interface RepairOrder {
  id: string;
  ro_number: string;
  dealer_id: string;
  appointment_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  vin: string;
  odometer: number;
  status: "open" | "in_progress" | "waiting_parts" | "waiting_approval" | "completed" | "invoiced" | "closed";
  advisor: string;
  technician: string;
  line_items: ROLineItem[];
  labor_total: number;
  parts_total: number;
  tax: number;
  grand_total: number;
  customer_concern: string;
  diagnosis: string;
  recommendations: string;
  promised_date: string | null;
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Shadow mock data                                                           */
/* -------------------------------------------------------------------------- */

const MOCK_ROS: RepairOrder[] = [
  {
    id: "ro-001",
    ro_number: "RO-2026-0347",
    dealer_id: "demo-dealer",
    appointment_id: "appt-003",
    customer_name: "Robert Garcia",
    customer_phone: "+15554567890",
    customer_email: "rgarcia@gmail.com",
    vehicle_year: 2021,
    vehicle_make: "Ford",
    vehicle_model: "F-150 XLT",
    vin: "1FTEW1EP3MFA78901",
    odometer: 47832,
    status: "waiting_approval",
    advisor: "Mike Reynolds",
    technician: "Carlos Rivera",
    line_items: [
      {
        id: "li-001",
        description: "Diagnostic — check engine light P0420",
        labor_hours: 1.0,
        labor_rate: 145.00,
        parts_cost: 0,
        line_total: 145.00,
      },
      {
        id: "li-002",
        description: "Catalytic converter replacement (driver side)",
        labor_hours: 2.5,
        labor_rate: 145.00,
        parts_cost: 892.50,
        line_total: 1255.00,
      },
    ],
    labor_total: 507.50,
    parts_total: 892.50,
    tax: 112.00,
    grand_total: 1512.00,
    customer_concern: "Check engine light has been on for 2 weeks. Slight smell of sulfur.",
    diagnosis: "Code P0420 — catalyst system efficiency below threshold. Downstream O2 readings confirm failed cat on bank 1.",
    recommendations: "Replace driver-side catalytic converter. Recommend also replacing O2 sensor ($85 + 0.5hr labor) as preventive.",
    promised_date: "2026-03-30",
    created_at: "2026-03-28T10:50:00Z",
    updated_at: "2026-03-28T12:15:00Z",
  },
  {
    id: "ro-002",
    ro_number: "RO-2026-0346",
    dealer_id: "demo-dealer",
    appointment_id: "appt-002",
    customer_name: "Emily Nakamura",
    customer_phone: "+15559876543",
    customer_email: "emily.n@outlook.com",
    vehicle_year: 2023,
    vehicle_make: "Honda",
    vehicle_model: "CR-V Hybrid",
    vin: "7FARW2H93PE045678",
    odometer: 22145,
    status: "in_progress",
    advisor: "Sarah Chen",
    technician: "Derek Washington",
    line_items: [
      {
        id: "li-003",
        description: "Front brake pad replacement (ceramic)",
        labor_hours: 1.5,
        labor_rate: 135.00,
        parts_cost: 124.99,
        line_total: 327.49,
      },
      {
        id: "li-004",
        description: "Front rotor resurfacing (pair)",
        labor_hours: 0.5,
        labor_rate: 135.00,
        parts_cost: 0,
        line_total: 67.50,
      },
    ],
    labor_total: 270.00,
    parts_total: 124.99,
    tax: 31.60,
    grand_total: 426.59,
    customer_concern: "Squealing noise from front brakes, especially at low speed.",
    diagnosis: "Front pads worn to 2mm. Rotors within spec but have light scoring — resurfacing recommended.",
    recommendations: "Rear pads at 5mm — suggest replacing within next 10,000 miles.",
    promised_date: "2026-03-28",
    created_at: "2026-03-28T09:10:00Z",
    updated_at: "2026-03-28T11:00:00Z",
  },
  {
    id: "ro-003",
    ro_number: "RO-2026-0345",
    dealer_id: "demo-dealer",
    appointment_id: null,
    customer_name: "James Kowalski",
    customer_phone: "+15553344556",
    customer_email: "j.kowalski@email.com",
    vehicle_year: 2020,
    vehicle_make: "Chevrolet",
    vehicle_model: "Silverado 1500",
    vin: "3GCUYDED4LG567890",
    odometer: 61284,
    status: "completed",
    advisor: "Mike Reynolds",
    technician: "Maria Santos",
    line_items: [
      {
        id: "li-005",
        description: "Transmission fluid flush and fill",
        labor_hours: 1.0,
        labor_rate: 145.00,
        parts_cost: 89.99,
        line_total: 234.99,
      },
      {
        id: "li-006",
        description: "Transmission filter replacement",
        labor_hours: 0.5,
        labor_rate: 145.00,
        parts_cost: 42.50,
        line_total: 115.00,
      },
      {
        id: "li-007",
        description: "Multi-point inspection",
        labor_hours: 0.5,
        labor_rate: 145.00,
        parts_cost: 0,
        line_total: 72.50,
      },
    ],
    labor_total: 290.00,
    parts_total: 132.49,
    tax: 33.80,
    grand_total: 456.29,
    customer_concern: "Rough shifting between 2nd and 3rd gear.",
    diagnosis: "Transmission fluid dark and burnt. Filter partially clogged. Flush resolved shifting issue on test drive.",
    recommendations: "Schedule next trans service at 90,000 miles. Monitor shifting for any recurrence.",
    promised_date: "2026-03-27",
    created_at: "2026-03-27T08:30:00Z",
    updated_at: "2026-03-27T15:00:00Z",
  },
  {
    id: "ro-004",
    ro_number: "RO-2026-0344",
    dealer_id: "demo-dealer",
    appointment_id: null,
    customer_name: "Lauren Okafor",
    customer_phone: "+15551112233",
    customer_email: "lauren.okafor@gmail.com",
    vehicle_year: 2022,
    vehicle_make: "Tesla",
    vehicle_model: "Model 3",
    vin: "5YJ3E1EA1NF345678",
    odometer: 34500,
    status: "open",
    advisor: "James Kowalski",
    technician: "Carlos Rivera",
    line_items: [
      {
        id: "li-008",
        description: "Cabin air filter replacement (HEPA)",
        labor_hours: 0.3,
        labor_rate: 135.00,
        parts_cost: 58.00,
        line_total: 98.50,
      },
      {
        id: "li-009",
        description: "Tire rotation and balance",
        labor_hours: 0.5,
        labor_rate: 135.00,
        parts_cost: 0,
        line_total: 67.50,
      },
      {
        id: "li-010",
        description: "Brake fluid test and top-off",
        labor_hours: 0.2,
        labor_rate: 135.00,
        parts_cost: 12.00,
        line_total: 39.00,
      },
    ],
    labor_total: 135.00,
    parts_total: 70.00,
    tax: 16.40,
    grand_total: 221.40,
    customer_concern: "Annual maintenance visit. No specific complaints.",
    diagnosis: "Cabin filter due for replacement. Tires show uneven wear — rotation recommended. Brake fluid within spec.",
    recommendations: "All good. Next service at 45,000 miles or 12 months.",
    promised_date: "2026-03-28",
    created_at: "2026-03-28T07:45:00Z",
    updated_at: "2026-03-28T07:45:00Z",
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/service/repair-orders                                       */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status") as RepairOrder["status"] | null;
  const dateFilter = searchParams.get("date");

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const conditions: string[] = ["dealer_id = $1"];
      const params: unknown[] = [dealerId];
      let idx = 2;

      if (statusFilter) {
        conditions.push(`status = $${idx++}`);
        params.push(statusFilter);
      }
      if (dateFilter) {
        conditions.push(`created_at::date = $${idx++}`);
        params.push(dateFilter);
      }

      const result = await query(
        `SELECT * FROM repair_orders
         WHERE ${conditions.join(" AND ")}
         ORDER BY created_at DESC
         LIMIT 200`,
        params,
      );

      return NextResponse.json({ repair_orders: result.rows });
    } catch (err) {
      console.error("[api/admin/service/repair-orders] DB error, falling back:", err);
    }
  }

  // Shadow mode
  let filtered = [...MOCK_ROS];
  if (statusFilter) {
    filtered = filtered.filter((ro) => ro.status === statusFilter);
  }
  if (dateFilter) {
    filtered = filtered.filter((ro) => ro.created_at.startsWith(dateFilter));
  }

  return NextResponse.json({ repair_orders: filtered });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/service/repair-orders                                      */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);
  const { user } = authResult;

  const rl = await checkRateLimit(`repair-orders:${authResult.user.dealer_id}`, 10, 60);
  if (!rl.allowed) {
    try { trackSecurity("security.rate_limit_triggered", authResult.user.dealer_id, { route: "repair-orders", remaining: 0 }); } catch {}
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: Partial<RepairOrder>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.customer_name || !body.vin) {
    return NextResponse.json(
      { error: "customer_name and vin are required" },
      { status: 400 },
    );
  }

  const newId = `ro-${Date.now()}`;
  const roNum = `RO-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const now = new Date().toISOString();

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      await query(
        `INSERT INTO repair_orders
           (id, ro_number, dealer_id, appointment_id, customer_name, customer_phone,
            customer_email, vehicle_year, vehicle_make, vehicle_model, vin, odometer,
            status, advisor, technician, line_items, labor_total, parts_total, tax,
            grand_total, customer_concern, diagnosis, recommendations, promised_date,
            created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'open',$13,$14,$15,0,0,0,0,$16,'','',NULL,$17,$17)`,
        [
          newId, roNum, dealerId,
          body.appointment_id ?? null,
          body.customer_name, body.customer_phone ?? "", body.customer_email ?? "",
          body.vehicle_year ?? null, body.vehicle_make ?? "", body.vehicle_model ?? "",
          body.vin, body.odometer ?? 0,
          body.advisor ?? user.name ?? user.email,
          body.technician ?? "",
          JSON.stringify(body.line_items ?? []),
          body.customer_concern ?? "",
          now,
        ],
      );

      try { trackService("service.ro_created", dealerId, { vehicle_vin: String(body.vin), line_item_count: (body.line_items ?? []).length }); } catch {}

      return NextResponse.json({ success: true, id: newId, ro_number: roNum });
    } catch (err) {
      console.error("[api/admin/service/repair-orders] POST DB error:", err);
    }
  }

  try { trackService("service.ro_created", dealerId, { vehicle_vin: String(body.vin), line_item_count: (body.line_items ?? []).length }); } catch {}

  // Shadow mode
  return NextResponse.json({ success: true, id: newId, ro_number: roNum, mode: "shadow" });
}
