/**
 * Crypto-agility JWT signing wrapper.
 *
 * All non-NextAuth JWT operations MUST go through this module so we can
 * rotate algorithms without touching individual call sites.
 *
 * NextAuth limitation (documented):
 *   NextAuth v4 manages its own JWT lifecycle using NEXTAUTH_SECRET (HS256).
 *   It does not expose a pluggable signing primitive, so we cannot redirect
 *   NextAuth's internal tokens through signToken(). Instead, the NextAuth
 *   `callbacks.jwt` and `callbacks.session` hooks in src/lib/auth.ts emit
 *   `system.token_signed` / `system.token_verified` events so every
 *   NextAuth-managed token operation still flows through analytics.
 *   NextAuth is the ONE code path not yet wrapped by this module.
 *
 * Supported algorithms:
 *   - hs256   — HMAC-SHA256 (current default, uses NEXTAUTH_SECRET)
 *   - rs256   — RSA-PKCS1v15 SHA-256 (requires JWT_PRIVATE_KEY env var)
 *   - es256   — ECDSA P-256 SHA-256 (requires JWT_PRIVATE_KEY env var)
 *   - ml-dsa-65-hybrid — RESERVED placeholder. Throws NotImplementedError.
 *               Marketable as "quantum-migration-ready": the slot exists,
 *               no broken PQ crypto ships.
 *
 * Usage:
 *   import { signToken, verifyToken } from "@/lib/crypto/sign";
 *
 *   const jwt = signToken({ sub: userId, role: "admin" }, { ttlSeconds: 3600 });
 *   const result = verifyToken<{ sub: string; role: string }>(jwt);
 *   if (result.valid) { ... result.payload.sub ... }
 */

import crypto from "node:crypto";
import { ALGORITHMS, CURRENT_SIGN_ALGORITHM } from "./algorithms";
import type { AlgorithmId } from "./algorithms";

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

/* -------------------------------------------------------------------------- */
/* Analytics (fire-and-forget, never throws)                                  */
/* -------------------------------------------------------------------------- */

function emitAnalytics(
  event: "system.token_signed" | "system.token_verified" | "system.token_verify_failed",
  algorithmId: AlgorithmId,
  extra: Record<string, string | number | boolean> = {},
): void {
  try {
    const alg = ALGORITHMS[algorithmId];
    import("@/lib/analytics-hooks")
      .then(({ trackSystem }) => {
        trackSystem(event, "system", {
          algorithm: algorithmId,
          quantum_safe: alg?.quantumSafe ?? false,
          ...extra,
        });
      })
      .catch(() => { /* analytics must never throw */ });
  } catch {
    /* analytics must never throw */
  }
}

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                            */
/* -------------------------------------------------------------------------- */

function base64url(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  return buf.toString("base64url");
}

function base64urlDecode(str: string): Buffer {
  return Buffer.from(str, "base64url");
}

function getHmacSecret(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[crypto/sign] NEXTAUTH_SECRET must be set in production.",
      );
    }
    return Buffer.from("wolfpack-dev-secret-do-not-use-in-production", "utf8");
  }
  return Buffer.from(secret, "utf8");
}

/* -------------------------------------------------------------------------- */
/* Core sign / verify                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Sign a JWT using the specified (or current default) algorithm.
 *
 * @param payload   - Arbitrary JSON-serialisable claims object.
 * @param opts.ttlSeconds  - Seconds until expiry. Default: 3600 (1 hour).
 * @param opts.algorithm   - Override the default algorithm. Must be in ALGORITHMS.
 * @returns Compact JWS string (header.payload.signature).
 */
