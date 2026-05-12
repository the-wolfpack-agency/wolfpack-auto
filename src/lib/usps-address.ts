/**
 * USPS Web Tools Address Validation client.
 *
 * Free public API. Requires registering for a USERID at:
 *   https://www.usps.com/business/web-tools-apis/
 *
 * Endpoint: https://secure.shippingapis.com/ShippingAPI.dll
 * API: Verify (verifies + canonicalizes a US address)
 *
 * The endpoint accepts XML over GET, returns XML. We do NOT pull in a parser
 * dependency for this — the XML payload is small, well-shaped, and we use a
 * narrow regex/extract approach against the documented response fields.
 *
 * Behavior contract:
 *   - If USPS_USER_ID is unset -> return { validated: false,
 *     reason: 'service_not_configured' }. No 5xx.
 *   - 24h Redis cache (via @/lib/cache) keyed on the normalized input string.
 *   - Fail-open on USPS upstream errors (logged, not thrown).
 *   - Status mapping (matches the address_validations CHECK constraint):
 *       valid          USPS returned a clean canonical address
 *       correctable    USPS returned a canonical address that differs from input
 *       invalid        USPS returned an error code for the input
 *       unverifiable   service_not_configured, network failure, malformed reply
 */

import { cacheGet, cacheSet } from "@/lib/cache";

export type AddressValidationStatus =
  | "valid"
  | "invalid"
  | "correctable"
  | "unverifiable";

export interface AddressInput {
  street1: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface AddressComponents {
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  zip5: string | null;
  zip4: string | null;
  dpv_confirmation: string | null;
}

export interface AddressValidationResult {
  validated: boolean;
  status: AddressValidationStatus;
  reason?:
    | "service_not_configured"
    | "upstream_error"
    | "invalid_input"
    | "usps_error";
  input_address: string;
  canonical_address: string | null;
  components: AddressComponents;
  source: "usps" | "cache" | "unverifiable";
  looked_up_at: string;
}

const USPS_ENDPOINT = "https://secure.shippingapis.com/ShippingAPI.dll";
const CACHE_TTL_SEC = 24 * 60 * 60; // 24h cache to stay well under rate limits
const FETCH_TIMEOUT_MS = 8_000;
const CACHE_PREFIX = "usps:addr:";

/* ---------------------------------------------------------------------- */
/*  Helpers                                                                */
/* ---------------------------------------------------------------------- */

/**
 * Normalize an address into the canonical input string used as the cache key
 * and persisted as `address_validations.input_address`.
 */
export function normalizeAddressKey(addr: AddressInput): string {
  const parts = [
    addr.street1,
    addr.street2,
    addr.city,
    addr.state,
    addr.zip,
  ]
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0);
  return parts.join(", ").toUpperCase();
}

/**
 * Extract a single XML element's text content. Returns null when absent.
 * USPS responses are small + well-shaped — no need for a full parser.
 */
export function extractXmlField(xml: string, field: string): string | null {
  const pattern = new RegExp(
    `<${field}>([\\s\\S]*?)<\\/${field}>`,
    "i",
  );
  const m = xml.match(pattern);
  if (!m) return null;
  const value = m[1].trim();
  return value.length > 0 ? value : null;
}

/**
 * Detect a USPS-returned <Error> block. Returns the description if present.
 */
export function extractUspsError(xml: string): string | null {
  return extractXmlField(xml, "Description");
}

/**
 * Build the USPS Verify request XML for a single address.
 *
 * Format documented at:
 *   https://www.usps.com/business/web-tools-apis/address-information-api.pdf
 */
