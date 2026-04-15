/**
 * Webhook Signature Coverage Guard
 *
 * Walks every src/app/api/webhooks/** /route.ts at test time and asserts
 * that each file:
 *   (a) contains one of the recognised signature-verification patterns, OR
 *   (b) is listed in WEBHOOK_PUBLIC_ALLOWLIST with a documented reason.
 *
 * This is a permanent tripwire — every new webhook route must be hardened or
 * explicitly allowlisted. No silent drift.
 *
 * Recognised patterns (any one is sufficient):
 *   verifyWebhookSignature  — wolfpack-auto shared helper (webhook-verify.ts)
 *   verifyHmac              — generic HMAC helper
 *   validateSignature       — generic validator
 *   timingSafeEqual         — node:crypto direct usage
 *   crypto.createHmac       — node:crypto direct usage
 *   constructEvent          — Stripe SDK (embeds HMAC verification)
 *   validateTwilioSignature — Twilio SDK signature check
 *   crypto.subtle           — Web Crypto API (used by Svix/Resend)
 */

import * as fs from "fs";
import * as path from "path";
import { WEBHOOK_PUBLIC_ALLOWLIST } from "@/app/api/webhooks/PUBLIC_WEBHOOKS";

const ROOT = path.resolve(__dirname, "../..");
const WEBHOOK_API_DIR = path.join(ROOT, "src/app/api/webhooks");

// Patterns that count as valid signature verification.
const SIGNATURE_PATTERNS: RegExp[] = [
  /verifyWebhookSignature\s*\(/,
  /verifyHmac\s*\(/,
  /validateSignature\s*\(/,
  /timingSafeEqual\s*\(/,
  /crypto\.createHmac\s*\(/,
  /\.constructEvent\s*\(/,         // Stripe SDK
  /validateTwilioSignature\s*\(/,  // Twilio SDK
  /crypto\.subtle/,                // Web Crypto (Svix/Resend)
];

/* -------------------------------------------------------------------------- */
/* Filesystem walker                                                           */
/* -------------------------------------------------------------------------- */

function walkRoutes(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkRoutes(fullPath));
    } else if (entry.name === "route.ts") {
      results.push(fullPath);
    }
  }
  return results;
}

function relativeToWebhooks(absPath: string): string {
  return path.relative(WEBHOOK_API_DIR, absPath);
}

function isAllowlisted(absPath: string): boolean {
  const rel = relativeToWebhooks(absPath);
  return WEBHOOK_PUBLIC_ALLOWLIST.some(
    (entry) => rel === entry.path || rel.startsWith(entry.path),
  );
}

function hasSignatureVerification(content: string): boolean {
  return SIGNATURE_PATTERNS.some((pattern) => pattern.test(content));
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe("Webhook signature coverage", () => {
  const allRoutes = walkRoutes(WEBHOOK_API_DIR);

  test("found at least 3 webhook route files (sanity check)", () => {
    // We have resend, stripe, twilio — assert floor
    expect(allRoutes.length).toBeGreaterThanOrEqual(3);
  });

  const unverifiedRoutes: string[] = [];

  for (const routeFile of allRoutes) {
    if (isAllowlisted(routeFile)) continue;

    const content = fs.readFileSync(routeFile, "utf-8");
    if (!hasSignatureVerification(content)) {
      unverifiedRoutes.push(relativeToWebhooks(routeFile));
    }
  }

  test(
    "every webhook route verifies HMAC signature or is in WEBHOOK_PUBLIC_ALLOWLIST",
    () => {
      if (unverifiedRoutes.length > 0) {
        const list = unverifiedRoutes
          .map((r) => `  - src/app/api/webhooks/${r}`)
          .join("\n");
        throw new Error(
          `${unverifiedRoutes.length} webhook route(s) have no signature verification and are not allowlisted:\n` +
          list +
          "\n\n" +
          "Fix: add one of the recognised verification patterns, or add an entry to\n" +
          "src/app/api/webhooks/PUBLIC_WEBHOOKS.ts with a documented reason.",
        );
      }
      expect(unverifiedRoutes).toHaveLength(0);
    },
  );

  test("WEBHOOK_PUBLIC_ALLOWLIST entries all correspond to real files or directories", () => {
    const missing: string[] = [];
    for (const entry of WEBHOOK_PUBLIC_ALLOWLIST) {
      const abs = path.join(WEBHOOK_API_DIR, entry.path);
      // Allow matching either an exact file or a directory prefix
      const exists = fs.existsSync(abs) || fs.existsSync(abs + "/route.ts");
      if (!exists) {
        missing.push(entry.path);
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `WEBHOOK_PUBLIC_ALLOWLIST contains entries for paths that do not exist:\n` +
        missing.map((e) => `  - ${e}`).join("\n") +
        "\n\nRemove stale entries from src/app/api/webhooks/PUBLIC_WEBHOOKS.ts.",
      );
    }
    expect(missing).toHaveLength(0);
  });
});
