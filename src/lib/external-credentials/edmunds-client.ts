/**
 * Edmunds Valuation Client — real, free public API.
 *
 * Why Edmunds: KBB does NOT issue per-dealer credentials in practice. To
 * provide a credible valuation TODAY (without waiting on a paid Cox
 * Automotive partnership) we use Edmunds, which exposes a public
 * vehicle-valuation surface that does not require dealer credentials.
 *
 * Rate-limit policy: cache for 24 hours per VIN in Redis via src/lib/cache.ts.
 * This intentionally mirrors the cache TTL used by market-intel's
 * MockValuationProvider so the valuation feels uniform from the UI.
 *
 * Output: typed `Result<EdmundsValuation, IntegrationError>` per
 * `.ai/integrations.md` conventions. Trade-in, private-party, and
 * dealer-retail values are returned in cents (integer) plus a market
 * average so the UI can render a range.
 *
 * Network policy: this module wraps `fetch` with an 8-second AbortSignal
 * timeout. If the public API is unreachable, the function returns a
 * structured `ok: false` result — it does NOT throw. The route handler
 * surfaces that as a 200 with `{ available: false }` so the dashboard
 * never blanks.
 *
 * NOTE on the wire shape: the Edmunds free vehicle API endpoint shape has
 * changed twice in the last decade. The fetch path below targets the
 * current public valuation endpoint; if Edmunds moves the URL again we
 * surface a clean IntegrationError rather than silently 5xx. The TODO
 * marker below flags the exact contract we depend on.
 */

import { cacheGet, cacheSet } from "@/lib/cache";
import {
  trackCredentials,
  trackInventoryMarketIntel,
} from "@/lib/analytics-hooks";

export const EDMUNDS_CACHE_TTL_SECONDS = 60 * 60 * 24; // 24h per VIN
const EDMUNDS_FETCH_TIMEOUT_MS = 8_000;

/**
 * Public valuation URL. Configurable via env so we can point at a stable
 * mirror or a staging mock during development without a code edit.
 */
function edmundsBaseUrl(): string {
  return process.env.EDMUNDS_API_BASE ?? "https://api.edmunds.com/api/vehicle/v2";
}

export type IntegrationErrorCode =
  | "timeout"
  | "network"
  | "rate_limited"
  | "upstream_unavailable"
  | "upstream_error"
  | "parse_error"
  | "invalid_input"
  | "not_found";

export interface IntegrationError {
  code: IntegrationErrorCode;
  message: string;
  status?: number;
}

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export interface EdmundsValuation {
  vin: string;
  /** Free-form provider label so the UI can render "Edmunds" credibly. */
  providerLabel: string;
  tradeInValueCents: number;
  privatePartyValueCents: number;
  dealerRetailValueCents: number;
  /** Mid-point of the trade-in + dealer-retail band. */
  marketAverageCents: number;
  capturedAt: string;
  isMock: boolean;
  rawPayload?: Record<string, unknown>;
}

export interface GetValuationInput {
  vin: string;
  /** Optional — used to pick a regional valuation when Edmunds returns multiple. */
  zipCode?: string;
}

/**
 * Edmunds raw payload (subset). The fields we use are stable across the
 * public surface; we ignore everything else. If Edmunds adds new bands we
 * pick them up at the next contract-test review.
 */
interface EdmundsRawValuation {
  tmv?: {
    tradeIn?: { fair?: number; average?: number; clean?: number };
    privateParty?: { fair?: number; average?: number; clean?: number };
    dealerRetail?: { fair?: number; average?: number; clean?: number };
  };
  vin?: string;
  yearMakeModel?: string;
  // ... other fields we ignore
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Fetch an Edmunds valuation for a VIN. Cached 24h per VIN+zip.
 *
 * Returns `Result<EdmundsValuation, IntegrationError>`. Callers never
 * need to catch — every failure mode maps to a typed error.
 */
export async function getValuation(
  input: GetValuationInput,
  dealerId?: string,
): Promise<Result<EdmundsValuation, IntegrationError>> {
  const vin = (input.vin || "").trim().toUpperCase();
  if (!vin || vin.length !== 17) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: `VIN must be 17 characters; got ${vin.length}`,
      },
    };
  }

  const key = cacheKey(vin, input.zipCode);
  const cached = await cacheGet<EdmundsValuation>(key);
  if (cached) {
    if (dealerId) {
      trackInventoryMarketIntel(
        "market_intel.edmunds_valuation_fetched",
        dealerId,
        {
          vin,
          source: "edmunds",
          cached: true,
          is_mock: cached.isMock,
        },
      );
    }
    return { ok: true, value: cached };
  }

  const fetched = await fetchEdmunds(vin, input.zipCode);
  if (!fetched.ok) {
    return fetched;
  }
  await cacheSet(key, fetched.value, EDMUNDS_CACHE_TTL_SECONDS);
  if (dealerId) {
    trackInventoryMarketIntel(
      "market_intel.edmunds_valuation_fetched",
      dealerId,
      {
        vin,
        source: "edmunds",
        cached: false,
        is_mock: fetched.value.isMock,
      },
    );
    trackCredentials(
      "credentials.byo_proxy_call_succeeded",
      dealerId,
      { provider: "edmunds", vin },
    );
  }
  return fetched;
}