export function buildVerifyXml(addr: AddressInput, userId: string): string {
  const esc = (s: string | undefined): string =>
    (s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  return (
    `<AddressValidateRequest USERID="${esc(userId)}">` +
    `<Revision>1</Revision>` +
    `<Address ID="0">` +
    `<Address1>${esc(addr.street2)}</Address1>` +
    `<Address2>${esc(addr.street1)}</Address2>` +
    `<City>${esc(addr.city)}</City>` +
    `<State>${esc(addr.state)}</State>` +
    `<Zip5>${esc(addr.zip?.slice(0, 5))}</Zip5>` +
    `<Zip4>${esc(addr.zip?.length === 10 ? addr.zip.slice(6) : "")}</Zip4>` +
    `</Address>` +
    `</AddressValidateRequest>`
  );
}

/**
 * Build the canonical-address string from extracted components.
 * Empty / null components are omitted; field ordering matches a US-postal
 * envelope render.
 */
function buildCanonicalString(c: AddressComponents): string | null {
  const line1 = c.street1 ?? "";
  const line2 = c.street2 ?? "";
  const cityStateZip = [
    c.city ?? "",
    c.state ?? "",
    c.zip5 ?? "",
  ]
    .filter((p) => p.length > 0)
    .join(" ");
  const lines = [
    [line1, line2].filter((p) => p.length > 0).join(" "),
    cityStateZip,
  ].filter((p) => p.length > 0);
  return lines.length > 0 ? lines.join(", ").toUpperCase() : null;
}

/* ---------------------------------------------------------------------- */
/*  Response parsing                                                       */
/* ---------------------------------------------------------------------- */

/**
 * Parse a USPS Verify response payload into our canonical components +
 * status. Pure function — exported for unit testing.
 */
export function parseVerifyResponse(
  xml: string,
  inputKey: string,
): AddressValidationResult {
  const looked_up_at = new Date().toISOString();
  const uspsErr = extractUspsError(xml);
  if (uspsErr) {
    return {
      validated: false,
      status: "invalid",
      reason: "usps_error",
      input_address: inputKey,
      canonical_address: null,
      components: {
        street1: null,
        street2: null,
        city: null,
        state: null,
        zip5: null,
        zip4: null,
        dpv_confirmation: null,
      },
      source: "usps",
      looked_up_at,
    };
  }

  // USPS swaps Address1 / Address2 vs. our intuition: Address2 is the
  // primary line (street + number), Address1 is the secondary (apt/suite).
  const street1 = extractXmlField(xml, "Address2");
  const street2 = extractXmlField(xml, "Address1");
  const city = extractXmlField(xml, "City");
  const state = extractXmlField(xml, "State");
  const zip5 = extractXmlField(xml, "Zip5");
  const zip4 = extractXmlField(xml, "Zip4");
  const dpv = extractXmlField(xml, "DPVConfirmation");

  const components: AddressComponents = {
    street1,
    street2,
    city,
    state,
    zip5,
    zip4,
    dpv_confirmation: dpv,
  };

  const canonical = buildCanonicalString(components);

  // If USPS responded with no usable canonical fields, treat as unverifiable.
  if (!canonical) {
    return {
      validated: false,
      status: "unverifiable",
      reason: "usps_error",
      input_address: inputKey,
      canonical_address: null,
      components,
      source: "usps",
      looked_up_at,
    };
  }

  // Compare normalized canonical against normalized input. Different ->
  // "correctable" (the form should re-render with corrected fields); same
  // -> "valid".
  const status: AddressValidationStatus =
    canonical === inputKey ? "valid" : "correctable";

  return {
    validated: true,
    status,
    input_address: inputKey,
    canonical_address: canonical,
    components,
    source: "usps",
    looked_up_at,
  };
}

/* ---------------------------------------------------------------------- */
/*  Public API                                                             */
/* ---------------------------------------------------------------------- */

/**
 * Graceful "service not configured" result — emitted when USPS_USER_ID is
 * unset. Allows the route to still return 200 + a structured body rather
 * than 5xx-ing.
 */
export function unconfiguredResult(inputKey: string): AddressValidationResult {
  return {
    validated: false,
    status: "unverifiable",
    reason: "service_not_configured",
    input_address: inputKey,
    canonical_address: null,
    components: {
      street1: null,
      street2: null,
      city: null,
      state: null,
      zip5: null,
      zip4: null,
      dpv_confirmation: null,
    },
    source: "unverifiable",
    looked_up_at: new Date().toISOString(),
  };
}

/**
 * Validate + canonicalize a US address against USPS Web Tools.
 *
 * Behavior:
 *   - USPS_USER_ID unset -> unconfigured result, no network call.
 *   - Cache hit -> return persisted result with source: "cache".
 *   - Fresh -> XML request -> parse -> cache -> return.
 *
 * NEVER throws. Network errors collapse to status: "unverifiable".
 */
export async function validateAddress(
  addr: AddressInput,
  options: { skipCache?: boolean } = {},
): Promise<AddressValidationResult> {
  const inputKey = normalizeAddressKey(addr);

  if (inputKey.length === 0) {
    return {
      validated: false,
      status: "invalid",
      reason: "invalid_input",
      input_address: "",
      canonical_address: null,
      components: {
        street1: null,
        street2: null,
        city: null,
        state: null,
        zip5: null,
        zip4: null,
        dpv_confirmation: null,
      },
      source: "unverifiable",
      looked_up_at: new Date().toISOString(),
    };
  }

  const userId = process.env.USPS_USER_ID;
  if (!userId || userId.trim().length === 0) {
    return unconfiguredResult(inputKey);
  }

  // Cache-first
  if (!options.skipCache) {
    try {
      const cached = await cacheGet<AddressValidationResult>(
        `${CACHE_PREFIX}${inputKey}`,
      );
      if (cached) {
        return { ...cached, source: "cache" };
      }
    } catch {
      /* cache reads must not break the request */
    }
  }

  const xml = buildVerifyXml(addr, userId);
  const url = `${USPS_ENDPOINT}?API=Verify&XML=${encodeURIComponent(xml)}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/xml" },
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[usps-address] HTTP ${res.status} from USPS`);
      return {
        validated: false,
        status: "unverifiable",
        reason: "upstream_error",
        input_address: inputKey,
        canonical_address: null,
        components: {
          street1: null,
          street2: null,
          city: null,
          state: null,
          zip5: null,
          zip4: null,
          dpv_confirmation: null,
        },
        source: "unverifiable",
        looked_up_at: new Date().toISOString(),
      };
    }

    const xmlBody = await res.text();
    const parsed = parseVerifyResponse(xmlBody, inputKey);

    if (parsed.validated || parsed.status === "correctable") {
      try {
        await cacheSet(`${CACHE_PREFIX}${inputKey}`, parsed, CACHE_TTL_SEC);
      } catch {
        /* non-fatal */
      }
    }
    return parsed;
  } catch (err) {
    console.warn(
      "[usps-address] fetch failed (returning unverifiable):",
      err instanceof Error ? err.message : String(err),
    );
    return {
      validated: false,
      status: "unverifiable",
      reason: "upstream_error",
      input_address: inputKey,
      canonical_address: null,
      components: {
        street1: null,
        street2: null,
        city: null,
        state: null,
        zip5: null,
        zip4: null,
        dpv_confirmation: null,
      },
      source: "unverifiable",
      looked_up_at: new Date().toISOString(),
    };
  }
}
