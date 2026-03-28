import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackServerEvent } from "@/lib/analytics";
import { getDealerId } from "@/lib/get-dealer-id";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type ResourceCategory =
  | "product_guide"
  | "competitive"
  | "cheat_sheet"
  | "process"
  | "compliance";

interface Resource {
  id: string;
  title: string;
  category: ResourceCategory;
  file_url: string;
  description: string;
  vehicles_applicable: string[];
  views: number;
  last_updated: string;
  tags: string[];
}

/* -------------------------------------------------------------------------- */
/* Shadow data                                                                 */
/* -------------------------------------------------------------------------- */

const SAMPLE_RESOURCES: Resource[] = [
  {
    id: "res-001",
    title: "2025 EV Lineup — Full Product Guide",
    category: "product_guide",
    file_url: "https://example.com/docs/ev-lineup-2025.pdf",
    description:
      "Comprehensive spec sheets, range data, charging options, and feature highlights for all 2025 EV models.",
    vehicles_applicable: ["Model 3", "Model Y", "Ioniq 6", "Blazer EV"],
    views: 142,
    last_updated: "2026-03-01",
    tags: ["EV", "specs", "charging", "range"],
  },
  {
    id: "res-002",
    title: "Competitive Battlecard — Toyota vs. Honda SUVs",
    category: "competitive",
    file_url: "https://example.com/docs/battlecard-toyota-honda-suv.pdf",
    description:
      "Side-by-side comparison for the RAV4, CR-V, and Tucson. Key objection handlers included.",
    vehicles_applicable: ["RAV4", "CR-V", "Tucson"],
    views: 89,
    last_updated: "2026-02-15",
    tags: ["battlecard", "SUV", "objections", "competitor"],
  },
  {
    id: "res-003",
    title: "Finance & Insurance Cheat Sheet",
    category: "cheat_sheet",
    file_url: "https://example.com/docs/fi-cheat-sheet.pdf",
    description:
      "Quick-reference rates, reserve matrix, and menu presentation talking points for the F&I office.",
    vehicles_applicable: [],
    views: 203,
    last_updated: "2026-03-10",
    tags: ["F&I", "finance", "rates", "menu"],
  },
  {
    id: "res-004",
    title: "Trade-In Appraisal Process Guide",
    category: "process",
    file_url: "https://example.com/docs/trade-in-process.pdf",
    description:
      "Step-by-step walk-through of the 12-point appraisal process, ACV calculation, and customer disclosure.",
    vehicles_applicable: [],
    views: 67,
    last_updated: "2026-01-20",
    tags: ["trade-in", "appraisal", "ACV", "process"],
  },
  {
    id: "res-005",
    title: "Red Flags & BSA Compliance Checklist",
    category: "compliance",
    file_url: "https://example.com/docs/bsa-red-flags.pdf",
    description:
      "Bank Secrecy Act red-flag indicators and mandatory reporting thresholds for cash transactions.",
    vehicles_applicable: [],
    views: 31,
    last_updated: "2026-03-15",
    tags: ["BSA", "compliance", "cash", "AML"],
  },
  {
    id: "res-006",
    title: "Truck Segment Competitive Overview",
    category: "competitive",
    file_url: "https://example.com/docs/truck-competitive-2025.pdf",
    description:
      "F-150, Silverado, and RAM 1500 head-to-head — payload, towing, tech, and pricing breakdown.",
    vehicles_applicable: ["F-150", "Silverado 1500", "RAM 1500"],
    views: 115,
    last_updated: "2026-02-28",
    tags: ["truck", "battlecard", "towing", "payload"],
  },
];

const VALID_CATEGORIES: ResourceCategory[] = [
  "product_guide",
  "competitive",
  "cheat_sheet",
  "process",
  "compliance",
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/resources                                                   */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealer_id = getDealerId(authResult);

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      const result = await query<Resource>(
        `SELECT * FROM resources WHERE dealer_id = $1 ORDER BY last_updated DESC`,
        [dealer_id],
      );

      return NextResponse.json({ resources: result.rows });
    } catch (err) {
      console.error("[api/admin/resources] DB error, falling back:", err);
    }
  }

  return NextResponse.json({ resources: SAMPLE_RESOURCES });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/resources                                                  */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealer_id = getDealerId(authResult);

  let body: {
    title?: string;
    category?: ResourceCategory;
    file_url?: string;
    description?: string;
    vehicles_applicable?: string[];
    tags?: string[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title, category, file_url, description } = body;
  if (!title || !category || !file_url || !description) {
    return NextResponse.json(
      { error: "title, category, file_url, and description are required" },
      { status: 400 },
    );
  }

  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  // Analytics
  try {
    await trackServerEvent("resource_added", { category });
  } catch {
    // never throw
  }

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      const result = await query<Resource>(
        `INSERT INTO resources
           (dealer_id, title, category, file_url, description, vehicles_applicable, views, last_updated, tags)
         VALUES ($1,$2,$3,$4,$5,$6,0,NOW(),$7)
         RETURNING *`,
        [
          dealer_id,
          title,
          category,
          file_url,
          description,
          JSON.stringify(body.vehicles_applicable ?? []),
          JSON.stringify(body.tags ?? []),
        ],
      );

      // Audit
      try {
        await query(
          `INSERT INTO audit_log (dealer_id, action, actor, metadata, created_at)
           VALUES ($1,'resource_added',$2,$3,NOW())`,
          [dealer_id, authResult.user.email, JSON.stringify({ title, category })],
        );
      } catch {
        // never throw
      }

      return NextResponse.json({ resource: result.rows[0] }, { status: 201 });
    } catch (err) {
      console.error("[api/admin/resources] POST DB error:", err);
    }
  }

  // Shadow fallback
  const shadowResource: Resource = {
    id: `res-shadow-${Date.now()}`,
    title,
    category,
    file_url,
    description,
    vehicles_applicable: body.vehicles_applicable ?? [],
    views: 0,
    last_updated: new Date().toISOString().slice(0, 10),
    tags: body.tags ?? [],
  };

  return NextResponse.json({ resource: shadowResource }, { status: 201 });
}
