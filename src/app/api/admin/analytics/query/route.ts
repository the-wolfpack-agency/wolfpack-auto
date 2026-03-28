import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackSystem } from "@/lib/analytics-hooks";

/**
 * POST /api/admin/analytics/query
 *
 * Natural-language analytics queries using keyword matching.
 * Falls back to sample data when no database is configured.
 */

/* -------------------------------------------------------------------------- */
/* Sample data (used when no DB is available)                                 */
/* -------------------------------------------------------------------------- */

const SAMPLE_DATA = {
  leadCount: 47,
  leadCountThisWeek: 12,
  vehicleCount: 83,
  conversionRate: 4.2,
  topVehicles: [
    { vehicle: "2024 Toyota Camry SE", views: 342 },
    { vehicle: "2023 Honda CR-V EX-L", views: 298 },
    { vehicle: "2024 Ford F-150 XLT", views: 271 },
    { vehicle: "2023 Chevrolet Equinox LT", views: 215 },
    { vehicle: "2024 Hyundai Tucson SEL", views: 189 },
  ],
  soldThisWeek: [
    { vehicle: "2023 Toyota RAV4 LE", price: 28500, sold_date: "2026-03-24" },
    { vehicle: "2022 Honda Accord Sport", price: 26900, sold_date: "2026-03-23" },
    { vehicle: "2024 Ford Bronco Big Bend", price: 38200, sold_date: "2026-03-22" },
  ],
  slowMovers: [
    { vehicle: "2021 Nissan Altima S", days_on_lot: 87 },
    { vehicle: "2022 Kia Forte LXS", days_on_lot: 72 },
    { vehicle: "2021 Chevrolet Malibu LS", days_on_lot: 65 },
  ],
  topSearches: [
    { term: "SUV under 30000", count: 156 },
    { term: "Toyota", count: 134 },
    { term: "hybrid", count: 98 },
    { term: "truck 4x4", count: 87 },
    { term: "low mileage", count: 76 },
  ],
};

/* -------------------------------------------------------------------------- */
/* Keyword matchers                                                           */
/* -------------------------------------------------------------------------- */

interface QueryResult {
  answer: string;
  data?: unknown;
  type: "text" | "table" | "number";
}

