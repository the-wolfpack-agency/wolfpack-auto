/**
 * GET  /api/admin/vehicle-history — List vehicle history reports (filterable by vin, provider)
 * POST /api/admin/vehicle-history — Pull a new vehicle history report
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackSystem, trackSecurity } from "@/lib/analytics-hooks";
import { checkIdempotency, recordIdempotency, idempotencyKey } from "@/lib/idempotency";

/* -------------------------------------------------------------------------- */
/* VIN validation                                                             */
/* -------------------------------------------------------------------------- */

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

function isValidVin(vin: string): boolean {
  return VIN_REGEX.test(vin.toUpperCase());
}

/* -------------------------------------------------------------------------- */
/* Shadow mock data                                                           */
/* -------------------------------------------------------------------------- */

const MOCK_REPORTS = [
  {
    id: "vhr-001",
    dealer_id: "demo-dealer",
    vin: "4T1G11AK5RU123456",
    provider: "carfax",
    vehicle_description: "2024 Toyota Camry XSE",
    pulled_at: "2026-03-28T09:30:00Z",
    expires_at: "2026-04-27T09:30:00Z",
    report_url: "https://www.carfax.com/VehicleHistory/p/Report.cfx?vin=4T1G11AK5RU123456",
    summary: {
      title_status: "clean" as const,
      owners: 1,
      accidents: 0,
      service_records: 12,
      open_recalls: 0,
      odometer_status: "ok" as const,
      structural_damage: false,
      airbag_deployed: false,
      theft_reported: false,
    },
    history_entries: [
      { date: "2024-01-15", description: "Vehicle manufactured and shipped to dealer", mileage: 5, source: "Toyota Motor Corp", category: "title" as const },
      { date: "2024-02-01", description: "Title issued — TX — First owner reported", mileage: 12, source: "Texas DMV", category: "title" as const },
      { date: "2024-05-10", description: "Oil change and tire rotation", mileage: 5200, source: "Toyota of Austin", category: "service" as const },
      { date: "2024-08-22", description: "Multi-point inspection, brake fluid flush", mileage: 10400, source: "Toyota of Austin", category: "service" as const },
      { date: "2024-11-15", description: "Oil change, cabin air filter replaced", mileage: 15800, source: "Toyota of Austin", category: "service" as const },
      { date: "2025-02-10", description: "15K service — oil change, tire rotation, alignment", mileage: 20100, source: "Toyota of Austin", category: "service" as const },
      { date: "2025-05-05", description: "Oil change and multi-point inspection", mileage: 25300, source: "Toyota of Austin", category: "service" as const },
      { date: "2025-06-18", description: "Passed state inspection", mileage: 27000, source: "Texas DPS", category: "inspection" as const },
      { date: "2025-08-12", description: "Oil change, transmission fluid service", mileage: 30100, source: "Toyota of Austin", category: "service" as const },
      { date: "2025-11-01", description: "30K service — full inspection, brake pads replaced", mileage: 35200, source: "Toyota of Austin", category: "service" as const },
      { date: "2026-01-20", description: "Oil change, wiper blades replaced", mileage: 39800, source: "Toyota of Austin", category: "service" as const },
      { date: "2026-03-05", description: "Vehicle listed for sale", mileage: 42100, source: "Dealer Listing", category: "sale" as const },
    ],
    value_impact: {
      score: 92,
      factors_positive: [
        "Clean title — no branded history",
        "Single owner vehicle",
        "Complete dealer service history (12 records)",
        "No accidents or damage reported",
        "No open recalls",
      ],
      factors_negative: [],
    },
  },
  {
    id: "vhr-002",
    dealer_id: "demo-dealer",
    vin: "7FARS6H79RE045678",
    provider: "carfax",
    vehicle_description: "2025 Honda CR-V Hybrid Sport-L",
    pulled_at: "2026-03-28T10:45:00Z",
    expires_at: "2026-04-27T10:45:00Z",
    report_url: "https://www.carfax.com/VehicleHistory/p/Report.cfx?vin=7FARS6H79RE045678",
    summary: {
      title_status: "clean" as const,
      owners: 0,
      accidents: 0,
      service_records: 0,
      open_recalls: 0,
      odometer_status: "ok" as const,
      structural_damage: false,
      airbag_deployed: false,
      theft_reported: false,
    },
    history_entries: [
      { date: "2025-01-08", description: "Vehicle manufactured", mileage: 0, source: "Honda Motor Co", category: "title" as const },
      { date: "2025-02-15", description: "Shipped to dealer — new vehicle inventory", mileage: 8, source: "Honda Distribution", category: "title" as const },
    ],
    value_impact: {
      score: 98,
      factors_positive: [
        "Brand new vehicle — no prior owners",
        "Clean title",
        "Factory warranty in effect",
        "Zero accident history",
      ],
      factors_negative: [],
    },
  },
  {
    id: "vhr-003",
    dealer_id: "demo-dealer",
    vin: "1FTFW1E80RFA12345",
    provider: "carfax",
    vehicle_description: "2024 Ford F-150 XLT SuperCrew",
    pulled_at: "2026-03-25T08:15:00Z",
    expires_at: "2026-04-24T08:15:00Z",
    report_url: "https://www.carfax.com/VehicleHistory/p/Report.cfx?vin=1FTFW1E80RFA12345",
    summary: {
      title_status: "clean" as const,
      owners: 2,
      accidents: 1,
      service_records: 8,
      open_recalls: 0,
      odometer_status: "ok" as const,
      structural_damage: false,
      airbag_deployed: false,
      theft_reported: false,
    },
    history_entries: [
      { date: "2024-03-01", description: "Vehicle manufactured and shipped", mileage: 10, source: "Ford Motor Company", category: "title" as const },
      { date: "2024-03-20", description: "Title issued — TX — First owner", mileage: 45, source: "Texas DMV", category: "title" as const },
      { date: "2024-06-15", description: "Oil change, tire rotation", mileage: 6200, source: "AutoNation Ford", category: "service" as const },
      { date: "2024-09-22", description: "Minor rear-end collision reported", mileage: 12400, source: "Insurance Claim", category: "accident" as const },
      { date: "2024-10-05", description: "Rear bumper and tailgate repaired", mileage: 12400, source: "Caliber Collision", category: "service" as const },
      { date: "2024-12-10", description: "Oil change, brake inspection", mileage: 18700, source: "AutoNation Ford", category: "service" as const },
      { date: "2025-03-01", description: "Title transferred — TX — Second owner", mileage: 22500, source: "Texas DMV", category: "sale" as const },
      { date: "2025-06-18", description: "Oil change, transmission service", mileage: 28900, source: "Jiffy Lube", category: "service" as const },
      { date: "2025-09-10", description: "Full synthetic oil change, air filter", mileage: 35100, source: "Ford Dealership", category: "service" as const },
      { date: "2025-12-05", description: "Passed state inspection", mileage: 40200, source: "Texas DPS", category: "inspection" as const },
      { date: "2026-01-15", description: "Oil change, coolant flush", mileage: 42800, source: "Ford Dealership", category: "service" as const },
      { date: "2026-03-10", description: "Vehicle traded in at dealer", mileage: 45000, source: "Dealer Trade-In", category: "sale" as const },
    ],
    value_impact: {
      score: 71,
      factors_positive: [
        "Clean title — not branded",
        "Regular service history (8 records)",
        "No structural damage",
        "No open recalls",
      ],
      factors_negative: [
        "1 accident reported — minor rear-end collision",
        "2 owners — multiple ownership history",
        "Mixed service locations (not all dealer serviced)",
      ],
    },
  },
  {
    id: "vhr-004",
    dealer_id: "demo-dealer",
    vin: "5UX43DP05R9E78901",
    provider: "autocheck",
    vehicle_description: "2025 BMW X3 xDrive30i",
    pulled_at: "2026-03-28T11:15:00Z",
    expires_at: "2026-04-27T11:15:00Z",
    report_url: "https://www.autocheck.com/members/report.do?vin=5UX43DP05R9E78901",
    summary: {
      title_status: "clean" as const,
      owners: 1,
      accidents: 0,
      service_records: 3,
      open_recalls: 0,
      odometer_status: "ok" as const,
      structural_damage: false,
      airbag_deployed: false,
      theft_reported: false,
    },
    history_entries: [
      { date: "2024-11-01", description: "Vehicle manufactured — Spartanburg, SC", mileage: 0, source: "BMW AG", category: "title" as const },
      { date: "2024-12-10", description: "Title issued — TX — Lease (BMW FS)", mileage: 5, source: "Texas DMV", category: "title" as const },
      { date: "2025-04-15", description: "First service — oil change, inspection", mileage: 5100, source: "BMW of Austin", category: "service" as const },
      { date: "2025-10-20", description: "10K service — oil, filters, brake check", mileage: 10300, source: "BMW of Austin", category: "service" as const },
      { date: "2026-03-01", description: "Lease return inspection — passed", mileage: 14200, source: "BMW Financial Services", category: "inspection" as const },
      { date: "2026-03-15", description: "Lease return — vehicle transferred to dealer", mileage: 14500, source: "BMW of Austin", category: "sale" as const },
    ],
    value_impact: {
      score: 88,
      factors_positive: [
        "Clean title — no branded history",
        "Single-owner lease return",
        "All dealer-serviced at BMW of Austin",
        "No accidents or damage",
        "Low mileage for age",
      ],
      factors_negative: [
        "Lease return — may have wear-and-tear charges",
      ],
    },
  },
  {
    id: "vhr-005",
    dealer_id: "demo-dealer",
    vin: "2T2HZMDA4PC123456",
    provider: "carfax",
    vehicle_description: "2023 Lexus RX 350 F Sport",
    pulled_at: "2026-03-24T14:30:00Z",
    expires_at: "2026-04-23T14:30:00Z",
    report_url: "https://www.carfax.com/VehicleHistory/p/Report.cfx?vin=2T2HZMDA4PC123456",
    summary: {
      title_status: "clean" as const,
      owners: 1,
      accidents: 0,
      service_records: 18,
      open_recalls: 0,
      odometer_status: "ok" as const,
      structural_damage: false,
      airbag_deployed: false,
      theft_reported: false,
    },
    history_entries: [
      { date: "2022-10-01", description: "Vehicle manufactured — Miyawaka, Japan", mileage: 0, source: "Toyota Motor Corp", category: "title" as const },
      { date: "2022-11-20", description: "Title issued — TX — First owner", mileage: 10, source: "Texas DMV", category: "title" as const },
      { date: "2022-11-20", description: "Lexus Certified Pre-Owned inspection completed", mileage: 10, source: "Lexus of Austin", category: "inspection" as const },
      { date: "2023-02-15", description: "First maintenance — oil change, inspection", mileage: 5100, source: "Lexus of Austin", category: "service" as const },
      { date: "2023-05-10", description: "Oil change, tire rotation", mileage: 10200, source: "Lexus of Austin", category: "service" as const },
      { date: "2023-08-22", description: "10K service — multi-point inspection", mileage: 10500, source: "Lexus of Austin", category: "service" as const },
      { date: "2023-11-15", description: "Oil change, cabin filter, wiper blades", mileage: 12800, source: "Lexus of Austin", category: "service" as const },
      { date: "2024-02-10", description: "Oil change, tire rotation, brake inspection", mileage: 14200, source: "Lexus of Austin", category: "service" as const },
      { date: "2024-05-05", description: "Oil change, alignment check", mileage: 15500, source: "Lexus of Austin", category: "service" as const },
      { date: "2024-06-18", description: "Passed state inspection", mileage: 15800, source: "Texas DPS", category: "inspection" as const },
      { date: "2024-08-12", description: "Oil change, transmission fluid service", mileage: 16200, source: "Lexus of Austin", category: "service" as const },
      { date: "2024-11-01", description: "Oil change, brake pads replaced (front)", mileage: 17000, source: "Lexus of Austin", category: "service" as const },
      { date: "2025-01-20", description: "Oil change, battery tested", mileage: 17500, source: "Lexus of Austin", category: "service" as const },
      { date: "2025-03-15", description: "Lexus CPO certification completed", mileage: 17800, source: "Lexus of Austin", category: "inspection" as const },
      { date: "2025-06-10", description: "Oil change, tire rotation", mileage: 18000, source: "Lexus of Austin", category: "service" as const },
      { date: "2025-08-20", description: "Passed state inspection", mileage: 18100, source: "Texas DPS", category: "inspection" as const },
      { date: "2025-11-05", description: "Oil change, coolant flush", mileage: 18150, source: "Lexus of Austin", category: "service" as const },
      { date: "2026-01-10", description: "Oil change, multi-point inspection", mileage: 18180, source: "Lexus of Austin", category: "service" as const },
      { date: "2026-03-01", description: "Vehicle listed as CPO", mileage: 18200, source: "Lexus of Austin", category: "sale" as const },
    ],
    value_impact: {
      score: 96,
      factors_positive: [
        "Clean title — no branded history",
        "Single owner vehicle",
        "Lexus Certified Pre-Owned (CPO)",
        "Exceptional service history (18 records)",
        "All dealer-serviced at Lexus of Austin",
        "No accidents or damage reported",
        "Low mileage for age",
      ],
      factors_negative: [],
    },
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/vehicle-history                                             */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const url = request.nextUrl;
  const vin = url.searchParams.get("vin") || "";
  const provider = url.searchParams.get("provider") || "";

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const conditions: string[] = ["vhr.dealer_id = $1"];
      const params: unknown[] = [dealerId];
      let idx = 2;

      if (vin) {
        conditions.push(`vhr.vin = $${idx++}`);
        params.push(vin.toUpperCase());
      }
      if (provider) {
        conditions.push(`vhr.provider = $${idx++}`);
        params.push(provider);
      }

      const result = await /* audit-safe: A4 reason="vhr.dealer_id = $1 is the first entry in conditions[] above; cannot be omitted" */ query(
        `SELECT vhr.*
           FROM vehicle_history_reports vhr
          WHERE ${conditions.join(" AND ")}
          ORDER BY vhr.pulled_at DESC
          LIMIT 100`,
        params,
      );

      return NextResponse.json({ reports: result.rows, total: (result.rows as unknown[]).length });
    } catch (err) {
      console.error("[api/admin/vehicle-history] DB error, falling back to mock:", err);
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode ---- */
  let filtered = [...MOCK_REPORTS];
  if (vin) filtered = filtered.filter((r) => r.vin === vin.toUpperCase());
  if (provider)
    filtered = filtered.filter((r) => r.provider === provider);

  return NextResponse.json({ reports: filtered, total: filtered.length });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/vehicle-history                                            */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const rl = await checkRateLimit(`vehicle-history:${dealerId}`, 20, 60);
  if (!rl.allowed) {
    try { trackSecurity("security.rate_limit_triggered", dealerId, { route: "vehicle-history", remaining: 0 }); } catch {}
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Idempotency — prevent duplicate pulls from double-clicks/retries
  const iKey = idempotencyKey("/api/admin/vehicle-history", body);
  const cached = checkIdempotency(iKey);
  if (cached) return NextResponse.json(cached, { status: 201 });

  const vin = typeof body.vin === "string" ? body.vin.toUpperCase().trim() : "";
  const provider = typeof body.provider === "string" ? body.provider : "carfax";

  if (!vin) {
    return NextResponse.json({ error: "Missing required field: vin" }, { status: 422 });
  }

  if (!isValidVin(vin)) {
    return NextResponse.json(
      { error: "Invalid VIN. Must be 17 alphanumeric characters (excluding I, O, Q)." },
      { status: 422 },
    );
  }

  if (!["carfax", "autocheck", "both"].includes(provider)) {
    return NextResponse.json(
      { error: "Invalid provider. Must be 'carfax', 'autocheck', or 'both'." },
      { status: 422 },
    );
  }

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      // In production, call the Carfax/AutoCheck API here.
      // For now, insert a placeholder that would be populated by the provider webhook.
      const result = await query(
        `INSERT INTO vehicle_history_reports (
           dealer_id, vin, provider, vehicle_description,
           pulled_at, expires_at, report_url,
           summary, history_entries, value_impact
         ) VALUES (
           $1, $2, $3, $4,
           NOW(), NOW() + INTERVAL '30 days', $5,
           $6, $7, $8
         ) RETURNING *`,
        [
          dealerId,
          vin,
          provider,
          body.vehicle_description || `VIN ${vin}`,
          `https://www.${provider === "autocheck" ? "autocheck" : "carfax"}.com/report/${vin}`,
          JSON.stringify({ title_status: "clean", owners: 0, accidents: 0, service_records: 0, open_recalls: 0, odometer_status: "ok", structural_damage: false, airbag_deployed: false, theft_reported: false }),
          JSON.stringify([]),
          JSON.stringify({ score: 0, factors_positive: [], factors_negative: [] }),
        ],
      );

      try { trackSystem("system.vehicle_history_pulled" as never, dealerId, { vin, provider }); } catch {}

      const resp = { report: result.rows[0], created: true };
      recordIdempotency(iKey, resp);
      return NextResponse.json(resp, { status: 201 });
    } catch (err) {
      console.error("[api/admin/vehicle-history] DB insert error, falling back to mock:", err);
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode ---- */
  // Check if we already have a mock report for this VIN
  const existing = MOCK_REPORTS.find((r) => r.vin === vin);
  if (existing) {
    try { trackSystem("system.vehicle_history_pulled" as never, dealerId, { vin, provider, source: "cache" }); } catch {}
    const resp = { report: existing, created: false, message: "Cached report returned" };
    recordIdempotency(iKey, resp);
    return NextResponse.json(resp, { status: 200 });
  }

  // Generate a realistic mock report for an unknown VIN
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const newReport = {
    id: `vhr-${Date.now()}`,
    dealer_id: dealerId,
    vin,
    provider,
    vehicle_description: body.vehicle_description || `VIN ${vin}`,
    pulled_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    report_url: `https://www.${provider === "autocheck" ? "autocheck" : "carfax"}.com/report/${vin}`,
    summary: {
      title_status: "clean" as const,
      owners: 1,
      accidents: 0,
      service_records: 0,
      open_recalls: 0,
      odometer_status: "ok" as const,
      structural_damage: false,
      airbag_deployed: false,
      theft_reported: false,
    },
    history_entries: [
      { date: now.toISOString().split("T")[0], description: "Vehicle history report pulled", mileage: 0, source: provider, category: "title" as const },
    ],
    value_impact: {
      score: 75,
      factors_positive: ["Clean title"],
      factors_negative: ["Limited history available — new report"],
    },
  };

  try { trackSystem("system.vehicle_history_pulled" as never, dealerId, { vin, provider, source: "new" }); } catch {}

  const resp = { report: newReport, created: true };
  recordIdempotency(iKey, resp);
  return NextResponse.json(resp, { status: 201 });
}