export function signToken(
  payload: object,
  opts?: { ttlSeconds?: number; algorithm?: AlgorithmId },
): string {
  const algorithmId = opts?.algorithm ?? CURRENT_SIGN_ALGORITHM;

  if (!(algorithmId in ALGORITHMS)) {
    throw new Error(`[crypto/sign] Unknown algorithm: ${algorithmId}`);
  }

  if (algorithmId === "ml-dsa-65-hybrid") {
    throw new NotImplementedError(
      "[crypto/sign] ml-dsa-65-hybrid is a reserved slot for future post-quantum migration. " +
      "It is not yet implemented. Use hs256, rs256, or es256.",
    );
  }

  if (algorithmId === "rs256" || algorithmId === "es256") {
    throw new NotImplementedError(
      `[crypto/sign] ${algorithmId} requires asymmetric key material (JWT_PRIVATE_KEY). ` +
      "Asymmetric signing is not yet wired up in this deployment. Use hs256.",
    );
  }

  const alg = ALGORITHMS[algorithmId];
  const now = Math.floor(Date.now() / 1000);
  const ttl = opts?.ttlSeconds ?? 3600;

  const header = base64url(JSON.stringify({ alg: alg.jwtAlg, typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iat: now,
      exp: now + ttl,
      ...payload,
    }),
  );
  const signingInput = `${header}.${claims}`;

  let signature: string;

  if (algorithmId === "hs256") {
    const secret = getHmacSecret();
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(signingInput);
    signature = base64url(hmac.digest());
  } else {
    // Guard: should be unreachable given the checks above
    throw new Error(`[crypto/sign] Unhandled algorithm: ${algorithmId}`);
  }

  emitAnalytics("system.token_signed", algorithmId);

  return `${signingInput}.${signature}`;
}

/* -------------------------------------------------------------------------- */
/* Verify                                                                      */
/* -------------------------------------------------------------------------- */

export type VerifyResult<T> =
  | { valid: true; payload: T; algorithm: AlgorithmId }
  | { valid: false; reason: string };

/**
 * Verify and decode a JWT produced by `signToken`.
 *
 * Validates:
 *   - Structure (three base64url segments)
 *   - Algorithm header matches a known algorithm
 *   - Signature integrity (timing-safe comparison for HMAC)
 *   - Expiry (`exp` claim)
 *
 * @returns `{ valid: true, payload, algorithm }` or `{ valid: false, reason }`.
 */
export function verifyToken<T = Record<string, unknown>>(
  token: string,
): VerifyResult<T> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    emitAnalytics("system.token_verify_failed", CURRENT_SIGN_ALGORITHM, { reason: "malformed" });
    return { valid: false, reason: "Malformed token: expected 3 segments" };
  }

  const [rawHeader, rawClaims, rawSig] = parts;

  // Decode header
  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(base64urlDecode(rawHeader).toString("utf8")) as { alg?: string; typ?: string };
  } catch {
    emitAnalytics("system.token_verify_failed", CURRENT_SIGN_ALGORITHM, { reason: "bad_header" });
    return { valid: false, reason: "Invalid header encoding" };
  }

  // Map jwtAlg → AlgorithmId
  const algorithmId = Object.values(ALGORITHMS).find(
    (a) => a.jwtAlg === header.alg,
  )?.id as AlgorithmId | undefined;

  if (!algorithmId) {
    emitAnalytics("system.token_verify_failed", CURRENT_SIGN_ALGORITHM, { reason: "unknown_alg" });
    return { valid: false, reason: `Unknown or unsupported algorithm: ${header.alg ?? "none"}` };
  }

  if (algorithmId === "ml-dsa-65-hybrid") {
    emitAnalytics("system.token_verify_failed", algorithmId, { reason: "not_implemented" });
    return { valid: false, reason: "ml-dsa-65-hybrid is not yet implemented" };
  }

  if (algorithmId === "rs256" || algorithmId === "es256") {
    emitAnalytics("system.token_verify_failed", algorithmId, { reason: "not_implemented" });
    return { valid: false, reason: `${algorithmId} asymmetric verification not yet wired up` };
  }

  // Verify signature
  const signingInput = `${rawHeader}.${rawClaims}`;
  let signatureValid = false;

  if (algorithmId === "hs256") {
    try {
      const secret = getHmacSecret();
      const hmac = crypto.createHmac("sha256", secret);
      hmac.update(signingInput);
      const expected = hmac.digest();
      const provided = base64urlDecode(rawSig);

      if (expected.length === provided.length) {
        signatureValid = crypto.timingSafeEqual(expected, provided);
      }
    } catch {
      signatureValid = false;
    }
  }

  if (!signatureValid) {
    emitAnalytics("system.token_verify_failed", algorithmId, { reason: "bad_signature" });
    return { valid: false, reason: "Invalid signature" };
  }

  // Decode claims
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(base64urlDecode(rawClaims).toString("utf8")) as Record<string, unknown>;
  } catch {
    emitAnalytics("system.token_verify_failed", algorithmId, { reason: "bad_claims" });
    return { valid: false, reason: "Invalid claims encoding" };
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === "number" && claims.exp < now) {
    emitAnalytics("system.token_verify_failed", algorithmId, { reason: "expired" });
    return { valid: false, reason: "Token has expired" };
  }

  emitAnalytics("system.token_verified", algorithmId);

  return { valid: true, payload: claims as T, algorithm: algorithmId };
}

