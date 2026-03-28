import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

const DEALER_ID = process.env.DEALER_ID ?? "default";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface Part {
  id: string;
  dealer_id: string;
  part_number: string;
  name: string;
  category: "filters" | "brakes" | "fluids" | "electrical" | "engine" | "suspension" | "tires" | "body" | "exhaust" | "other";
  manufacturer: string;
  qty_on_hand: number;
  reorder_point: number;
  cost: number;
  retail_price: number;
  location: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Shadow mock data                                                           */
/* -------------------------------------------------------------------------- */

const MOCK_PARTS: Part[] = [
  {
    id: "part-001",
    dealer_id: DEALER_ID,
    part_number: "WIX-57356",
    name: "Engine Oil Filter — WIX 57356",
    category: "filters",
    manufacturer: "WIX",
    qty_on_hand: 42,
    reorder_point: 20,
    cost: 4.89,
    retail_price: 12.99,
    location: "Shelf A-1",
    updated_at: "2026-03-27T08:00:00Z",
  },
  {
    id: "part-002",
    dealer_id: DEALER_ID,
    part_number: "BW-BC1608",
    name: "Front Ceramic Brake Pads — Wagner QuickStop",
    category: "brakes",
    manufacturer: "Wagner",
    qty_on_hand: 8,
    reorder_point: 6,
    cost: 42.50,
    retail_price: 89.99,
    location: "Shelf B-3",
    updated_at: "2026-03-26T14:00:00Z",
  },
  {
    id: "part-003",
    dealer_id: DEALER_ID,
    part_number: "MOB1-5W30-5Q",
    name: "Mobil 1 5W-30 Full Synthetic (5 qt)",
    category: "fluids",
    manufacturer: "Mobil",
    qty_on_hand: 36,
    reorder_point: 15,
    cost: 24.99,
    retail_price: 38.99,
    location: "Shelf C-1",
    updated_at: "2026-03-27T10:00:00Z",
  },
  {
    id: "part-004",
    dealer_id: DEALER_ID,
    part_number: "DEN-234-9127",
    name: "Upstream O2 Sensor — Denso Universal",
    category: "electrical",
    manufacturer: "Denso",
    qty_on_hand: 3,
    reorder_point: 5,
    cost: 38.00,
    retail_price: 85.00,
    location: "Shelf D-2",
    updated_at: "2026-03-25T09:00:00Z",
  },
  {
    id: "part-005",
    dealer_id: DEALER_ID,
    part_number: "FRM-CA11476",
    name: "Cabin Air Filter — FRAM Fresh Breeze",
    category: "filters",
    manufacturer: "FRAM",
    qty_on_hand: 18,
    reorder_point: 10,
    cost: 11.49,
    retail_price: 24.99,
    location: "Shelf A-2",
    updated_at: "2026-03-27T08:00:00Z",
  },
  {
    id: "part-006",
    dealer_id: DEALER_ID,
    part_number: "VAL-V212134",
    name: "Rear Brake Rotor — Pair",
    category: "brakes",
    manufacturer: "Valucraft",
    qty_on_hand: 2,
    reorder_point: 4,
    cost: 56.00,
    retail_price: 119.99,
    location: "Shelf B-5",
    updated_at: "2026-03-24T11:00:00Z",
  },
  {
    id: "part-007",
    dealer_id: DEALER_ID,
    part_number: "PRE-AF5215",
    name: "Engine Air Filter — Premium Guard",
    category: "filters",
    manufacturer: "Premium Guard",
    qty_on_hand: 14,
    reorder_point: 8,
    cost: 8.75,
    retail_price: 19.99,
    location: "Shelf A-1",
    updated_at: "2026-03-26T09:00:00Z",
  },
  {
    id: "part-008",
    dealer_id: DEALER_ID,
    part_number: "DEX-ATFVI-1G",
    name: "Dexron VI ATF Transmission Fluid (1 gal)",
    category: "fluids",
    manufacturer: "ACDelco",
    qty_on_hand: 5,
    reorder_point: 8,
    cost: 18.50,
    retail_price: 32.99,
    location: "Shelf C-2",
    updated_at: "2026-03-25T15:00:00Z",
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/service/parts                                               */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.toLowerCase();
  const lowStock = searchParams.get("low_stock") === "true";
  const category = searchParams.get("category");

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const conditions: string[] = ["dealer_id = $1"];
      const params: unknown[] = [DEALER_ID];
      let idx = 2;

      if (search) {
        conditions.push(`(LOWER(name) LIKE $${idx} OR LOWER(part_number) LIKE $${idx})`);
        params.push(`%${search}%`);
        idx++;
      }
      if (lowStock) {
        conditions.push("qty_on_hand <= reorder_point");
      }
      if (category) {
        conditions.push(`category = $${idx++}`);
        params.push(category);
      }

      const result = await query(
        `SELECT * FROM service_parts
         WHERE ${conditions.join(" AND ")}
         ORDER BY name ASC
         LIMIT 500`,
        params,
      );

      return NextResponse.json({ parts: result.rows });
    } catch (err) {
      console.error("[api/admin/service/parts] DB error, falling back:", err);
    }
  }

  // Shadow mode
  let filtered = [...MOCK_PARTS];
  if (search) {
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        p.part_number.toLowerCase().includes(search),
    );
  }
  if (lowStock) {
    filtered = filtered.filter((p) => p.qty_on_hand <= p.reorder_point);
  }
  if (category) {
    filtered = filtered.filter((p) => p.category === category);
  }

  return NextResponse.json({ parts: filtered });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/service/parts                                              */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  let body: Partial<Part>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.part_number || !body.name) {
    return NextResponse.json(
      { error: "part_number and name are required" },
      { status: 400 },
    );
  }

  const newId = `part-${Date.now()}`;
  const now = new Date().toISOString();

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      await query(
        `INSERT INTO service_parts
           (id, dealer_id, part_number, name, category, manufacturer,
            qty_on_hand, reorder_point, cost, retail_price, location, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          newId, DEALER_ID,
          body.part_number, body.name,
          body.category ?? "other", body.manufacturer ?? "",
          body.qty_on_hand ?? 0, body.reorder_point ?? 5,
          body.cost ?? 0, body.retail_price ?? 0,
          body.location ?? "",
          now,
        ],
      );

      return NextResponse.json({ success: true, id: newId });
    } catch (err) {
      console.error("[api/admin/service/parts] POST DB error:", err);
    }
  }

  // Shadow mode
  return NextResponse.json({ success: true, id: newId, mode: "shadow" });
}
