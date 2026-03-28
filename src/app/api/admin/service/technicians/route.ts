import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface Technician {
  id: string;
  dealer_id: string;
  name: string;
  employee_id: string;
  specialties: string[];
  certifications: string[];
  hourly_rate: number;
  status: "available" | "busy" | "off";
  phone: string;
  hire_date: string;
  active_ro_count: number;
}

/* -------------------------------------------------------------------------- */
/* Shadow mock data                                                           */
/* -------------------------------------------------------------------------- */

const MOCK_TECHNICIANS: Technician[] = [
  {
    id: "tech-001",
    dealer_id: "demo-dealer",
    name: "Carlos Rivera",
    employee_id: "EMP-204",
    specialties: ["Engine Diagnostics", "Emissions", "Electrical Systems"],
    certifications: ["ASE Master Technician", "ASE L1 Advanced Engine Performance", "Ford STARS Certified"],
    hourly_rate: 145.00,
    status: "busy",
    phone: "+15551001001",
    hire_date: "2019-06-15",
    active_ro_count: 2,
  },
  {
    id: "tech-002",
    dealer_id: "demo-dealer",
    name: "Derek Washington",
    employee_id: "EMP-218",
    specialties: ["Brakes", "Suspension", "Alignment", "Tires"],
    certifications: ["ASE Certified — Brakes (A5)", "ASE Certified — Suspension & Steering (A4)", "Hunter Alignment Certified"],
    hourly_rate: 135.00,
    status: "busy",
    phone: "+15551002002",
    hire_date: "2021-02-01",
    active_ro_count: 1,
  },
  {
    id: "tech-003",
    dealer_id: "demo-dealer",
    name: "Maria Santos",
    employee_id: "EMP-231",
    specialties: ["General Maintenance", "Transmission", "Fluid Services"],
    certifications: ["ASE Certified — Automatic Transmission (A2)", "ASE Certified — Engine Repair (A1)", "Toyota T-TEN Graduate"],
    hourly_rate: 130.00,
    status: "available",
    phone: "+15551003003",
    hire_date: "2022-08-20",
    active_ro_count: 0,
  },
  {
    id: "tech-004",
    dealer_id: "demo-dealer",
    name: "Tommy Nguyen",
    employee_id: "EMP-245",
    specialties: ["Oil Changes", "Tire Rotation", "Multi-Point Inspections", "Recalls"],
    certifications: ["ASE Certified — Maintenance & Light Repair (G1)", "EPA 608 Universal"],
    hourly_rate: 95.00,
    status: "off",
    phone: "+15551004004",
    hire_date: "2024-01-10",
    active_ro_count: 0,
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/service/technicians                                         */
/* -------------------------------------------------------------------------- */

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `SELECT t.*,
                COALESCE(
                  (SELECT COUNT(*) FROM repair_orders ro
                   WHERE ro.technician = t.name
                     AND ro.status IN ('open','in_progress','waiting_parts','waiting_approval')
                     AND ro.dealer_id = t.dealer_id), 0
                )::int AS active_ro_count
         FROM service_technicians t
         WHERE t.dealer_id = $1
         ORDER BY t.name ASC`,
        [dealerId],
      );

      return NextResponse.json({ technicians: result.rows });
    } catch (err) {
      console.error("[api/admin/service/technicians] DB error, falling back:", err);
    }
  }

  // Shadow mode
  return NextResponse.json({ technicians: MOCK_TECHNICIANS });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/service/technicians                                        */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  let body: Partial<Technician>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const newId = `tech-${Date.now()}`;

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      await query(
        `INSERT INTO service_technicians
           (id, dealer_id, name, employee_id, specialties, certifications,
            hourly_rate, status, phone, hire_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'available',$8,$9)`,
        [
          newId, dealerId,
          body.name, body.employee_id ?? "",
          JSON.stringify(body.specialties ?? []),
          JSON.stringify(body.certifications ?? []),
          body.hourly_rate ?? 100.00,
          body.phone ?? "",
          body.hire_date ?? new Date().toISOString().split("T")[0],
        ],
      );

      return NextResponse.json({ success: true, id: newId });
    } catch (err) {
      console.error("[api/admin/service/technicians] POST DB error:", err);
    }
  }

  // Shadow mode
  return NextResponse.json({ success: true, id: newId, mode: "shadow" });
}

/* -------------------------------------------------------------------------- */
/* PATCH /api/admin/service/technicians (status toggle)                       */
/* -------------------------------------------------------------------------- */

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  let body: { id: string; status: "available" | "busy" | "off" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.id || !["available", "busy", "off"].includes(body.status)) {
    return NextResponse.json({ error: "id and valid status required" }, { status: 400 });
  }

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      await query(
        `UPDATE service_technicians SET status = $1 WHERE id = $2 AND dealer_id = $3`,
        [body.status, body.id, dealerId],
      );
      return NextResponse.json({ success: true });
    } catch (err) {
      console.error("[api/admin/service/technicians] PATCH DB error:", err);
    }
  }

  // Shadow mode
  return NextResponse.json({ success: true, mode: "shadow" });
}
