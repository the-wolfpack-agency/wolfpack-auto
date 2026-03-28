/**
 * GET /api/admin/vin-decode?vin=1HGCV1F34PA000001
 *
 * Decodes a VIN and returns auto-populated vehicle specs.
 * Results are cached in-memory (1 hour TTL) since VIN data never changes.
 */

import { NextRequest, NextResponse } from "next/server";
import { decodeVIN, isValidVIN } from "@/lib/intake/vin-decoder";
import type { DecodedVIN } from "@/lib/intake/vin-decoder";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

/* ------------------------------------------------------------------ */
/*  In-memory cache (1 hour TTL)                                       */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  data: DecodedVIN;
  expires: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const globalForCache = globalThis as unknown as {
  __vinCache?: Map<string, CacheEntry>;
};

function getCache(): Map<string, CacheEntry> {
  if (!globalForCache.__vinCache) {
    globalForCache.__vinCache = new Map();
  }
  return globalForCache.__vinCache;
}

/**
 * Evict expired entries periodically (lazy cleanup on each request).
 * Only runs when the cache exceeds 500 entries to avoid overhead.
 */
function evictExpired(cache: Map<string, CacheEntry>): void {
  if (cache.size < 500) return;

  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expires < now) {
      cache.delete(key);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  // --- Authentication ---
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  // VIN decode is pure computation (no DB), but check DATABASE_URL for
  // consistent shadow mode pattern across all admin routes.
  if (!process.env.DATABASE_URL) {
    // Proceed — VIN decode works without a database
  }

  const vin = request.nextUrl.searchParams.get("vin")?.trim().toUpperCase();

  if (!vin) {
    return NextResponse.json(
      { error: "Missing required query parameter: vin" },
      { status: 400 },
    );
  }

  if (!isValidVIN(vin)) {
    return NextResponse.json(
      {
        error: "Invalid VIN format. Must be 17 alphanumeric characters (no I, O, or Q).",
      },
      { status: 400 },
    );
  }

  // Check cache
  const cache = getCache();
  evictExpired(cache);

  const cached = cache.get(vin);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json({
      vin,
      decoded: cached.data,
      cached: true,
    });
  }

  // Decode
  const decoded = await decodeVIN(vin);

  if (!decoded) {
    return NextResponse.json(
      { error: "Unable to decode VIN. The VIN may be invalid or the decode service is unavailable." },
      { status: 422 },
    );
  }

  // Cache the result
  cache.set(vin, {
    data: decoded,
    expires: Date.now() + CACHE_TTL_MS,
  });

  return NextResponse.json({
    vin,
    decoded,
    cached: false,
  });
}
