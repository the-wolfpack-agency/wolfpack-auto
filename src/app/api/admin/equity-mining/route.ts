import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackEquityMining } from "@/lib/analytics-hooks";
import {
  appraiseVehicle,
  calculateEquityPosition,
  generateEquityMiningCampaign,
  type VehicleCondition,
} from "@/lib/equity-mining";

/* -------------------------------------------------------------------------- */
/* Demo data — returned in shadow mode (no DATABASE_URL)                       */
/* -------------------------------------------------------------------------- */

const DEMO_OPPORTUNITIES = [
  {
    customerId: "cust-001",
    customerName: "Sarah Johnson",
    currentVehicle: {
      vin: "1HGCV1F34LA000001",
      year: 2020,
      make: "Honda",
      model: "Accord",
      mileage: 52000,
      lastServiceDate: "2026-02-15",
    },
    equityPosition: {
      vehicleValue: 22500,
      loanBalance: 14200,
      equity: 8300,
      isPositive: true,
      description: "Positive equity of $8,300 — trade-in credit available",
    },
    vehicleAgeYears: 6,
    score: 78,
    suggestedReplacements: [
      {
        id: "inv-101",
        year: 2025,
        make: "Honda",
        model: "Accord EX",
        price: 32990,
        estimatedMonthlyPayment: 385,
        paymentDifference: -25,
        segment: "sedan",
      },
      {
        id: "inv-102",
        year: 2025,
        make: "Toyota",
        model: "Camry LE",
        price: 29995,
        estimatedMonthlyPayment: 340,
        paymentDifference: -70,
        segment: "sedan",
      },
    ],
  },
  {
    customerId: "cust-002",
    customerName: "Mike Rodriguez",
    currentVehicle: {
      vin: "5TFDY5F10LX000002",
      year: 2020,
      make: "Toyota",
      model: "Tundra",
      mileage: 68000,
      lastServiceDate: "2026-03-10",
    },
    equityPosition: {
      vehicleValue: 34200,
      loanBalance: 21000,
      equity: 13200,
      isPositive: true,
      description: "Positive equity of $13,200 — trade-in credit available",
    },
    vehicleAgeYears: 6,
    score: 85,
    suggestedReplacements: [
      {
        id: "inv-201",
        year: 2026,
        make: "Toyota",
        model: "Tundra SR5",
        price: 44990,
        estimatedMonthlyPayment: 510,
        paymentDifference: -15,
        segment: "truck",
      },
    ],
  },
  {
    customerId: "cust-003",
    customerName: "Emily Chen",
    currentVehicle: {
      vin: "WBAJA5C50KB000003",
      year: 2019,
      make: "BMW",
      model: "530i",
      mileage: 45000,
      lastServiceDate: "2026-01-20",
    },
    equityPosition: {
      vehicleValue: 28800,
      loanBalance: 18500,
      equity: 10300,
      isPositive: true,
      description: "Positive equity of $10,300 — trade-in credit available",
    },
    vehicleAgeYears: 7,
    score: 82,
    suggestedReplacements: [
      {
        id: "inv-301",
        year: 2025,
        make: "BMW",
        model: "530i xDrive",
        price: 57500,
        estimatedMonthlyPayment: 720,
        paymentDifference: 20,
        segment: "luxury",
      },
    ],
  },
];

const DEMO_STATS = {
  avgEquity: 10600,
  topSegments: ["sedan", "truck", "luxury"],
  totalPotentialRevenue: 89975,
};

