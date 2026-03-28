import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface CustomerListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: "active" | "prospect" | "inactive";
  vehicles_owned: number;
  last_interaction: string;
  lifetime_value: number;
}

/* -------------------------------------------------------------------------- */
/* Shadow / mock data                                                          */
/* -------------------------------------------------------------------------- */

const MOCK_CUSTOMERS: CustomerListItem[] = [
  {
    id: "cust-042",
    name: "Sarah Johnson",
    email: "sarah.johnson@email.com",
    phone: "(555) 234-5678",
    status: "active",
    vehicles_owned: 2,
    last_interaction: "2026-03-27",
    lifetime_value: 52250,
  },
  {
    id: "cust-039",
    name: "David Park",
    email: "david.park@email.com",
    phone: "(555) 345-6789",
    status: "active",
    vehicles_owned: 1,
    last_interaction: "2026-03-27",
    lifetime_value: 34900,
  },
  {
    id: "cust-031",
    name: "Michael Chen",
    email: "michael.chen@company.com",
    phone: "(555) 456-7890",
    status: "active",
    vehicles_owned: 1,
    last_interaction: "2026-03-26",
    lifetime_value: 48750,
  },
  {
    id: "cust-044",
    name: "Jennifer Williams",
    email: "jen.williams@email.com",
    phone: "(555) 567-8901",
    status: "active",
    vehicles_owned: 1,
    last_interaction: "2026-03-25",
    lifetime_value: 32100,
  },
  {
    id: "cust-028",
    name: "Robert Garcia",
    email: "robert.garcia@email.com",
    phone: "(555) 678-9012",
    status: "active",
    vehicles_owned: 1,
    last_interaction: "2026-03-24",
    lifetime_value: 28900,
  },
  {
    id: "cust-048",
    name: "Amanda Torres",
    email: "amanda.torres@email.com",
    phone: "(555) 789-0123",
    status: "active",
    vehicles_owned: 1,
    last_interaction: "2026-03-22",
    lifetime_value: 31200,
  },
  {
    id: "cust-033",
    name: "Carlos Mendez",
    email: "carlos.mendez@email.com",
    phone: "(555) 890-1234",
    status: "active",
    vehicles_owned: 1,
    last_interaction: "2026-03-20",
    lifetime_value: 36800,
  },
  {
    id: "cust-037",
    name: "Lisa Brown",
    email: "lisa.brown@email.com",
    phone: "(555) 901-2345",
    status: "active",
    vehicles_owned: 1,
    last_interaction: "2026-03-18",
    lifetime_value: 33500,
  },
  {
    id: "cust-050",
    name: "Kevin Smith",
    email: "kevin.smith@work.com",
    phone: "(555) 012-3456",
    status: "prospect",
    vehicles_owned: 0,
    last_interaction: "2026-03-24",
    lifetime_value: 0,
  },
  {
    id: "cust-045",
    name: "Emily Nguyen",
    email: "emily.nguyen@email.com",
    phone: "(555) 123-4567",
    status: "prospect",
    vehicles_owned: 0,
    last_interaction: "2026-03-23",
    lifetime_value: 0,
  },
  {
    id: "cust-022",
    name: "James Wilson",
    email: "james.wilson@email.com",
    phone: "(555) 234-0000",
    status: "inactive",
    vehicles_owned: 1,
    last_interaction: "2025-11-08",
    lifetime_value: 24500,
  },
  {
    id: "cust-019",
    name: "Maria Rodriguez",
    email: "maria.rodriguez@email.com",
    phone: "(555) 345-1111",
    status: "inactive",
    vehicles_owned: 1,
    last_interaction: "2025-09-15",
    lifetime_value: 27800,
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/customers                                                    */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.toLowerCase();
  const status = searchParams.get("status");

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const conditions = ["c.dealer_id = $1"];
      const params: unknown[] = [dealerId];
      let idx = 2;

      if (search) {
        conditions.push(`(LOWER(c.name) LIKE $${idx} OR LOWER(c.email) LIKE $${idx} OR c.phone LIKE $${idx})`);
        params.push(`%${search}%`);
        idx++;
      }
      if (status && ["active", "prospect", "inactive"].includes(status)) {
        conditions.push(`c.status = $${idx++}`);
        params.push(status);
      }

      const result = await query(
        `SELECT c.id, c.name, c.email, c.phone, c.status,
                COUNT(DISTINCT s.id) AS vehicles_owned,
                MAX(GREATEST(COALESCE(s.date, '1970-01-01'), COALESCE(l.updated_at, '1970-01-01'))) AS last_interaction,
                COALESCE(SUM(s.sale_price), 0) AS lifetime_value
         FROM customers c
         LEFT JOIN sales_log s ON s.customer_email = c.email AND s.dealer_id = c.dealer_id
         LEFT JOIN leads l ON l.email = c.email AND l.dealer_id = c.dealer_id
         WHERE ${conditions.join(" AND ")}
         GROUP BY c.id
         ORDER BY last_interaction DESC
         LIMIT 100`,
        params,
      );
      return NextResponse.json({ customers: result.rows });
    } catch (err) {
      console.error("[api/admin/customers] DB error:", err);
    }
  }

  // Shadow mode
  let filtered = [...MOCK_CUSTOMERS];
  if (search) {
    filtered = filtered.filter(
      (c) =>
        c.name.toLowerCase().includes(search) ||
        c.email.toLowerCase().includes(search) ||
        c.phone.includes(search),
    );
  }
  if (status) {
    filtered = filtered.filter((c) => c.status === status);
  }

  return NextResponse.json({ customers: filtered });
}