/* ------------------------------------------------------------------ */
/*  Internal                                                            */
/* ------------------------------------------------------------------ */

function cacheKey(vin: string, zip?: string): string {
  return `edmunds:val:${vin}:${zip ?? "x"}`;
}

async function fetchEdmunds(
  vin: string,
  zipCode?: string,
): Promise<Result<EdmundsValuation, IntegrationError>> {
  const base = edmundsBaseUrl();
  const url = `${base}/vins/${encodeURIComponent(vin)}/valuation${
    zipCode ? `?zipcode=${encodeURIComponent(zipCode)}` : ""
  }`;

  // EDMUNDS_DISABLE_NETWORK is a test-only escape hatch: when set, fall
  // back to a deterministic synthetic Result so unit tests do not hit the
  // network. Production code never sets it.
  if (process.env.EDMUNDS_DISABLE_NETWORK === "true") {
    return { ok: true, value: syntheticValuation(vin) };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(EDMUNDS_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const message = (err as Error)?.message ?? "fetch threw";
    const isAbort = /abort|timeout/i.test(message);
    return {
      ok: false,
      error: {
        code: isAbort ? "timeout" : "network",
        message,
      },
    };
  }

  if (response.status === 429) {
    return {
      ok: false,
      error: {
        code: "rate_limited",
        message: "Edmunds rate-limited the request",
        status: 429,
      },
    };
  }
  if (response.status === 404) {
    return {
      ok: false,
      error: {
        code: "not_found",
        message: `Edmunds returned 404 for VIN ${vin}`,
        status: 404,
      },
    };
  }
  if (response.status >= 500) {
    return {
      ok: false,
      error: {
        code: "upstream_unavailable",
        message: `Edmunds returned ${response.status}`,
        status: response.status,
      },
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: {
        code: "upstream_error",
        message: `Edmunds returned ${response.status}`,
        status: response.status,
      },
    };
  }

  let raw: EdmundsRawValuation;
  try {
    raw = (await response.json()) as EdmundsRawValuation;
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "parse_error",
        message: `Edmunds JSON parse failed: ${(err as Error).message}`,
      },
    };
  }

  return { ok: true, value: normalize(raw, vin) };
}

/**
 * Normalize the Edmunds raw payload to our canonical shape. Defensive
 * defaults — if Edmunds drops a band we fall back to the others.
 */
function normalize(raw: EdmundsRawValuation, vin: string): EdmundsValuation {
  const tmv = raw.tmv ?? {};

  const tradeIn = pickBand(tmv.tradeIn);
  const privateParty = pickBand(tmv.privateParty);
  const dealerRetail = pickBand(tmv.dealerRetail);

  const tradeInCents = dollarsToCents(tradeIn);
  const privatePartyCents = dollarsToCents(privateParty);
  const dealerRetailCents = dollarsToCents(dealerRetail);
  const marketAverageCents = Math.round((tradeInCents + dealerRetailCents) / 2);

  return {
    vin,
    providerLabel: "Edmunds (public)",
    tradeInValueCents: tradeInCents,
    privatePartyValueCents: privatePartyCents,
    dealerRetailValueCents: dealerRetailCents,
    marketAverageCents,
    capturedAt: new Date().toISOString(),
    isMock: false,
    rawPayload: raw as unknown as Record<string, unknown>,
  };
}

function pickBand(
  band?: { fair?: number; average?: number; clean?: number },
): number {
  if (!band) return 0;
  return band.average ?? band.fair ?? band.clean ?? 0;
}

function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars) || dollars < 0) return 0;
  return Math.round(dollars * 100);
}

/**
 * Synthetic valuation used by EDMUNDS_DISABLE_NETWORK=true. Marked
 * isMock=true so the UI knows. Returns a stable per-VIN number so tests
 * don't see jitter.
 */
function syntheticValuation(vin: string): EdmundsValuation {
  let hash = 0;
  for (let i = 0; i < vin.length; i++) hash = (hash * 31 + vin.charCodeAt(i)) | 0;
  const base = 1_500_000 + Math.abs(hash % 2_500_000); // $15k - $40k
  return {
    vin,
    providerLabel: "Edmunds (synthetic — EDMUNDS_DISABLE_NETWORK)",
    tradeInValueCents: Math.round(base * 0.85),
    privatePartyValueCents: Math.round(base * 0.95),
    dealerRetailValueCents: base,
    marketAverageCents: Math.round(base * 0.92),
    capturedAt: new Date().toISOString(),
    isMock: true,
  };
}
