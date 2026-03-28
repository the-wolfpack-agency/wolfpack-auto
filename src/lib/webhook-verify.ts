/**
 * Webhook signature verification — HMAC-based integrity check.
 *
 * Uses crypto.timingSafeEqual to prevent timing side-channel attacks.
 * Reusable across all webhook endpoints (DMS, integrations, etc.).
 */

import crypto from "crypto";

/**
 * Verify a webhook signature against a shared secret.
 *
 * @param payload  - Raw request body string
 * @param signature - The signature header value (hex-encoded HMAC)
 * @param secret   - The shared secret for this webhook source
 * @param algorithm - HMAC algorithm (default: sha256)
 * @returns true if the signature is valid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  algorithm = "sha256",
): boolean {
  if (!payload || !signature || !secret) return false;

  const expected = crypto
    .createHmac(algorithm, secret)
    .update(payload, "utf8")
    .digest("hex");

  // Both buffers must be the same length for timingSafeEqual
  const sigBuf = Buffer.from(signature, "hex");
  const expBuf = Buffer.from(expected, "hex");

  if (sigBuf.length !== expBuf.length) return false;

  return crypto.timingSafeEqual(sigBuf, expBuf);
}