/* -------------------------------------------------------------------------- */
/* GET /api/admin/equity-mining                                                */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = auth.user.dealer_id;

  // Shadow mode — return demo data
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      opportunities: DEMO_OPPORTUNITIES,
      stats: DEMO_STATS,
      totalCustomersScanned: 127,
      opportunitiesFound: DEMO_OPPORTUNITIES.length,
      scannedAt: new Date().toISOString(),
    });
  }

  try {
    const { query } = await import("@/lib/db");

    // Fetch customers with service history and vehicle info
    const customersResult = await query<{
      id: string;
      name: string;
      vin: string;
      mileage: number;
      condition: string;
      loan_balance: number;
      monthly_payment: number;
      last_service_date: string;
      vehicle_model: string;
    }>(
      `SELECT
         c.id, COALESCE(c.first_name || ' ' || c.last_name, c.email) AS name,
         v.vin, v.mileage,
         COALESCE(v.condition, 'good') AS condition,
         COALESCE(v.loan_balance, 0) AS loan_balance,
         COALESCE(v.monthly_payment, 0) AS monthly_payment,
         v.last_service_date,
         COALESCE(v.model, 'Unknown') AS vehicle_model
       FROM customers c
       JOIN customer_vehicles v ON v.customer_id = c.id
       WHERE c.dealer_id = $1
         AND v.vin IS NOT NULL
         AND v.last_service_date IS NOT NULL
       ORDER BY v.last_service_date DESC
       LIMIT 500`,
      [dealerId],
    );

    // Fetch dealer inventory
    const inventoryResult = await query<{
      id: string;
      year: number;
      make: string;
      model: string;
      price: number;
      body_style: string;
    }>(
      `SELECT id, year, make, model, price, COALESCE(body_style, 'sedan') AS body_style
       FROM vehicles
       WHERE dealer_id = $1 AND status = 'available' AND price > 0
       ORDER BY price ASC
       LIMIT 200`,
      [dealerId],
    );

    const customers = customersResult.rows.map((r) => ({
      id: r.id,
      name: r.name,
      vin: r.vin,
      mileage: r.mileage ?? 50000,
      condition: (r.condition as VehicleCondition) || "good",
      loanBalance: r.loan_balance,
      currentMonthlyPayment: r.monthly_payment || 400,
      lastServiceDate: r.last_service_date,
      vehicleModel: r.vehicle_model,
    }));

    const inventory = inventoryResult.rows.map((r) => ({
      id: r.id,
      year: r.year,
      make: r.make,
      model: r.model,
      price: r.price,
      segment: r.body_style,
    }));

    const campaign = generateEquityMiningCampaign(dealerId, customers, inventory);

    return NextResponse.json({
      opportunities: campaign.opportunities,
      stats: campaign.stats,
      totalCustomersScanned: campaign.totalCustomersScanned,
      opportunitiesFound: campaign.opportunitiesFound,
      scannedAt: campaign.scannedAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({
        opportunities: DEMO_OPPORTUNITIES,
        stats: DEMO_STATS,
        totalCustomersScanned: 0,
        opportunitiesFound: 0,
        scannedAt: new Date().toISOString(),
      });
    }
    console.error("[equity-mining] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load equity mining data" },
      { status: 500 },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/equity-mining                                               */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = auth.user.dealer_id;

  let body: { vin?: string; mileage?: number; condition?: string; customerId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Shadow mode — return a demo appraisal
  if (!process.env.DATABASE_URL) {
    const vin = body.vin ?? "1HGCV1F34LA000001";
    const mileage = body.mileage ?? 50000;
    const condition = (body.condition as VehicleCondition) ?? "good";

    const appraisal = appraiseVehicle(vin, mileage, condition);
    const equity = calculateEquityPosition(appraisal.estimatedValue, 15000);

    trackEquityMining("equity.appraisal_generated", dealerId, {
      vin,
      estimated_value: appraisal.estimatedValue,
      equity: equity.equity,
    });

    return NextResponse.json({
      appraisal,
      equityPosition: equity,
      message: "Appraisal generated (demo mode)",
    });
  }

  try {
    if (!body.vin) {
      return NextResponse.json(
        { error: "VIN is required" },
        { status: 400 },
      );
    }

    const mileage = body.mileage ?? 50000;
    const condition = (body.condition as VehicleCondition) ?? "good";

    const appraisal = appraiseVehicle(body.vin, mileage, condition);

    // Look up loan balance if customer ID provided
    let loanBalance = 0;
    if (body.customerId) {
      const { query } = await import("@/lib/db");
      const loanResult = await query<{ loan_balance: number }>(
        `SELECT COALESCE(loan_balance, 0) AS loan_balance
         FROM customer_vehicles
         WHERE customer_id = $1 AND vin = $2
         LIMIT 1`,
        [body.customerId, body.vin],
      );
      loanBalance = loanResult.rows[0]?.loan_balance ?? 0;
    }

    const equity = calculateEquityPosition(appraisal.estimatedValue, loanBalance);

    trackEquityMining("equity.appraisal_generated", dealerId, {
      vin: body.vin,
      estimated_value: appraisal.estimatedValue,
      equity: equity.equity,
    });

    return NextResponse.json({ appraisal, equityPosition: equity });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      const vin = body.vin ?? "unknown";
      const mileage = body.mileage ?? 50000;
      const condition = (body.condition as VehicleCondition) ?? "good";
      const appraisal = appraiseVehicle(vin, mileage, condition);
      const equity = calculateEquityPosition(appraisal.estimatedValue, 0);
      return NextResponse.json({ appraisal, equityPosition: equity });
    }
    console.error("[equity-mining] POST error:", err);
    return NextResponse.json(
      { error: "Failed to run equity mining scan" },
      { status: 500 },
    );
  }
}
