import { NextRequest, NextResponse } from "next/server";
import { decodeVIN, isValidVIN } from "@/lib/intake/vin-decoder";

/**
 * POST /api/trade-in/decode-vin
 *
 * Accepts a VIN, decodes it via NHTSA vPIC (free, no key required),
 * and returns the fields needed to autofill the trade-in wizard.
 *
 * Rate-limited to 20 requests per IP per hour.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const vin = typeof (body as { vin?: unknown }).vin === "string"
    ? (body as { vin: string }).vin.trim().toUpperCase()
    : null;

  if (!vin) {
    return NextResponse.json({ error: "vin is required" }, { status: 400 });
  }

  if (!isValidVIN(vin)) {
    return NextResponse.json(
      { error: "Invalid VIN format. A VIN is exactly 17 characters (letters A-H, J-N, P-Z and digits 0-9)." },
      { status: 422 },
    );
  }

  // Optional rate limit — only when Redis/DB is available
  if (process.env.DATABASE_URL) {
    try {
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request.headers.get("x-real-ip") ??
        "unknown";
      const { checkRateLimit } = await import("@/lib/rate-limit");
      const rateCheck = await checkRateLimit(`trade-in-decode:${ip}`, 20, 3600);
      if (!rateCheck.allowed) {
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429 },
        );
      }
    } catch {
      // Redis unavailable — fail open
    }
  }

  const decoded = await decodeVIN(vin);

  if (!decoded) {
    return NextResponse.json(
      { error: "Could not decode this VIN. Please enter your vehicle details manually." },
      { status: 404 },
    );
  }

  // Return only the fields the trade-in wizard needs
  return NextResponse.json({
    vin,
    year: decoded.year,
    make: decoded.make,
    model: decoded.model,
    trim: decoded.trim ?? "",
  });
}
