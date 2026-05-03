/**
 * Regression tests for the 10 high/critical CodeQL findings closed in
 * commit `secure: fix 10 high/critical code-scanning findings (...)`.
 *
 * Each block targets the exact behavior change that closes the alert,
 * so a future refactor that re-introduces the unsafe pattern will fail
 * here before reaching CodeQL.
 */

import { assertAllowedSourceUrl } from "@/lib/background-removal";
import { generateBackupCodes, hashBackupCode } from "@/lib/mfa";

/* -------------------------------------------------------------------------- */
/* js/request-forgery — background-removal.ts + composite/route.ts            */
/* -------------------------------------------------------------------------- */

describe("assertAllowedSourceUrl (SSRF guard)", () => {
  it("accepts s3.amazonaws.com over https", () => {
    expect(() =>
      assertAllowedSourceUrl(
        "https://my-bucket.s3.us-east-1.amazonaws.com/foo.png",
      ),
    ).not.toThrow();
  });

  it("accepts fal.media", () => {
    expect(() =>
      assertAllowedSourceUrl("https://v3.fal.media/files/abc/result.png"),
    ).not.toThrow();
  });

  it("accepts r2 dev hosts", () => {
    expect(() =>
      assertAllowedSourceUrl("https://pub-abc.r2.dev/cutout.png"),
    ).not.toThrow();
  });

  it("accepts inline data URLs", () => {
    expect(() =>
      assertAllowedSourceUrl("data:image/png;base64,AAAA"),
    ).not.toThrow();
  });

  it("rejects http:// (must be https)", () => {
    expect(() =>
      assertAllowedSourceUrl("http://my-bucket.s3.amazonaws.com/foo.png"),
    ).toThrow(/https/);
  });

  it("rejects internal hosts (SSRF)", () => {
    expect(() =>
      assertAllowedSourceUrl("https://169.254.169.254/latest/meta-data/"),
    ).toThrow(/host not allowed/);
    expect(() => assertAllowedSourceUrl("https://localhost/secret")).toThrow(
      /host not allowed/,
    );
    expect(() =>
      assertAllowedSourceUrl("https://internal.example.com/admin"),
    ).toThrow(/host not allowed/);
  });

  it("rejects host suffix tricks (e.g. attacker-fal.run.evil.com)", () => {
    expect(() =>
      assertAllowedSourceUrl("https://fal.run.evil.com/admin"),
    ).toThrow(/host not allowed/);
  });

  it("rejects malformed URLs", () => {
    expect(() => assertAllowedSourceUrl("not-a-url")).toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* js/biased-cryptographic-random — mfa.ts                                    */
/* -------------------------------------------------------------------------- */

describe("generateBackupCodes (uniform distribution)", () => {
  it("only emits characters from the unambiguous alphabet", () => {
    // Pull a large sample so the rejection-sampling loop runs many times.
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      for (const code of generateBackupCodes()) {
        for (const ch of code) seen.add(ch);
      }
    }
    for (const ch of seen) {
      expect("ABCDEFGHJKLMNPQRSTUVWXYZ23456789").toContain(ch);
    }
  });

  it("does not emit ambiguous characters (0/O/1/I)", () => {
    for (let i = 0; i < 20; i++) {
      for (const code of generateBackupCodes()) {
        expect(code).not.toMatch(/[01OI]/);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* js/insufficient-password-hash — mfa.ts (HMAC, not raw SHA-256)             */
/* -------------------------------------------------------------------------- */

describe("hashBackupCode (HMAC-peppered, not raw SHA-256)", () => {
  it("does not match a plain crypto.createHash('sha256') of the input", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    const plain = createHash("sha256").update("ABCD1234").digest("hex");
    expect(hashBackupCode("ABCD1234")).not.toBe(plain);
  });

  it("is still deterministic for the same input (lookup-by-hash works)", () => {
    expect(hashBackupCode("TESTCODE")).toBe(hashBackupCode("TESTCODE"));
  });
});

/* -------------------------------------------------------------------------- */
/* js/resource-exhaustion — canva-integration.ts (renderStars cap)            */
/* -------------------------------------------------------------------------- */

describe("canva-integration testimonial render (renderStars cap)", () => {
  // renderStars is module-private; exercise it via populateTemplate.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { populateTemplate } = require("@/lib/canva-integration") as typeof import("@/lib/canva-integration");

  const baseDealer = {
    name: "ACME Motors",
    logo_url: "https://example.com/logo.png",
    primary_color: "#000",
    secondary_color: "#fff",
    phone: "555",
    website: "https://example.com",
  };

  function run(rating: number) {
    return populateTemplate("testimonial-card", {
      dealer: baseDealer,
      custom: { customer_name: "Jane", customer_quote: "Great", rating },
    });
  }

  it("clamps a huge rating to 5 stars (no resource exhaustion)", () => {
    const html = run(1e9);
    expect((html.match(/★/g) ?? []).length).toBeLessThanOrEqual(5);
    expect((html.match(/☆/g) ?? []).length).toBeLessThanOrEqual(5);
  });

  it("clamps Infinity safely", () => {
    const html = run(Number.POSITIVE_INFINITY);
    expect((html.match(/★/g) ?? []).length).toBeLessThanOrEqual(5);
  });

  it("clamps NaN to 0 stars", () => {
    const html = run(Number.NaN);
    expect((html.match(/★/g) ?? []).length).toBe(0);
  });

  it("clamps negative ratings to 0 stars", () => {
    const html = run(-100);
    expect((html.match(/★/g) ?? []).length).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* js/insecure-randomness — omnichannel.ts                                    */
/* -------------------------------------------------------------------------- */

describe("omnichannel handoff token (CSPRNG)", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const omni = require("@/lib/omnichannel") as typeof import("@/lib/omnichannel");

  it("createHandoff returns a 32-hex-char token (16 bytes from randomBytes)", async () => {
    const h = await omni.createHandoff(
      "cust-1",
      "online",
      "in_store",
      "dealer-1",
    );
    expect(h.token).toMatch(/^[0-9a-f]{32}$/);
  });

  it("consecutive tokens are unique (with overwhelming probability)", async () => {
    const a = await omni.createHandoff("c-a", "online", "in_store", "d");
    const b = await omni.createHandoff("c-b", "online", "in_store", "d");
    expect(a.token).not.toBe(b.token);
  });
});

/* -------------------------------------------------------------------------- */
/* js/disabling-certificate-validation — ssl.ts                               */
/* -------------------------------------------------------------------------- */

describe("ssl.ts source code does NOT disable cert validation", () => {
  // Static-source assertion — cheaper than spinning up a real TLS handshake
  // and works the same way the CodeQL rule fires.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("node:path") as typeof import("node:path");

  it("never sets rejectUnauthorized: false", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../ssl.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/rejectUnauthorized:\s*false/);
  });
});
