/**
 * GET /api/admin/lender-routing/lenders — Available lenders by platform
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

/* -------------------------------------------------------------------------- */
/* Shadow mock data — 20 lenders                                              */
/* -------------------------------------------------------------------------- */

const MOCK_LENDERS = [
  /* Captive (OEM) */
  { id: "lndr-tfs", name: "Toyota Financial Services", type: "captive", platforms: ["routeone", "dealertrack"], min_score: 620, max_ltv: 130, specialties: ["Toyota", "Lexus"] },
  { id: "lndr-hfs", name: "Honda Financial Services", type: "captive", platforms: ["dealertrack", "routeone"], min_score: 640, max_ltv: 125, specialties: ["Honda", "Acura"] },
  { id: "lndr-fmc", name: "Ford Motor Credit", type: "captive", platforms: ["routeone", "direct"], min_score: 600, max_ltv: 135, specialties: ["Ford", "Lincoln"] },
  { id: "lndr-bmwfs", name: "BMW Financial Services", type: "captive", platforms: ["routeone", "dealertrack"], min_score: 680, max_ltv: 120, specialties: ["BMW", "MINI"] },
  { id: "lndr-gm", name: "GM Financial", type: "captive", platforms: ["routeone", "dealertrack"], min_score: 600, max_ltv: 130, specialties: ["Chevrolet", "GMC", "Buick", "Cadillac"] },
  { id: "lndr-nmac", name: "Nissan Motor Acceptance", type: "captive", platforms: ["dealertrack", "routeone"], min_score: 620, max_ltv: 125, specialties: ["Nissan", "Infiniti"] },
  { id: "lndr-chrysler", name: "Chrysler Capital", type: "captive", platforms: ["routeone", "dealertrack"], min_score: 580, max_ltv: 140, specialties: ["Ram", "Jeep", "Dodge", "Chrysler"] },

  /* National */
  { id: "lndr-cap1", name: "Capital One Auto", type: "national", platforms: ["routeone", "dealertrack"], min_score: 550, max_ltv: 140, specialties: ["subprime", "used"] },
  { id: "lndr-chase", name: "Chase Auto", type: "national", platforms: ["routeone", "dealertrack", "direct"], min_score: 640, max_ltv: 120, specialties: ["prime", "new"] },
  { id: "lndr-ally", name: "Ally Financial", type: "national", platforms: ["routeone", "dealertrack"], min_score: 560, max_ltv: 135, specialties: ["used", "lease"] },
  { id: "lndr-wells", name: "Wells Fargo Dealer Services", type: "national", platforms: ["routeone", "dealertrack"], min_score: 620, max_ltv: 125, specialties: ["prime", "super-prime"] },
  { id: "lndr-bofa", name: "Bank of America Dealer Financial", type: "national", platforms: ["dealertrack", "direct"], min_score: 660, max_ltv: 115, specialties: ["prime", "new"] },

  /* Regional */
  { id: "lndr-firstnat", name: "First National Bank", type: "regional", platforms: ["routeone", "direct"], min_score: 600, max_ltv: 130, specialties: ["used", "local"] },
  { id: "lndr-westlake", name: "Westlake Financial", type: "regional", platforms: ["routeone", "dealertrack"], min_score: 450, max_ltv: 150, specialties: ["deep-subprime", "used"] },
  { id: "lndr-exeter", name: "Exeter Finance", type: "regional", platforms: ["routeone", "dealertrack"], min_score: 500, max_ltv: 145, specialties: ["subprime", "used"] },
  { id: "lndr-santander", name: "Santander Consumer USA", type: "regional", platforms: ["routeone", "dealertrack"], min_score: 520, max_ltv: 140, specialties: ["subprime", "new", "used"] },

  /* Credit Unions */
  { id: "lndr-navyfed", name: "Navy Federal Credit Union", type: "credit_union", platforms: ["dealertrack", "direct"], min_score: 600, max_ltv: 120, specialties: ["military", "prime"] },
  { id: "lndr-penfed", name: "PenFed Credit Union", type: "credit_union", platforms: ["dealertrack", "direct"], min_score: 620, max_ltv: 115, specialties: ["military", "used"] },
  { id: "lndr-usaa", name: "USAA", type: "credit_union", platforms: ["direct"], min_score: 640, max_ltv: 110, specialties: ["military", "prime", "super-prime"] },
  { id: "lndr-dcu", name: "Digital Federal Credit Union", type: "credit_union", platforms: ["dealertrack", "direct"], min_score: 620, max_ltv: 120, specialties: ["used", "refinance"] },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/lender-routing/lenders                                      */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const url = request.nextUrl;
  const platformFilter = url.searchParams.get("platform") || "";
  const typeFilter = url.searchParams.get("type") || "";

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const conditions: string[] = ["1=1"];
      const params: unknown[] = [];
      let idx = 1;

      if (platformFilter) {
        conditions.push(`$${idx++} = ANY(platforms)`);
        params.push(platformFilter);
      }
      if (typeFilter) {
        conditions.push(`type = $${idx++}`);
        params.push(typeFilter);
      }

      const result = await /* audit-safe: A4 reason="lenders is a global lender catalog (no per-dealer rows in schema), shared across all tenants" */ query(
        `SELECT * FROM lenders
          WHERE ${conditions.join(" AND ")}
          ORDER BY type, name`,
        params,
      );

      return NextResponse.json({ lenders: result.rows, total: (result.rows as unknown[]).length });
    } catch (err) {
      console.error("[api/admin/lender-routing/lenders] DB error, falling back to mock:", err);
    }
  }

  /* ---- Shadow mode ---- */
  let filtered = [...MOCK_LENDERS];
  if (platformFilter)
    filtered = filtered.filter((l) => l.platforms.includes(platformFilter));
  if (typeFilter)
    filtered = filtered.filter((l) => l.type === typeFilter);

  return NextResponse.json({ lenders: filtered, total: filtered.length });
}
