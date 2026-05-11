/**
 * Public status / uptime endpoint — backs the `/status` page.
 *
 * Contract:
 *   - GET, public, no auth.
 *   - Always returns HTTP 200, even when every dependency is down.
 *     The status page must render during an outage; throwing here would
 *     defeat the entire point.
 *   - Cached in-memory for 60s to avoid hammering downstreams.
 *
 * All logic + types live in @/lib/status/types so this file only exports
 * valid Next.js route fields.
 */

import { NextResponse } from "next/server";
import { getStatusPayload } from "@/lib/status/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await getStatusPayload();
  return NextResponse.json(payload, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}
