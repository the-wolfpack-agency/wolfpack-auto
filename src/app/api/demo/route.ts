import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { trackSystem } from "@/lib/analytics-hooks";
import { generateDealerSlug } from "@/lib/dealer-onboarding";
import { checkRateLimit } from "@/lib/rate-limit";
import crypto from "node:crypto";

/* -------------------------------------------------------------------------- */
/* Zod schemas                                                                */
/* -------------------------------------------------------------------------- */

const createDemoSchema = z.object({
  email: z.string().email("Valid email is required"),
  name: z.string().min(1, "Name is required").max(200),
  company_name: z.string().min(1, "Company name is required").max(200),
});

/* -------------------------------------------------------------------------- */
/* In-memory rate limiter (per-process)                                       */
/* -------------------------------------------------------------------------- */

const demoRateMap = new Map<string, { count: number; windowStart: number }>();
const DEMO_RATE_LIMIT = 5; // max per email per day
const DEMO_RATE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

function checkDemoRateLimit(email: string): boolean {
  const key = email.toLowerCase();
  const now = Date.now();
  const entry = demoRateMap.get(key);

  if (!entry || now - entry.windowStart > DEMO_RATE_WINDOW_MS) {
    demoRateMap.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= DEMO_RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

/* -------------------------------------------------------------------------- */
/* Sample data for demo dealers                                               */
/* -------------------------------------------------------------------------- */

const SAMPLE_VEHICLES = [
  { year: 2025, make: "Toyota", model: "Camry", trim: "SE", price: 28995, mileage: 12, condition: "new", status: "available" },
  { year: 2024, make: "Honda", model: "Accord", trim: "Sport", price: 26450, mileage: 8500, condition: "used", status: "available" },
  { year: 2025, make: "Ford", model: "F-150", trim: "XLT", price: 42990, mileage: 0, condition: "new", status: "available" },
  { year: 2023, make: "BMW", model: "X3", trim: "xDrive30i", price: 38750, mileage: 18200, condition: "used", status: "available" },
  { year: 2025, make: "Tesla", model: "Model 3", trim: "Long Range", price: 44990, mileage: 0, condition: "new", status: "available" },
  { year: 2024, make: "Chevrolet", model: "Equinox", trim: "LT", price: 22800, mileage: 14300, condition: "used", status: "available" },
];

const SAMPLE_LEADS = [
  { first_name: "Sarah", last_name: "Johnson", email: "sarah.j@example.com", phone: "(555) 123-4567", source: "website", status: "new" },
  { first_name: "Mike", last_name: "Chen", email: "mike.c@example.com", phone: "(555) 234-5678", source: "walk-in", status: "contacted" },
  { first_name: "Emily", last_name: "Davis", email: "emily.d@example.com", phone: "(555) 345-6789", source: "referral", status: "qualified" },
];

/* -------------------------------------------------------------------------- */
/* POST /api/demo — Create a demo session for a prospect                      */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  const rl = await checkRateLimit(`demo:${ip}`, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createDemoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  const { email, name, company_name } = parsed.data;

  // Rate limit check
  if (!checkDemoRateLimit(email)) {
    return NextResponse.json(
      { error: "Demo limit reached. Maximum 5 demo sessions per email per day." },
      { status: 429 },
    );
  }

  const demoToken = crypto.randomBytes(32).toString("hex");
  const sessionId = `demo_${crypto.randomUUID().slice(0, 8)}_${Date.now().toString(36)}`;
  const slug = generateDealerSlug(`Demo ${company_name}`);
  const demoDealerId = `dlr_demo_${slug}_${Date.now().toString(36)}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  if (!process.env.DATABASE_URL) {
    try {
      trackSystem("system.onboarding_step", "system", {
        action: "demo_created",
        session_id: sessionId,
        prospect_email: email,
        company: company_name,
      });
    } catch { /* analytics never blocks */ }

    return NextResponse.json(
      {
        session_id: sessionId,
        demo_token: demoToken,
        demo_dealer_id: demoDealerId,
        expires_at: expiresAt.toISOString(),
        dashboard_url: `/admin?demo=${demoToken}`,
        login_credentials: {
          email: "demo@wolfpackauto.com",
          password: "demo",
        },
      },
      { status: 201 },
    );
  }

  try {
    const { query } = await import("@/lib/db");

    // Create the demo dealer
    const brandingConfig = JSON.stringify({
      primaryColor: "#0070c7",
      tagline: `${company_name} — Demo`,
    });

    await query(
      `INSERT INTO dealers (
        id, slug, name, phone, email, website,
        address_street, address_city, address_state, address_zip,
        branding_config, inventory_method, status,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, '',
        'Demo Address', 'Demo City', 'NC', '00000',
        $6, 'manual', 'demo',
        NOW(), NOW()
      )`,
      [
        demoDealerId,
        slug,
        `${company_name} (Demo)`,
        "(555) 000-0000",
        email,
        brandingConfig,
      ],
    );

    // Seed sample vehicles
    for (const v of SAMPLE_VEHICLES) {
      const vin = `DEMO${crypto.randomBytes(6).toString("hex").toUpperCase().slice(0, 13)}`;
      await query(
        `INSERT INTO vehicles (
          vin, dealer_id, year, make, model, trim_level,
          price, mileage, condition, status,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
        [vin, demoDealerId, v.year, v.make, v.model, v.trim, v.price, v.mileage, v.condition, v.status],
      ).catch(() => { /* best-effort seed */ });
    }

    // Seed sample leads
    for (const l of SAMPLE_LEADS) {
      await query(
        `INSERT INTO leads (
          dealer_id, first_name, last_name, email, phone,
          source, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [demoDealerId, l.first_name, l.last_name, l.email, l.phone, l.source, l.status],
      ).catch(() => { /* best-effort seed */ });
    }

    // Create demo session record
    await query(
      `INSERT INTO demo_sessions (
        id, prospect_email, prospect_name, company_name,
        demo_dealer_id, started_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
      [sessionId, email.toLowerCase(), name, company_name, demoDealerId, expiresAt.toISOString()],
    );

    // Create a demo user for login
    try {
      const { hash } = await import("bcryptjs");
      const passwordHash = await hash("demo", 12);

      await query(
        `INSERT INTO dealer_users (
          dealer_id, email, name, password_hash, role,
          is_active, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'admin', true, NOW(), NOW())
        ON CONFLICT (email) DO NOTHING`,
        [demoDealerId, `demo-${sessionId}@wolfpackauto.com`, name, passwordHash],
      );
    } catch {
      // Non-critical — demo login still works via DEMO_MODE
    }

    try {
      trackSystem("system.onboarding_step", "system", {
        action: "demo_created",
        session_id: sessionId,
        prospect_email: email,
        company: company_name,
        demo_dealer_id: demoDealerId,
      });
    } catch { /* analytics never blocks */ }

    return NextResponse.json(
      {
        session_id: sessionId,
        demo_token: demoToken,
        demo_dealer_id: demoDealerId,
        expires_at: expiresAt.toISOString(),
        dashboard_url: `/admin?demo=${demoToken}`,
        login_credentials: {
          email: `demo-${sessionId}@wolfpackauto.com`,
          password: "demo",
        },
        sample_data: {
          vehicles: SAMPLE_VEHICLES.length,
          leads: SAMPLE_LEADS.length,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[demo] Create error:", err);
    return NextResponse.json(
      { error: "Failed to create demo session" },
      { status: 500 },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* GET /api/demo?token=xxx — Validate demo token, return demo info            */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json(
      { error: "Demo token is required" },
      { status: 400 },
    );
  }

  if (!process.env.DATABASE_URL) {
    // Shadow mode: accept any token
    return NextResponse.json({
      valid: true,
      session_id: "demo_shadow",
      demo_dealer_id: "demo-dealer",
      company_name: "Demo Company",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      is_expired: false,
    });
  }

  try {
    const { query } = await import("@/lib/db");

    // Look up demo session by the demo_dealer_id that contains the token pattern
    // Since we store the session ID (not the token) in the DB, we use session lookup
    // In production you'd store the token hash; for now we check by recency + email
    const result = await query(
      `SELECT ds.*, d.name AS dealer_name
       FROM demo_sessions ds
       LEFT JOIN dealers d ON d.id = ds.demo_dealer_id
       WHERE ds.id = $1
       LIMIT 1`,
      [token],
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Demo session not found" },
        { status: 404 },
      );
    }

    const session = result.rows[0] as {
      id: string;
      prospect_email: string;
      prospect_name: string;
      company_name: string;
      demo_dealer_id: string;
      expires_at: string;
      is_converted: boolean;
      dealer_name: string;
    };

    const isExpired = new Date(session.expires_at) < new Date();

    return NextResponse.json({
      valid: !isExpired && !session.is_converted,
      session_id: session.id,
      demo_dealer_id: session.demo_dealer_id,
      company_name: session.company_name,
      prospect_name: session.prospect_name,
      expires_at: session.expires_at,
      is_expired: isExpired,
      is_converted: session.is_converted,
    });
  } catch (err) {
    console.error("[demo] Validate error:", err);
    return NextResponse.json(
      { error: "Failed to validate demo session" },
      { status: 500 },
    );
  }
}