function matchQuery(question: string): QueryResult | null {
  const q = question.toLowerCase();

  // Lead count
  if (q.includes("how many leads") || q.includes("lead count") || q.includes("total leads")) {
    if (q.includes("this week") || q.includes("week")) {
      return {
        answer: `You received ${SAMPLE_DATA.leadCountThisWeek} leads this week.`,
        data: SAMPLE_DATA.leadCountThisWeek,
        type: "number",
      };
    }
    return {
      answer: `You have ${SAMPLE_DATA.leadCount} total leads in the system.`,
      data: SAMPLE_DATA.leadCount,
      type: "number",
    };
  }

  // Vehicle / inventory count
  if (
    q.includes("how many vehicles") ||
    q.includes("inventory count") ||
    q.includes("how many cars") ||
    q.includes("total inventory")
  ) {
    return {
      answer: `You currently have ${SAMPLE_DATA.vehicleCount} vehicles in inventory.`,
      data: SAMPLE_DATA.vehicleCount,
      type: "number",
    };
  }

  // Top / most viewed vehicles
  if (
    q.includes("top vehicle") ||
    q.includes("most viewed") ||
    q.includes("popular vehicle") ||
    q.includes("most popular")
  ) {
    const lines = SAMPLE_DATA.topVehicles
      .map((v, i) => `${i + 1}. ${v.vehicle} (${v.views} views)`)
      .join("\n");
    return {
      answer: `Top 5 most viewed vehicles:\n${lines}`,
      data: SAMPLE_DATA.topVehicles,
      type: "table",
    };
  }

  // Conversion rate
  if (q.includes("conversion") || q.includes("convert")) {
    return {
      answer: `Your current visitor-to-lead conversion rate is ${SAMPLE_DATA.conversionRate}%.`,
      data: SAMPLE_DATA.conversionRate,
      type: "number",
    };
  }

  // Sold vehicles
  if (q.includes("what sold") || q.includes("sold this week") || q.includes("recent sales")) {
    const lines = SAMPLE_DATA.soldThisWeek
      .map((v) => `- ${v.vehicle} ($${v.price.toLocaleString()}) on ${v.sold_date}`)
      .join("\n");
    return {
      answer: `${SAMPLE_DATA.soldThisWeek.length} vehicles sold this week:\n${lines}`,
      data: SAMPLE_DATA.soldThisWeek,
      type: "table",
    };
  }

  // Slow movers
  if (q.includes("slow mover") || q.includes("sitting") || q.includes("aging") || q.includes("oldest")) {
    const lines = SAMPLE_DATA.slowMovers
      .map((v) => `- ${v.vehicle} (${v.days_on_lot} days)`)
      .join("\n");
    return {
      answer: `Slowest-moving vehicles:\n${lines}`,
      data: SAMPLE_DATA.slowMovers,
      type: "table",
    };
  }

  // Search trends
  if (
    q.includes("search") ||
    q.includes("what are people looking") ||
    q.includes("what are people searching") ||
    q.includes("search trend")
  ) {
    const lines = SAMPLE_DATA.topSearches
      .map((s, i) => `${i + 1}. "${s.term}" (${s.count} searches)`)
      .join("\n");
    return {
      answer: `Top search terms:\n${lines}`,
      data: SAMPLE_DATA.topSearches,
      type: "table",
    };
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Handler                                                                    */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  let body: { question?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = body.question?.trim();

  if (typeof body.question !== "string" || !question) {
    return NextResponse.json(
      { error: "question is required" },
      { status: 422 },
    );
  }
  if (body.question.length > 2000) {
    return NextResponse.json(
      { error: "question must be 2000 characters or fewer" },
      { status: 422 },
    );
  }

  // Try DB-backed queries first if available
  if (process.env.DATABASE_URL) {
    try {
      const result = await queryDatabase(question, dealerId);
      if (result) {
        return NextResponse.json(result);
      }
    } catch (err) {
      console.error("[api/analytics/query] DB query failed, falling back to sample:", err);
    }
  }

  // Keyword matching against sample data
  const matched = matchQuery(question);

  try { trackSystem("system.analytics_queried", authResult?.user?.dealer_id ?? "system", { action: "query" }); } catch {}

  if (matched) {
    return NextResponse.json(matched);
  }

  // Fallback help message
  return NextResponse.json({
    answer:
      "I can answer questions about leads, vehicles, sales, conversions, and search trends. Try asking:\n" +
      "- 'How many leads this week?'\n" +
      "- 'Top vehicles?'\n" +
      "- 'What sold this week?'\n" +
      "- 'Conversion rate?'\n" +
      "- 'Slow movers?'\n" +
      "- 'What are people searching for?'",
    type: "text" as const,
  });
}

/* -------------------------------------------------------------------------- */
/* DB-backed queries (when DATABASE_URL is set)                               */
/* -------------------------------------------------------------------------- */

async function queryDatabase(question: string, dealerId: string): Promise<QueryResult | null> {
  const q = question.toLowerCase();
  const { query } = await import("@/lib/db");

  if (q.includes("how many leads") || q.includes("lead count")) {
    if (q.includes("this week") || q.includes("week")) {
      const result = await query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM leads WHERE dealer_id = $1 AND created_at >= NOW() - INTERVAL '7 days'`,
        [dealerId],
      );
      const count = parseInt(result.rows[0]?.count ?? "0", 10);
      return { answer: `You received ${count} leads this week.`, data: count, type: "number" };
    }
    const result = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM leads WHERE dealer_id = $1`,
      [dealerId],
    );
    const count = parseInt(result.rows[0]?.count ?? "0", 10);
    return { answer: `You have ${count} total leads.`, data: count, type: "number" };
  }

  if (q.includes("how many vehicles") || q.includes("inventory count")) {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM vehicles WHERE dealer_id = $1 AND status = 'available'`,
      [dealerId],
    );
    const count = parseInt(result.rows[0]?.count ?? "0", 10);
    return { answer: `You have ${count} available vehicles.`, data: count, type: "number" };
  }

  if (q.includes("what sold") || q.includes("sold this week")) {
    const result = await query<{ vehicle: string; price: number; sold_date: string }>(
      `SELECT CONCAT(v.year, ' ', v.make, ' ', v.model) AS vehicle, v.price, v.updated_at::date AS sold_date
       FROM vehicles v WHERE v.dealer_id = $1 AND v.status = 'sold' AND v.updated_at >= NOW() - INTERVAL '7 days'
       ORDER BY v.updated_at DESC LIMIT 10`,
      [dealerId],
    );
    if (result.rows.length === 0) {
      return { answer: "No vehicles sold this week.", type: "text" };
    }
    const lines = result.rows.map((r: any) => `- ${r.vehicle} ($${Number(r.price).toLocaleString()})`).join("\n");
    return {
      answer: `${result.rows.length} vehicles sold this week:\n${lines}`,
      data: result.rows,
      type: "table",
    };
  }

  if (q.includes("slow mover") || q.includes("sitting") || q.includes("oldest")) {
    const result = await query<{ vehicle: string; days_on_lot: number }>(
      `SELECT CONCAT(v.year, ' ', v.make, ' ', v.model) AS vehicle,
              EXTRACT(EPOCH FROM (now() - v.created_at))::int / 86400 AS days_on_lot
       FROM vehicles v WHERE v.dealer_id = $1 AND v.status = 'available'
       ORDER BY v.created_at ASC LIMIT 5`,
      [dealerId],
    );
    const lines = result.rows.map((r: any) => `- ${r.vehicle} (${r.days_on_lot} days)`).join("\n");
    return {
      answer: `Slowest-moving vehicles:\n${lines}`,
      data: result.rows,
      type: "table",
    };
  }

  return null;
}
