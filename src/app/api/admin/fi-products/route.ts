/**
 * GET  /api/admin/fi-products — List F&I product catalog
 * POST /api/admin/fi-products — Add product to catalog
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackDeal } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Shadow mock data                                                           */
/* -------------------------------------------------------------------------- */

const MOCK_FI_PRODUCTS = [
  {
    id: "extended-warranty",
    name: "Extended Warranty",
    category: "warranty",
    description: "Comprehensive powertrain and mechanical coverage beyond factory warranty.",
    provider: "Ally Premier Protection",
    cost: 650,
    retail_price: 1495,
    margin: 845,
    margin_pct: 56.5,
    terms: ["36 mo / 36K mi", "48 mo / 48K mi", "60 mo / 75K mi", "72 mo / 100K mi", "84 mo / 125K mi"],
    default_term: "72 mo / 100K mi",
    deductible_options: [0, 50, 100, 200],
    is_active: true,
    sort_order: 1,
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
  },
  {
    id: "gap-insurance",
    name: "GAP Insurance",
    category: "insurance",
    description: "Covers the difference between loan balance and actual cash value if vehicle is totaled or stolen.",
    provider: "Safe-Guard Products",
    cost: 195,
    retail_price: 695,
    margin: 500,
    margin_pct: 71.9,
    terms: ["Life of loan"],
    default_term: "Life of loan",
    deductible_options: [],
    is_active: true,
    sort_order: 2,
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
  },
  {
    id: "paint-protection",
    name: "Paint Protection Film",
    category: "appearance",
    description: "Clear urethane film applied to high-impact areas. Includes ceramic coating.",
    provider: "Cilajet / XPEL",
    cost: 350,
    retail_price: 1295,
    margin: 945,
    margin_pct: 73.0,
    terms: ["5-year", "7-year", "Lifetime"],
    default_term: "7-year",
    deductible_options: [],
    is_active: true,
    sort_order: 3,
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
  },
  {
    id: "tire-wheel",
    name: "Tire & Wheel Protection",
    category: "protection",
    description: "Covers repair or replacement of tires and wheels due to road hazard damage.",
    provider: "EasyCare",
    cost: 180,
    retail_price: 599,
    margin: 419,
    margin_pct: 69.9,
    terms: ["36 months", "48 months", "60 months"],
    default_term: "48 months",
    deductible_options: [0, 50],
    is_active: true,
    sort_order: 4,
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
  },
  {
    id: "theft-protection",
    name: "Theft Deterrent System",
    category: "protection",
    description: "VIN etching, GPS tracking activation, and $5,000 theft benefit.",
    provider: "Pro-Gard / LoJack",
    cost: 85,
    retail_price: 399,
    margin: 314,
    margin_pct: 78.7,
    terms: ["5-year"],
    default_term: "5-year",
    deductible_options: [],
    is_active: true,
    sort_order: 5,
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
  },
  {
    id: "maintenance-plan",
    name: "Prepaid Maintenance Plan",
    category: "maintenance",
    description: "Covers scheduled maintenance (oil changes, tire rotations, multi-point inspections).",
    provider: "Fidelity Warranty Services",
    cost: 220,
    retail_price: 795,
    margin: 575,
    margin_pct: 72.3,
    terms: ["24 mo / 2 visits", "36 mo / 3 visits", "48 mo / 4 visits", "60 mo / 5 visits"],
    default_term: "36 mo / 3 visits",
    deductible_options: [],
    is_active: true,
    sort_order: 6,
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
  },
  {
    id: "key-replacement",
    name: "Key Replacement",
    category: "protection",
    description: "Covers replacement of lost, stolen, or damaged smart keys — including programming.",
    provider: "Protective Asset Protection",
    cost: 45,
    retail_price: 299,
    margin: 254,
    margin_pct: 84.9,
    terms: ["36 months", "60 months"],
    default_term: "60 months",
    deductible_options: [],
    is_active: true,
    sort_order: 7,
    created_at: "2026-02-10T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
  },
  {
    id: "windshield-protection",
    name: "Windshield Protection",
    category: "appearance",
    description: "Covers repair or full replacement of cracked/chipped windshield.",
    provider: "EasyCare",
    cost: 55,
    retail_price: 249,
    margin: 194,
    margin_pct: 77.9,
    terms: ["36 months", "60 months"],
    default_term: "36 months",
    deductible_options: [0],
    is_active: false,
    sort_order: 8,
    created_at: "2026-02-10T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
  },
];

/**
 * In-memory store for FI products created via shadow mode (or when
 * DB INSERT silently fails). Per-instance, ephemeral. Surfaces
 * alongside DB / mock rows so a product the operator just added
 * actually appears in the list rather than disappearing.
 */
