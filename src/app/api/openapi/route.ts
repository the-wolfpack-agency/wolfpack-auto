import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { trackSystem } from "@/lib/analytics-hooks";

/**
 * GET /api/openapi
 *
 * Returns the auto-generated OpenAPI 3.1 spec for Wolfpack Auto.
 * Unauthenticated — the spec is safe to expose publicly and is required
 * by API clients for integration.
 *
 * Cache-Control: no-store ensures clients always get the latest spec after
 * a deploy (which regenerates the file via `npm run openapi`).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const specPath = path.join(process.cwd(), "public", "openapi.json");

  let specContent: string;
  try {
    specContent = fs.readFileSync(specPath, "utf-8");
  } catch {
    return NextResponse.json(
      { error: "OpenAPI spec not found. Run `npm run openapi` to generate it." },
      { status: 404 },
    );
  }

  // Analytics: emit system.openapi_fetched so we can see who's consuming the spec.
  // Fire-and-forget — must never block the response.
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
  // Hash the IP for privacy — we want cardinality metrics, not PII logs.
  const clientIpHash = crypto.createHash("sha256").update(clientIp).digest("hex").slice(0, 16);

  trackSystem("system.openapi_fetched", "system", {
    user_agent: userAgent.slice(0, 200),  // cap length to stay within varchar limits
    client_ip_hash: clientIpHash,
  });

  let spec: unknown;
  try {
    spec = JSON.parse(specContent);
  } catch {
    return NextResponse.json(
      { error: "OpenAPI spec is malformed JSON." },
      { status: 500 },
    );
  }

  return NextResponse.json(spec, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",  // spec is public; allow CORS for API explorers
    },
  });
}
