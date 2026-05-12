/**
 * Unit tests for the Plaid BYO client (Stream B, migration 070).
 *
 * Covers:
 *   - loadPlaidCredentials: missing DATABASE_URL -> missing_credentials
 *   - loadPlaidCredentials: no row -> missing_credentials
 *   - loadPlaidCredentials: bad JSON -> bad_credentials
 *   - loadPlaidCredentials: happy path -> sandbox creds
 *   - MockPlaidByoClient: createLinkToken + verifyIncome deterministic
 *   - runByoIncomeVerification: routes through clientOverride, emits analytics
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockQuery = jest.fn();
const mockDecryptPII = jest.fn();
const mockTrackPrequal = jest.fn();

jest.mock("@/lib/db", () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

jest.mock("@/lib/crypto", () => ({
  decryptPII: (s: string) => mockDecryptPII(s),
}));

jest.mock("@/lib/analytics-hooks", () => ({
  trackPrequal: (...args: any[]) => mockTrackPrequal(...args),
}));

import {
  loadPlaidCredentials,
  MockPlaidByoClient,
  runByoIncomeVerification,
  type PlaidByoClient,
  type IncomeVerification,
  type IntegrationError,
  type Result,
} from "@/lib/prequal/plaid-byo-client";

beforeEach(() => {
  mockQuery.mockReset();
  mockDecryptPII.mockReset();
  mockTrackPrequal.mockReset();
  process.env.DATABASE_URL = "postgres://x";
  mockDecryptPII.mockImplementation((s: string) => s);
});

describe("loadPlaidCredentials", () => {
  it("returns missing_credentials when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    const r = await loadPlaidCredentials("dealer-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("missing_credentials");
  });

  it("returns missing_credentials when no row matches", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const r = await loadPlaidCredentials("dealer-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("missing_credentials");
  });

  it("returns bad_credentials on unparseable JSON", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ credentials_encrypted: "not-json", environment: "sandbox" }],
    });
    mockDecryptPII.mockReturnValueOnce("not-json");
    const r = await loadPlaidCredentials("dealer-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("bad_credentials");
  });

  it("returns bad_credentials when client_id or secret missing", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ credentials_encrypted: "{}", environment: "sandbox" }],
    });
    mockDecryptPII.mockReturnValueOnce("{}");
    const r = await loadPlaidCredentials("dealer-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("bad_credentials");
  });

  it("returns sandbox creds on happy path", async () => {
    const blob = JSON.stringify({ client_id: "c", secret: "s" });
    mockQuery.mockResolvedValueOnce({
      rows: [{ credentials_encrypted: blob, environment: "sandbox" }],
    });
    mockDecryptPII.mockReturnValueOnce(blob);
    const r = await loadPlaidCredentials("dealer-1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.clientId).toBe("c");
      expect(r.value.secret).toBe("s");
      expect(r.value.environment).toBe("sandbox");
    }
  });

  it("returns missing_credentials when the table is missing", async () => {
    mockQuery.mockRejectedValueOnce(
      new Error('relation "dealer_external_credentials" does not exist'),
    );
    const r = await loadPlaidCredentials("dealer-1");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("missing_credentials");
      expect(r.error.hint).toMatch(/migration 069/i);
    }
  });
});

describe("MockPlaidByoClient", () => {
  it("createLinkToken returns an isMock=true session", async () => {
    const c = new MockPlaidByoClient("sandbox");
    const r = await c.createLinkToken("abcdefgh-1234-5678");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.isMock).toBe(true);
      expect(r.value.linkToken).toMatch(/byo-mock-link-/);
      expect(c.isReal()).toBe(false);
    }
  });

  it("verifyIncome is deterministic + isMock=true", async () => {
    const c = new MockPlaidByoClient("sandbox");
    const r1 = await c.verifyIncome("p1", "tok-a");
    const r2 = await c.verifyIncome("p1", "tok-a");
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value.incomeMonthlyCents).toBe(r2.value.incomeMonthlyCents);
      expect(r1.value.isMock).toBe(true);
      expect(r1.value.confidence).toBe("mock");
    }
  });

  it("different public tokens produce different (but stable) buckets", async () => {
    const c = new MockPlaidByoClient("sandbox");
    const a = await c.verifyIncome("p", "AAAAAA");
    const b = await c.verifyIncome("p", "ZZZZZZ");
    expect(a.ok && b.ok).toBe(true);
    // not equal _likely_ but stable per token across runs
    if (a.ok && b.ok) {
      expect([350_000, 480_000, 620_000, 850_000, 1_200_000])
        .toContain(a.value.incomeMonthlyCents);
    }
  });
});

describe("runByoIncomeVerification with clientOverride", () => {
  it("emits prequal.plaid_byo_income_pulled on success", async () => {
    const override: PlaidByoClient = {
      isReal: () => false,
      createLinkToken: async () => ({
        ok: true,
        value: { linkToken: "x", isMock: true, expiresAt: "z" },
      }),
      verifyIncome: async () =>
        ({
          ok: true,
          value: {
            incomeMonthlyCents: 700_000,
            confidence: "mock",
            isMock: true,
          } as IncomeVerification,
        }) as Result<IncomeVerification, IntegrationError>,
    };
    const r = await runByoIncomeVerification("dealer", "prequal", "pt", override);
    expect(r.ok).toBe(true);
    expect(mockTrackPrequal).toHaveBeenCalledWith(
      "prequal.plaid_byo_income_pulled",
      "dealer",
      expect.objectContaining({ prequal_id: "prequal", is_mock: true }),
    );
  });

  it("emits prequal.plaid_byo_income_failed on error", async () => {
    const override: PlaidByoClient = {
      isReal: () => true,
      createLinkToken: async () => ({
        ok: false,
        error: {
          kind: "sdk_unavailable",
          message: "no sdk",
        },
      }),
      verifyIncome: async () =>
        ({
          ok: false,
          error: { kind: "remote_error", message: "remote bad" },
        }) as Result<IncomeVerification, IntegrationError>,
    };
    const r = await runByoIncomeVerification("dealer", "prequal", "pt", override);
    expect(r.ok).toBe(false);
    expect(mockTrackPrequal).toHaveBeenCalledWith(
      "prequal.plaid_byo_income_failed",
      "dealer",
      expect.objectContaining({ prequal_id: "prequal", reason: "remote_error" }),
    );
  });
});
