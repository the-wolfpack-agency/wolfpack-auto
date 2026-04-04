import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackService } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface ServiceHistoryRecord {
  id: string;
  ro_number: string;
  date: string;
  odometer: number;
  service_type: string;
  description: string;
  technician: string;
  labor_total: number;
  parts_total: number;
  grand_total: number;
  status: string;
}

/* -------------------------------------------------------------------------- */
/* Shadow mock data                                                           */
/* -------------------------------------------------------------------------- */

const MOCK_HISTORY: Record<string, ServiceHistoryRecord[]> = {
  "1FTEW1EP3MFA78901": [
    {
      id: "hist-001",
      ro_number: "RO-2025-0189",
      date: "2025-09-15",
      odometer: 38210,
      service_type: "Scheduled Maintenance",
      description: "30,000 mile service — oil change, tire rotation, brake inspection, cabin filter, transmission fluid check",
      technician: "Carlos Rivera",
      labor_total: 225.00,
      parts_total: 87.50,
      grand_total: 337.72,
      status: "closed",
    },
    {
      id: "hist-002",
      ro_number: "RO-2025-0098",
      date: "2025-04-22",
      odometer: 29850,
      service_type: "Oil Change",
      description: "Synthetic oil change and multi-point inspection. Noted front brake pads at 6mm.",
      technician: "Maria Santos",
      labor_total: 72.50,
      parts_total: 38.99,
      grand_total: 120.57,
      status: "closed",
    },
    {
      id: "hist-003",
      ro_number: "RO-2024-0412",
      date: "2024-11-08",
      odometer: 21430,
      service_type: "Tire Replacement",
      description: "Replaced all 4 tires — BFGoodrich All-Terrain T/A KO2 275/65R18. Alignment performed.",
      technician: "Derek Washington",
      labor_total: 160.00,
      parts_total: 896.00,
      grand_total: 1148.48,
      status: "closed",
    },
  ],
};

// Default fallback for any VIN not in the map
const DEFAULT_HISTORY: ServiceHistoryRecord[] = [
  {
    id: "hist-def-001",
    ro_number: "RO-2025-0250",
    date: "2025-11-12",
    odometer: 15200,
    service_type: "Oil Change",
    description: "Synthetic oil change and multi-point inspection",
    technician: "Maria Santos",
    labor_total: 72.50,
    parts_total: 38.99,
    grand_total: 120.57,
    status: "closed",
  },
  {
    id: "hist-def-002",
    ro_number: "RO-2025-0115",
    date: "2025-06-03",
    odometer: 8400,
    service_type: "Tire Rotation",
    description: "Tire rotation and brake inspection. All within spec.",
    technician: "Tommy Nguyen",
    labor_total: 45.00,
    parts_total: 0,
    grand_total: 48.60,
    status: "closed",
  },
  {
    id: "hist-def-003",
    ro_number: "RO-2024-0480",
    date: "2024-12-20",
    odometer: 3100,
    service_type: "First Service",
    description: "Complimentary first oil change and inspection. No issues found.",
    technician: "Maria Santos",
    labor_total: 0,
    parts_total: 0,
    grand_total: 0,
    status: "closed",
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/service/history/[vin]                                       */
/* -------------------------------------------------------------------------- */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ vin: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  const { vin } = await params;

  if (!vin || vin.length < 11) {
    return NextResponse.json({ error: "Valid VIN required" }, { status: 400 });
  }

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `SELECT ro.id, ro.ro_number, ro.created_at::date AS date, ro.odometer,
                ro.customer_concern AS service_type, ro.diagnosis AS description,
                ro.technician, ro.labor_total, ro.parts_total, ro.grand_total, ro.status
         FROM repair_orders ro
         WHERE ro.vin = $1 AND ro.dealer_id = $2
         ORDER BY ro.created_at DESC
         LIMIT 50`,
        [vin.toUpperCase(), dealerId],
      );

      trackService("service.ro_completed", dealerId, { vin: vin.toUpperCase(), count: (result.rows as unknown[]).length });
      return NextResponse.json({ vin: vin.toUpperCase(), history: result.rows });
    } catch (err) {
      console.error("[api/admin/service/history/[vin]] DB error, falling back:", err);
    }
  }

  // Shadow mode
  const history = MOCK_HISTORY[vin.toUpperCase()] ?? DEFAULT_HISTORY;
  trackService("service.ro_completed", dealerId, { vin: vin.toUpperCase(), count: history.length, shadow: true });
  return NextResponse.json({ vin: vin.toUpperCase(), history });
}
