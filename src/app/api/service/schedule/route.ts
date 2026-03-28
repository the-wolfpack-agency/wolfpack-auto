import { NextRequest, NextResponse } from "next/server";
import { trackService } from "@/lib/analytics-hooks";

const DEALER_ID = process.env.DEALER_ID ?? "default";

/* -------------------------------------------------------------------------- */
/* Shadow mock — upcoming 7 days of slots                                     */
/* -------------------------------------------------------------------------- */

function generateWeekSlots(): { date: string; available_count: number; total: number }[] {
  const days: { date: string; available_count: number; total: number }[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayOfWeek = d.getDay();
    // Weekends have fewer slots
    const total = dayOfWeek === 0 ? 0 : dayOfWeek === 6 ? 4 : 8;
    const taken = Math.floor((d.getDate() + i) % 4);
    days.push({ date: dateStr, available_count: Math.max(0, total - taken), total });
  }
  return days;
}

/* -------------------------------------------------------------------------- */
/* GET /api/service/schedule — available slot overview for 7 days             */
/* -------------------------------------------------------------------------- */

export async function GET() {
  // No auth required — public-facing

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `SELECT appointment_date::text AS date, COUNT(*)::int AS booked
         FROM service_appointments
         WHERE appointment_date >= CURRENT_DATE
           AND appointment_date < CURRENT_DATE + INTERVAL '7 days'
           AND status != 'cancelled'
         GROUP BY appointment_date
         ORDER BY appointment_date`,
        [],
      );
      const bookedMap = new Map((result.rows as any[]).map((r: any) => [r.date, r.booked]));
      const days = [];
      const now = new Date();
      for (let i = 0; i < 7; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().slice(0, 10);
        const dayOfWeek = d.getDay();
        const total = dayOfWeek === 0 ? 0 : dayOfWeek === 6 ? 4 : 8;
        const booked = bookedMap.get(dateStr) ?? 0;
        days.push({ date: dateStr, available_count: Math.max(0, total - booked), total });
      }
      return NextResponse.json({ days });
    } catch (err) {
      console.error("[api/service/schedule] DB error:", err);
      // Fall through to mock
    }
  }

  // Shadow mode
  return NextResponse.json({ days: generateWeekSlots() });
}

/* -------------------------------------------------------------------------- */
/* POST /api/service/schedule — book an appointment                           */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  // No auth required — public-facing

  let body: {
    customer_name?: string;
    email?: string;
    phone?: string;
    vehicle_vin?: string;
    vehicle_desc?: string;
    service_type?: string;
    slot_id?: string;
    notes?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.customer_name || !body.email || !body.service_type || !body.slot_id) {
    return NextResponse.json(
      { error: "customer_name, email, service_type, and slot_id are required" },
      { status: 422 },
    );
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 422 });
  }

  // Parse slot_id to get date and time (format: slot-YYYY-MM-DD-HHMM)
  const slotParts = body.slot_id.match(/^slot-(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})$/);
  if (!slotParts) {
    return NextResponse.json({ error: "Invalid slot_id format" }, { status: 422 });
  }
  const appointmentDate = slotParts[1];
  const appointmentTime = `${slotParts[2]}:${slotParts[3]}`;

  const id = `sa-${Date.now().toString(36)}`;

  // Analytics (fire-and-forget)
  try {
    trackService("service.self_scheduled", DEALER_ID, {
      service_type: body.service_type,
      appointment_date: appointmentDate,
    });
  } catch { /* swallow */ }

  // Database path
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `INSERT INTO service_appointments
         (id, dealer_id, customer_name, email, phone, vehicle_vin, vehicle_desc, service_type, appointment_date, appointment_time, notes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'scheduled')
         RETURNING *`,
        [
          id, DEALER_ID, body.customer_name, body.email,
          body.phone ?? null, body.vehicle_vin ?? null,
          body.vehicle_desc ?? null, body.service_type,
          appointmentDate, appointmentTime, body.notes ?? null,
        ],
      );
      return NextResponse.json({ appointment: result.rows[0] }, { status: 201 });
    } catch (err) {
      console.error("[api/service/schedule] DB insert error:", err);
      // Fall through to mock
    }
  }

  // Shadow mode response
  const appointment = {
    id,
    dealer_id: DEALER_ID,
    customer_name: body.customer_name,
    email: body.email,
    phone: body.phone ?? null,
    vehicle_vin: body.vehicle_vin ?? null,
    vehicle_desc: body.vehicle_desc ?? null,
    service_type: body.service_type,
    appointment_date: appointmentDate,
    appointment_time: appointmentTime,
    notes: body.notes ?? null,
    status: "scheduled",
    created_at: new Date().toISOString(),
  };

  return NextResponse.json({ appointment }, { status: 201 });
}
