import { NextRequest, NextResponse } from "next/server";

/* -------------------------------------------------------------------------- */
/* GET /api/service/schedule/slots — available time slots for a date          */
/* -------------------------------------------------------------------------- */

interface Slot {
  id: string;
  date: string;
  time: string;
  available: boolean;
  service_types: string[];
}

const SERVICE_TYPES = ["maintenance", "repair", "recall", "inspection", "detail"];

function generateSlotsForDate(date: string, serviceType?: string): Slot[] {
  const hours = [9, 10, 11, 12, 13, 14, 15, 16];
  // Deterministic "taken" slots based on date hash
  const dateNum = date.split("-").reduce((a, b) => a + parseInt(b, 10), 0);

  return hours.map((hour, i) => {
    const taken = (dateNum + i) % 5 === 0 || (dateNum + i) % 7 === 0;
    const timeStr = `${hour.toString().padStart(2, "0")}:00`;
    const slot: Slot = {
      id: `slot-${date}-${timeStr.replace(":", "")}`,
      date,
      time: timeStr,
      available: !taken,
      service_types: SERVICE_TYPES,
    };
    return slot;
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const date = searchParams.get("date");
  const serviceType = searchParams.get("service_type") ?? undefined;

  if (!date) {
    return NextResponse.json({ error: "date query parameter is required (YYYY-MM-DD)" }, { status: 422 });
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be in YYYY-MM-DD format" }, { status: 422 });
  }

  // Database path
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      // Check existing appointments to mark slots as taken
      const result = await query(
        `SELECT appointment_time FROM service_appointments
         WHERE appointment_date = $1 AND status != 'cancelled'`,
        [date],
      );
      const takenTimes = new Set((result.rows as any[]).map((r: any) => r.appointment_time));

      const hours = [9, 10, 11, 12, 13, 14, 15, 16];
      const slots = hours.map((hour) => {
        const timeStr = `${hour.toString().padStart(2, "0")}:00`;
        return {
          id: `slot-${date}-${timeStr.replace(":", "")}`,
          date,
          time: timeStr,
          available: !takenTimes.has(timeStr),
          service_types: SERVICE_TYPES,
        };
      });

      return NextResponse.json({ slots });
    } catch (err) {
      console.error("[api/service/schedule/slots] DB error:", err);
      // Fall through to mock
    }
  }

  // Shadow mode
  const slots = generateSlotsForDate(date, serviceType);

  return NextResponse.json({ slots });
}
