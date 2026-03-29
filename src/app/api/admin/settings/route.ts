/**
 * GET  /api/admin/settings — return current dealer configuration
 * PUT  /api/admin/settings — update dealer branding/info fields
 */
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { auditLog } from "@/lib/audit-log";
import { DEFAULT_CONFIG } from "@/lib/dealer-config-shared";
import { trackSystem } from "@/lib/analytics-hooks";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const EMAIL_RE = /@/;
const PHONE_DIGIT = /\d{7,}/;

/* -------------------------------------------------------------------------- */
/* GET /api/admin/settings                                                    */
/* -------------------------------------------------------------------------- */

export async function GET(_req: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(DEFAULT_CONFIG);
  }

  const dealerId = authResult.user.dealer_id;

  try {
    const { rows } = await pool.query(
      `SELECT
         id, name, tagline, phone, email,
         address, primary_color, secondary_color, accent_color,
         business_hours, social, logo_url, font_family,
         title_template, meta_description, webhook_url, webhook_events
       FROM dealers WHERE id = $1 LIMIT 1`,
      [dealerId],
    );

    const row = rows[0];
    if (!row) {
      return NextResponse.json(DEFAULT_CONFIG);
    }

    // Normalise address JSONB → flat fields
    const addr = row.address;
    const addrObj = addr && typeof addr === "object" ? addr : null;

    return NextResponse.json({
      id: row.id,
      name: row.name ?? DEFAULT_CONFIG.name,
      tagline: row.tagline ?? DEFAULT_CONFIG.tagline,
      phone: row.phone ?? DEFAULT_CONFIG.phone,
      email: row.email ?? DEFAULT_CONFIG.email,
      address: addrObj ? String(addrObj.street ?? DEFAULT_CONFIG.address) : String(addr ?? DEFAULT_CONFIG.address),
      city: addrObj ? String(addrObj.city ?? DEFAULT_CONFIG.city) : DEFAULT_CONFIG.city,
      state: addrObj ? String(addrObj.state ?? DEFAULT_CONFIG.state) : DEFAULT_CONFIG.state,
      zip: addrObj ? String(addrObj.zip ?? DEFAULT_CONFIG.zip) : DEFAULT_CONFIG.zip,
      logo_url: row.logo_url ?? null,
      primary_color: row.primary_color ?? DEFAULT_CONFIG.primary_color,
      secondary_color: row.secondary_color ?? DEFAULT_CONFIG.secondary_color,
      accent_color: row.accent_color ?? DEFAULT_CONFIG.accent_color,
      business_hours: row.business_hours ?? DEFAULT_CONFIG.business_hours,
      social: row.social ?? DEFAULT_CONFIG.social,
    });
  } catch (err) {
    console.error("[GET /api/admin/settings] Error:", err);
    return NextResponse.json(DEFAULT_CONFIG);
  }
}

/* -------------------------------------------------------------------------- */
/* PUT /api/admin/settings                                                    */
/* -------------------------------------------------------------------------- */

export async function PUT(req: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ...DEFAULT_CONFIG, updated: true });
  }

  const dealerId = authResult.user.dealer_id;

  try {
    const body = await req.json() as Record<string, unknown>;

    // Validate optional colour fields that were provided
    for (const colorField of ["primary_color", "secondary_color", "accent_color"] as const) {
      if (colorField in body && body[colorField] !== null && body[colorField] !== "") {
        if (!HEX_COLOR.test(String(body[colorField]))) {
          return NextResponse.json(
            { error: `${colorField} must be a valid hex color (e.g. #0070c7)` },
            { status: 400 },
          );
        }
      }
    }

    if ("email" in body && body.email && !EMAIL_RE.test(String(body.email))) {
      return NextResponse.json({ error: "email must contain @" }, { status: 400 });
    }

    if ("phone" in body && body.phone && !PHONE_DIGIT.test(String(body.phone).replace(/\D/g, ""))) {
      return NextResponse.json(
        { error: "phone must contain at least 7 digits" },
        { status: 400 },
      );
    }

    // Build address JSONB update if any address field is present
    const addressFields = ["address", "city", "state", "zip"] as const;
    const hasAddressField = addressFields.some((f) => f in body);

    const setClauses: string[] = [];
    const params: unknown[] = [dealerId];
    let idx = 2;

    const scalarFields = [
      "name", "tagline", "phone", "email",
      "primary_color", "secondary_color", "accent_color", "font_family",
      "title_template", "meta_description",
      "webhook_url",
    ] as const;
    for (const field of scalarFields) {
      if (field in body) {
        setClauses.push(`${field} = $${idx}`);
        params.push(body[field]);
        idx++;
      }
    }

    if (hasAddressField) {
      // Merge with existing address JSONB
      setClauses.push(
        `address = COALESCE(address, '{}') || $${idx}::jsonb`,
      );
      const addrPatch: Record<string, unknown> = {};
      if ("address" in body) addrPatch.street = body.address;
      if ("city" in body) addrPatch.city = body.city;
      if ("state" in body) addrPatch.state = body.state;
      if ("zip" in body) addrPatch.zip = body.zip;
      params.push(JSON.stringify(addrPatch));
      idx++;
    }

    if ("business_hours" in body) {
      setClauses.push(`business_hours = $${idx}`);
      params.push(JSON.stringify(body.business_hours));
      idx++;
    }

    if ("webhook_events" in body) {
      setClauses.push(`webhook_events = $${idx}`);
      params.push(JSON.stringify(body.webhook_events));
      idx++;
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 },
      );
    }

    const sql = `
      UPDATE dealers
      SET ${setClauses.join(", ")}, updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, tagline, phone, email,
                address, primary_color, secondary_color, accent_color,
                business_hours, social, logo_url
    `;

    const { rows } = await pool.query(sql, params);
    const updated = rows[0];

    if (!updated) {
      return NextResponse.json({ error: "Dealer not found" }, { status: 404 });
    }

    void auditLog("dealer.settings.update", {
      fields_changed: Object.keys(body),
    }).catch(() => {});

    try { trackSystem("system.settings_updated", authResult?.user?.dealer_id ?? "system", { action: "settings_updated" }); } catch {}
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PUT /api/admin/settings] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