const SHADOW_PRODUCTS = new Map<string, Record<string, unknown>[]>();

function pushShadowProduct(dealerId: string, product: Record<string, unknown>) {
  const list = SHADOW_PRODUCTS.get(dealerId) ?? [];
  list.unshift(product);
  SHADOW_PRODUCTS.set(dealerId, list.slice(0, 200));
}

/* -------------------------------------------------------------------------- */
/* GET /api/admin/fi-products                                                 */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const includeInactive = request.nextUrl.searchParams.get("include_inactive") === "true";

  let products: Record<string, unknown>[] | null = null;
  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const activeClause = includeInactive ? "" : "AND is_active = true";
      const result = await query(
        `SELECT * FROM fi_products
          WHERE dealer_id = $1 ${activeClause}
          ORDER BY sort_order ASC, name ASC`,
        [dealerId],
      );
      products = result.rows as Record<string, unknown>[];
    } catch (err) {
      console.error("[api/admin/fi-products] DB error:", err);
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode (or DB unavailable) ---- */
  if (products === null) {
    const filtered = includeInactive
      ? MOCK_FI_PRODUCTS
      : MOCK_FI_PRODUCTS.filter((p) => p.is_active);
    products = filtered as unknown as Record<string, unknown>[];
  }

  /* Surface in-memory creations on top of whatever path served the
     base list. Active-flag filter applies. */
  const shadow = SHADOW_PRODUCTS.get(dealerId) ?? [];
  if (shadow.length > 0) {
    const existingIds = new Set(products.map((p) => p.id));
    const toAdd = shadow
      .filter((p) => !existingIds.has(p.id))
      .filter((p) => includeInactive || p.is_active !== false);
    products = [...toAdd, ...products];
  }

  return NextResponse.json({ products });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/fi-products                                                */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const required = ["name", "category", "cost", "retail_price"];
  for (const field of required) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      return NextResponse.json(
        { error: `Missing required field: ${field}` },
        { status: 422 },
      );
    }
  }

  const cost = Number(body.cost);
  const retailPrice = Number(body.retail_price);
  if (isNaN(cost) || isNaN(retailPrice) || cost < 0 || retailPrice < 0) {
    return NextResponse.json(
      { error: "cost and retail_price must be non-negative numbers" },
      { status: 422 },
    );
  }

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `INSERT INTO fi_products (
           dealer_id, name, category, description, provider,
           cost, retail_price, margin, margin_pct,
           terms, default_term, deductible_options,
           is_active, sort_order
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9,
           $10, $11, $12,
           $13, $14
         ) RETURNING *`,
        [
          dealerId,
          body.name,
          body.category,
          body.description || null,
          body.provider || null,
          cost,
          retailPrice,
          retailPrice - cost,
          retailPrice > 0 ? Math.round(((retailPrice - cost) / retailPrice) * 1000) / 10 : 0,
          JSON.stringify(body.terms || []),
          body.default_term || null,
          JSON.stringify(body.deductible_options || []),
          body.is_active !== false,
          body.sort_order || 99,
        ],
      );
      try { trackDeal("deal.fi_product_added", authResult?.user?.dealer_id ?? "system", { action: "fi_product_added", product_name: String(body.name ?? "") }); } catch {}
      const product = result.rows[0] as Record<string, unknown>;
      /* Mirror the persisted row into the shadow store so a
         subsequent GET on a different serverless instance still
         shows it (DB-eventual-consistency safety net). */
      pushShadowProduct(dealerId, product);
      return NextResponse.json({ product, created: true }, { status: 201 });
    } catch (err) {
      console.error("[api/admin/fi-products] DB insert error:", err);
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode ---- */
  const margin = retailPrice - cost;
  const newProduct = {
    id: `fi-${Date.now()}`,
    dealer_id: dealerId,
    name: body.name,
    category: body.category,
    description: body.description || null,
    provider: body.provider || null,
    cost,
    retail_price: retailPrice,
    margin,
    margin_pct: retailPrice > 0 ? Math.round((margin / retailPrice) * 1000) / 10 : 0,
    terms: body.terms || [],
    default_term: body.default_term || null,
    deductible_options: body.deductible_options || [],
    is_active: body.is_active !== false,
    sort_order: body.sort_order || 99,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  pushShadowProduct(dealerId, newProduct as Record<string, unknown>);
  try { trackDeal("deal.fi_product_added", authResult?.user?.dealer_id ?? "system", { action: "fi_product_added", product_name: String(body.name ?? "") }); } catch {}
  return NextResponse.json({ product: newProduct, created: true }, { status: 201 });
}
