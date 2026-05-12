/**
 * QR-code touchpoint handler.
 *
 * Accepts four payload shapes:
 *
 *   1. wolfpack_uri  -- `wp://qr/{tenant_id}/{touchpoint_id}` (canonical)
 *   2. wp_signed     -- `wp1.{base64url(claims)}.{base64url(hmac-sha256)}`
 *                       (signed envelope, verified against tenant secret)
 *   3. url           -- plain http(s) URL; touchpoint_id derived from the
 *                       last path segment
 *   4. json          -- `{"touchpoint_id":"...","tenant_id":"...",...}`
 *
 * Year-1 generators emit #1 (or #2 when the tenant opts in to signing);
 * #3 + #4 exist so retailers / hospitality folks who already print QR
 * codes pointing at their own URLs can plug into the framework without
 * regenerating their printed media.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import type { TouchpointHandler } from "./handler-interface";
import { TouchpointParseError, type ParsedScan } from "./types";

const WOLFPACK_URI_PATTERN = /^wp:\/\/qr\/([0-9a-fA-F-]{36})\/([\w.\-:]+)$/;
const SIGNED_ENVELOPE_PATTERN = /^wp1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/;
const SUPPORTED_FORMATS: ReadonlySet<string> = new Set([
  "url",
  "json",
  "wp_signed",
  "wolfpack_uri",
]);

/**
 * Configuration options for the QR handler. The signing secret resolver
 * is injected so tests can stub it out without touching the credential
 * vault. Production wires this to `process.env.TOUCHPOINT_SIGNING_KEY`
 * (or to a per-tenant secret looked up via the migration 069 vault when
 * year-two per-tenant signing arrives).
 */
export interface QrHandlerOptions {
  /**
   * Returns the HMAC-SHA256 secret used to verify signed QR envelopes
   * for the given tenant. Return null to deny verification (forces
   * `validate` to return false).
   */
  resolveSigningSecret?: (tenantId: string) => Promise<string | null>;
}

function defaultSecretResolver(): string | null {
  return process.env.TOUCHPOINT_SIGNING_KEY ?? null;
}

export class QrHandler implements TouchpointHandler {
  public readonly type = "qr" as const;
  public readonly supports: ReadonlySet<string> = SUPPORTED_FORMATS;

  private readonly resolveSigningSecret: (
    tenantId: string,
  ) => Promise<string | null>;

  constructor(opts: QrHandlerOptions = {}) {
    this.resolveSigningSecret =
      opts.resolveSigningSecret ?? (async () => defaultSecretResolver());
  }

  /* -------------------------------------------------------------- */
  /* parse                                                           */
  /* -------------------------------------------------------------- */

  async parse(rawInput: string | Buffer): Promise<ParsedScan> {
    const text = (typeof rawInput === "string" ? rawInput : rawInput.toString("utf8")).trim();
    if (text.length === 0) {
      throw new TouchpointParseError("qr", "empty QR payload");
    }

    // 1. Canonical Wolfpack QR URI.
    const wp = WOLFPACK_URI_PATTERN.exec(text);
    if (wp) {
      const [, tenantId, touchpointId] = wp;
      return {
        id: touchpointId,
        payload: {
          format: "wolfpack_uri",
          tenant_id: tenantId,
          raw: text,
        },
      };
    }

    // 2. Signed envelope wp1.{claims}.{sig}
    const signed = SIGNED_ENVELOPE_PATTERN.exec(text);
    if (signed) {
      const [, claimsB64, sigB64] = signed;
      let claims: Record<string, unknown>;
      try {
        claims = JSON.parse(base64UrlDecode(claimsB64).toString("utf8")) as Record<string, unknown>;
      } catch {
        throw new TouchpointParseError("qr", "signed envelope claims are not valid JSON");
      }
      const touchpointId =
        typeof claims.touchpoint_id === "string" ? claims.touchpoint_id : null;
      if (!touchpointId) {
        throw new TouchpointParseError(
          "qr",
          "signed envelope missing touchpoint_id claim",
        );
      }
      return {
        id: touchpointId,
        payload: {
          format: "wp_signed",
          claims,
          signature_b64: sigB64,
          signed_payload_b64: claimsB64,
        },
      };
    }

    // 3. Plain URL.
    if (/^https?:\/\//i.test(text)) {
      let url: URL;
      try {
        url = new URL(text);
      } catch {
        throw new TouchpointParseError("qr", "malformed http(s) URL");
      }
      const segments = url.pathname.split("/").filter(Boolean);
      const last = segments[segments.length - 1] ?? url.host;
      return {
        id: last,
        payload: {
          format: "url",
          url: url.toString(),
          host: url.host,
        },
      };
    }

    // 4. JSON envelope.
    if (text.startsWith("{")) {
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new TouchpointParseError("qr", "JSON payload could not be parsed");
      }
      const touchpointId =
        typeof body.touchpoint_id === "string" ? body.touchpoint_id : null;
      if (!touchpointId) {
        throw new TouchpointParseError(
          "qr",
          "JSON payload missing touchpoint_id",
        );
      }
      return {
        id: touchpointId,
        payload: {
          format: "json",
          ...body,
        },
      };
    }

    throw new TouchpointParseError(
      "qr",
      "unknown QR format -- expected wp://qr/..., wp1.<claims>.<sig>, http(s) URL, or JSON",
    );
  }

  /* -------------------------------------------------------------- */
  /* validate                                                        */
  /* -------------------------------------------------------------- */

  async validate(parsed: ParsedScan): Promise<boolean> {
    const format = parsed.payload?.format;
    if (format !== "wp_signed") {
      // Unsigned formats are trusted by default -- the registration
      // table is the gate. Signed format adds defense-in-depth for QR
      // codes that route to mutating actions.
      return true;
    }

    const signatureB64 = parsed.payload.signature_b64;
    const signedPayloadB64 = parsed.payload.signed_payload_b64;
    if (typeof signatureB64 !== "string" || typeof signedPayloadB64 !== "string") {
      return false;
    }

    const claims = parsed.payload.claims as Record<string, unknown> | undefined;
    const tenantId = typeof claims?.tenant_id === "string" ? claims.tenant_id : null;
    if (!tenantId) return false;

    const secret = await this.resolveSigningSecret(tenantId);
    if (!secret) return false;

    const expected = createHmac("sha256", secret)
      .update(signedPayloadB64)
      .digest();
    let actual: Buffer;
    try {
      actual = base64UrlDecode(signatureB64);
    } catch {
      return false;
    }
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  }
}

/* ------------------------------------------------------------------ */
/* Test/build helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Build a signed envelope. Exposed so tests + the QR-generator UI can
 * round-trip the format without re-implementing it.
 */
export function signQrPayload(
  claims: Record<string, unknown>,
  secret: string,
): string {
  const claimsB64 = base64UrlEncode(Buffer.from(JSON.stringify(claims), "utf8"));
  const sig = createHmac("sha256", secret).update(claimsB64).digest();
  return `wp1.${claimsB64}.${base64UrlEncode(sig)}`;
}

export function createQrHandler(opts?: QrHandlerOptions): QrHandler {
  return new QrHandler(opts);
}

/* ------------------------------------------------------------------ */
/* base64url helpers (Buffer-based -- no external dep)                 */
/* ------------------------------------------------------------------ */

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}
