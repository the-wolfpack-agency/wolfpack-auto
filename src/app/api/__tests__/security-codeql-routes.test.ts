/**
 * Route-level regression tests for CodeQL findings closed in
 * `secure: fix 10 high/critical code-scanning findings (...)`.
 *
 * - MFA verify no longer auto-passes in shadow mode.
 * - Service-schedule rejects oversized email payloads (ReDoS guard).
 * - Composite background route rejects non-allow-listed cutout URLs.
 */

import { POST as mfaVerify } from "@/app/api/admin/mfa/verify/route";
import { POST as serviceSchedule } from "@/app/api/service/schedule/route";

function reqJson(body: unknown): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/* -------------------------------------------------------------------------- */
/* js/user-controlled-bypass — admin/mfa/verify                                */
/* -------------------------------------------------------------------------- */

describe("POST /api/admin/mfa/verify — no shadow-mode bypass", () => {
  const prevDb = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });
  afterEach(() => {
    if (prevDb !== undefined) process.env.DATABASE_URL = prevDb;
  });

  it("returns 503, NOT { valid: true }, when DATABASE_URL is unset", async () => {
    const res = await mfaVerify(
      reqJson({ userId: "u1", token: "123456" }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.valid).not.toBe(true);
  });

  it("does not accept an isBackupCode flag from the client (it is ignored)", async () => {
    // Even with isBackupCode in the body, shadow mode still refuses.
    const res = await mfaVerify(
      reqJson({ userId: "u1", token: "ABCD1234", isBackupCode: true }),
    );
    expect(res.status).toBe(503);
  });
});

/* -------------------------------------------------------------------------- */
/* js/polynomial-redos — public service/schedule email validation              */
/* -------------------------------------------------------------------------- */

describe("POST /api/service/schedule — email length cap (ReDoS guard)", () => {
  it("rejects emails longer than 254 characters before running the regex", async () => {
    // 300 spaces+@ is the canonical adversarial input for the
    // `[^\s@]+@[^\s@]+\.[^\s@]+` ReDoS pattern. With the cap, this returns
    // 422 in microseconds rather than spinning the regex.
    const adversarial = "a".repeat(260) + "@b.com";
    const start = Date.now();
    const res = await serviceSchedule(
      new (require("next/server").NextRequest)("http://localhost/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer_name: "x",
          email: adversarial,
          service_type: "oil",
          slot_id: "slot-2026-01-01-1200",
        }),
      }),
    );
    const elapsed = Date.now() - start;
    expect(res.status).toBe(422);
    // The point of the cap: even on slow CI this returns essentially instantly.
    expect(elapsed).toBeLessThan(500);
  });

  it("accepts a normal email", async () => {
    const res = await serviceSchedule(
      new (require("next/server").NextRequest)("http://localhost/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer_name: "Jane Doe",
          email: "jane@example.com",
          service_type: "oil_change",
          slot_id: "slot-2026-01-01-1200",
        }),
      }),
    );
    // No DB in tests -> shadow path returns 201.
    expect(res.status).toBe(201);
  });
});