/* -------------------------------------------------------------------------- */
/* Generic raw-bytes sign / verify (non-JWT)                                   */
/* -------------------------------------------------------------------------- */

/**
 * Sign an arbitrary byte string using the named-algorithm registry.
 *
 * Used by code paths that need a detached signature over a hash or
 * canonical document — not a JWT envelope. The provenance hash chain is
 * the canonical caller: it signs the SHA-256 leaf hash so a 3rd-party
 * verifier can prove the signature without re-canonicalising the payload.
 *
 * @returns { algorithm, signatureB64 } — base64url so it round-trips
 *   safely through JSON / URL params. Throws on unknown / unimplemented
 *   algorithms (mirrors signToken behaviour).
 */
export function signBytes(
  message: string | Buffer,
  opts?: { algorithm?: AlgorithmId },
): { algorithm: AlgorithmId; signatureB64: string } {
  const algorithmId = opts?.algorithm ?? CURRENT_SIGN_ALGORITHM;

  if (!(algorithmId in ALGORITHMS)) {
    throw new Error(`[crypto/sign] Unknown algorithm: ${algorithmId}`);
  }

  if (algorithmId === "ml-dsa-65-hybrid") {
    throw new NotImplementedError(
      "[crypto/sign] ml-dsa-65-hybrid raw signing not yet wired up. PQ slot reserved.",
    );
  }
  if (algorithmId === "rs256" || algorithmId === "es256") {
    throw new NotImplementedError(
      `[crypto/sign] ${algorithmId} raw signing requires asymmetric keys not yet provisioned.`,
    );
  }

  if (algorithmId !== "hs256") {
    throw new Error(`[crypto/sign] Unhandled algorithm: ${algorithmId}`);
  }

  const secret = getHmacSecret();
  const buf = typeof message === "string" ? Buffer.from(message, "utf8") : message;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(buf);
  const sig = hmac.digest();
  return { algorithm: algorithmId, signatureB64: sig.toString("base64url") };
}

/**
 * Verify a raw-bytes signature produced by `signBytes`.
 *
 * Timing-safe comparison for symmetric algorithms. Returns `false` for
 * any algorithm that isn't yet wired up (rs256 / es256 / ml-dsa-*).
 */
export function verifyBytes(
  message: string | Buffer,
  signatureB64: string,
  algorithmId: AlgorithmId,
): boolean {
  if (!(algorithmId in ALGORITHMS)) return false;
  if (algorithmId !== "hs256") return false;

  try {
    const secret = getHmacSecret();
    const buf = typeof message === "string" ? Buffer.from(message, "utf8") : message;
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(buf);
    const expected = hmac.digest();
    const provided = Buffer.from(signatureB64, "base64url");
    if (expected.length !== provided.length) return false;
    return crypto.timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}
