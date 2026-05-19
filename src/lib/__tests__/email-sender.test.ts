/**
 * Per-dealer outbound email sender (Fix 2).
 *
 * Validates lib/email.ts.resolveDealerFromEmail:
 *   - prefers dealers.from_email when set
 *   - falls back to dealers.email when from_email is null
 *   - falls back to RESEND_FROM_EMAIL when both dealer columns are null
 *   - falls back to the generic platform FROM when env is unset too
 *   - fires `email.sender_fallback` (via trackSystem) on each fallback path
 *   - tolerates DB errors (returns env / generic fallback, never throws)
 */

/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock("@/lib/db", () => ({
  query: jest.fn(),
}));

jest.mock("@/lib/analytics-hooks", () => ({
  trackSystem: jest.fn(),
}));

import { query } from "@/lib/db";
import { trackSystem } from "@/lib/analytics-hooks";
import { resolveDealerFromEmail } from "@/lib/email";

const mockedQuery = query as unknown as jest.Mock;
const mockedTrackSystem = trackSystem as unknown as jest.Mock;

const DEALER_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATABASE_URL = "postgresql://stub";
  delete process.env.RESEND_FROM_EMAIL;
});

describe("resolveDealerFromEmail — Fix 2: per-dealer Resend FROM branding", () => {
  test("returns the dealer's branded from_email when set", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [{ from_email: "Mile High Motors <leads@milehighmotors.com>", email: "ignored@x.com" }],
    });

    const from = await resolveDealerFromEmail(DEALER_ID);

    expect(from).toBe("Mile High Motors <leads@milehighmotors.com>");
    expect(mockedTrackSystem).not.toHaveBeenCalled();
  });

  test("falls back to dealers.email when from_email is null and emits sender_fallback", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [{ from_email: null, email: "ops@milehighmotors.com" }],
    });

    const from = await resolveDealerFromEmail(DEALER_ID);

    expect(from).toBe("ops@milehighmotors.com");
    expect(mockedTrackSystem).toHaveBeenCalledTimes(1);
    const [, dealerId, meta] = mockedTrackSystem.mock.calls[0];
    expect(dealerId).toBe(DEALER_ID);
    expect(meta).toMatchObject({
      kind: "email.sender_fallback",
      from_email_source: "dealers.email",
    });
  });

  test("falls back to RESEND_FROM_EMAIL when both dealer columns are unset and emits sender_fallback", async () => {
    process.env.RESEND_FROM_EMAIL = "leads@platform.test";
    mockedQuery.mockResolvedValueOnce({
      rows: [{ from_email: null, email: null }],
    });

    const from = await resolveDealerFromEmail(DEALER_ID);

    expect(from).toBe("leads@platform.test");
    expect(mockedTrackSystem).toHaveBeenCalledWith(
      "system.settings_updated",
      DEALER_ID,
      expect.objectContaining({
        kind: "email.sender_fallback",
        from_email_source: "env",
      }),
    );
  });

  test("falls back to the generic platform FROM when env is unset too", async () => {
    delete process.env.RESEND_FROM_EMAIL;
    mockedQuery.mockResolvedValueOnce({
      rows: [{ from_email: null, email: null }],
    });

    const from = await resolveDealerFromEmail(DEALER_ID);

    expect(from).toBe("Wolfpack Auto <noreply@wolfpackauto.com>");
    expect(mockedTrackSystem).toHaveBeenCalledWith(
      "system.settings_updated",
      DEALER_ID,
      expect.objectContaining({
        kind: "email.sender_fallback",
        from_email_source: "generic",
      }),
    );
  });

  test("with no dealerId, returns the env value without touching the DB", async () => {
    process.env.RESEND_FROM_EMAIL = "leads@platform.test";

    const from = await resolveDealerFromEmail(null);

    expect(from).toBe("leads@platform.test");
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  test("shadow mode (no DATABASE_URL) skips the DB lookup", async () => {
    delete process.env.DATABASE_URL;
    process.env.RESEND_FROM_EMAIL = "leads@platform.test";

    const from = await resolveDealerFromEmail(DEALER_ID);

    expect(from).toBe("leads@platform.test");
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  test("DB error degrades gracefully (returns env / generic, never throws)", async () => {
    process.env.RESEND_FROM_EMAIL = "leads@platform.test";
    mockedQuery.mockRejectedValueOnce(new Error("pg unavailable"));

    const from = await resolveDealerFromEmail(DEALER_ID);

    expect(from).toBe("leads@platform.test");
  });
});
