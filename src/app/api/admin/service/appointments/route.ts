import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackService, trackSecurity } from "@/lib/analytics-hooks";

const DEALER_ID = process.env.DEALER_ID ?? "default";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface ServiceAppointment {
  id: string;
  dealer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  vin: string;
  service_type: "oil_change" | "brake_service" | "tire_rotation" | "diagnostic" | "scheduled_maintenance" | "repair" | "recall" | "inspection" | "other";
  description: string;
  scheduled_date: string;
  scheduled_time: string;
  estimated_duration_min: number;
  status: "scheduled" | "checked_in" | "in_progress" | "completed" | "cancelled" | "no_show";
  assigned_technician: string | null;
  advisor: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Shadow mock data                                                           */
/* -------------------------------------------------------------------------- */

const MOCK_APPOINTMENTS: ServiceAppointment[] = [
  {
    id: "appt-001",
    dealer_id: DEALER_ID,
    customer_name: "Marcus Johnson",
    customer_phone: "+15551234567",
    customer_email: "marcus.johnson@email.com",
    vehicle_year: 2022,
    vehicle_make: "Toyota",
    vehicle_model: "Camry SE",
    vin: "4T1BF1FK5NU123456",
    service_type: "oil_change",
    description: "Synthetic oil change and multi-point inspection",
    scheduled_date: "2026-03-28",
    scheduled_time: "08:30",
    estimated_duration_min: 45,
    status: "scheduled",
    assigned_technician: "Carlos Rivera",
    advisor: "Mike Reynolds",
    notes: "Customer prefers Mobil 1 synthetic",
    created_at: "2026-03-25T10:00:00Z",
    updated_at: "2026-03-25T10:00:00Z",
  },
  {
    id: "appt-002",
    dealer_id: DEALER_ID,
    customer_name: "Emily Nakamura",
    customer_phone: "+15559876543",
    customer_email: "emily.n@outlook.com",
    vehicle_year: 2023,
    vehicle_make: "Honda",
    vehicle_model: "CR-V Hybrid",
    vin: "7FARW2H93PE045678",
    service_type: "brake_service",
    description: "Front brake pad replacement and rotor resurfacing",
    scheduled_date: "2026-03-28",
    scheduled_time: "09:00",
    estimated_duration_min: 120,
    status: "checked_in",
    assigned_technician: "Derek Washington",
    advisor: "Sarah Chen",
    notes: "Squealing noise when braking — customer reported 2 weeks ago",
    created_at: "2026-03-24T14:00:00Z",
    updated_at: "2026-03-28T08:55:00Z",
  },
  {
    id: "appt-003",
    dealer_id: DEALER_ID,
    customer_name: "Robert Garcia",
    customer_phone: "+15554567890",
    customer_email: "rgarcia@gmail.com",
    vehicle_year: 2021,
    vehicle_make: "Ford",
    vehicle_model: "F-150 XLT",
    vin: "1FTEW1EP3MFA78901",
    service_type: "diagnostic",
    description: "Check engine light on — P0420 catalyst efficiency below threshold",
    scheduled_date: "2026-03-28",
    scheduled_time: "10:30",
    estimated_duration_min: 90,
    status: "in_progress",
    assigned_technician: "Carlos Rivera",
    advisor: "Mike Reynolds",
    notes: "May need catalytic converter replacement. Get customer approval before ordering part.",
    created_at: "2026-03-26T09:00:00Z",
    updated_at: "2026-03-28T10:45:00Z",
  },
  {
    id: "appt-004",
    dealer_id: DEALER_ID,
    customer_name: "Aisha Williams",
    customer_phone: "+15553456789",
    customer_email: "aisha.w@yahoo.com",
    vehicle_year: 2024,
    vehicle_make: "Hyundai",
    vehicle_model: "Tucson SEL",
    vin: "5NMS3DAJ4RH234567",
    service_type: "scheduled_maintenance",
    description: "15,000 mile service — oil change, tire rotation, cabin filter, inspection",
    scheduled_date: "2026-03-28",
    scheduled_time: "13:00",
    estimated_duration_min: 90,
    status: "scheduled",
    assigned_technician: "Maria Santos",
    advisor: "James Kowalski",
    notes: "First service at our dealership. New customer — great experience priority.",
    created_at: "2026-03-27T11:00:00Z",
    updated_at: "2026-03-27T11:00:00Z",
  },
  {
    id: "appt-005",
    dealer_id: DEALER_ID,
    customer_name: "David Kim",
    customer_phone: "+15558765432",
    customer_email: "david.k@email.com",
    vehicle_year: 2020,
    vehicle_make: "BMW",
    vehicle_model: "330i",
    vin: "WBA5R1C08LFJ56789",
    service_type: "tire_rotation",
    description: "Tire rotation and balance, check alignment",
    scheduled_date: "2026-03-28",
    scheduled_time: "14:30",
    estimated_duration_min: 60,
    status: "scheduled",
    assigned_technician: "Derek Washington",
    advisor: "Sarah Chen",
    notes: "Customer noticed slight pull to the right",
    created_at: "2026-03-26T16:00:00Z",
    updated_at: "2026-03-26T16:00:00Z",
  },
  {
    id: "appt-006",
    dealer_id: DEALER_ID,
    customer_name: "Patricia Hernandez",
    customer_phone: "+15556667788",
    customer_email: "p.hernandez@email.com",
    vehicle_year: 2019,
    vehicle_make: "Kia",
    vehicle_model: "Telluride SX",
    vin: "5XYP6DHC5KG890123",
    service_type: "recall",
    description: "Safety recall SC214 — headlight module connector replacement",
    scheduled_date: "2026-03-29",
    scheduled_time: "09:00",
    estimated_duration_min: 60,
    status: "scheduled",
    assigned_technician: null,
    advisor: "Priya Patel",
    notes: "Recall part confirmed in stock. No charge to customer.",
    created_at: "2026-03-27T15:00:00Z",
    updated_at: "2026-03-27T15:00:00Z",
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/service/appointments                                        */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { searchParams } = new URL(request.url);
  const dateFilter = searchParams.get("date");
  const statusFilter = searchParams.get("status") as ServiceAppointment["status"] | null;
  const techFilter = searchParams.get("technician");

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const conditions: string[] = ["dealer_id = $1"];
      const params: unknown[] = [DEALER_ID];
      let idx = 2;

      if (dateFilter) {
        conditions.push(`scheduled_date = $${idx++}`);
        params.push(dateFilter);
      }
      if (statusFilter) {
        conditions.push(`status = $${idx++}`);
        params.push(statusFilter);
      }
      if (techFilter) {
        conditions.push(`assigned_technician = $${idx++}`);
        params.push(techFilter);
      }

      const result = await query(
        `SELECT * FROM service_appointments
         WHERE ${conditions.join(" AND ")}
         ORDER BY scheduled_date ASC, scheduled_time ASC
         LIMIT 200`,
        params,
      );

      return NextResponse.json({ appointments: result.rows });
    } catch (err) {
      console.error("[api/admin/service/appointments] DB error, falling back:", err);
    }
  }

  // Shadow mode: filter mock data
  let filtered = [...MOCK_APPOINTMENTS];

  if (dateFilter) {
    filtered = filtered.filter((a) => a.scheduled_date === dateFilter);
  }
  if (statusFilter) {
    filtered = filtered.filter((a) => a.status === statusFilter);
  }
  if (techFilter) {
    filtered = filtered.filter((a) => a.assigned_technician === techFilter);
  }

  return NextResponse.json({ appointments: filtered });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/service/appointments                                       */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const { user } = authResult;

  const rl = await checkRateLimit(`service-appts:${authResult.user.dealer_id}`, 20, 60);
  if (!rl.allowed) {
    try { trackSecurity("security.rate_limit_triggered", authResult.user.dealer_id, { route: "service-appointments", remaining: 0 }); } catch {}
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: Partial<ServiceAppointment>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.customer_name || !body.scheduled_date || !body.scheduled_time) {
    return NextResponse.json(
      { error: "customer_name, scheduled_date, and scheduled_time are required" },
      { status: 400 },
    );
  }

  const newId = `appt-${Date.now()}`;
  const now = new Date().toISOString();

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      await query(
        `INSERT INTO service_appointments
           (id, dealer_id, customer_name, customer_phone, customer_email,
            vehicle_year, vehicle_make, vehicle_model, vin,
            service_type, description, scheduled_date, scheduled_time,
            estimated_duration_min, status, assigned_technician, advisor, notes,
            created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'scheduled',$15,$16,$17,$18,$18)`,
        [
          newId, DEALER_ID,
          body.customer_name, body.customer_phone ?? "", body.customer_email ?? "",
          body.vehicle_year ?? null, body.vehicle_make ?? "", body.vehicle_model ?? "", body.vin ?? "",
          body.service_type ?? "other", body.description ?? "",
          body.scheduled_date, body.scheduled_time,
          body.estimated_duration_min ?? 60,
          body.assigned_technician ?? null,
          body.advisor ?? user.name ?? user.email,
          body.notes ?? "",
          now,
        ],
      );

      try { trackService("service.appointment_created", DEALER_ID, { service_type: String(body.service_type ?? "other"), vehicle_vin: String(body.vin ?? "") }); } catch {}

      return NextResponse.json({ success: true, id: newId });
    } catch (err) {
      console.error("[api/admin/service/appointments] POST DB error:", err);
    }
  }

  try { trackService("service.appointment_created", DEALER_ID, { service_type: String(body.service_type ?? "other"), vehicle_vin: String(body.vin ?? "") }); } catch {}

  // Shadow mode
  return NextResponse.json({ success: true, id: newId, mode: "shadow" });
}
