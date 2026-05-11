/**
 * Tests for the plaid-client (income verification) abstraction.
 */

import {
  MockIncomeProvider,
  PlaidIncomeProvider,
  IncomeProviderNotConfiguredError,
  getIncomeProvider,
  normalizeSelfReportedIncome,
} from "@/lib/prequal/plaid-client";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("MockIncomeProvider", () => {
  it("is always available", () => {
    expect(new MockIncomeProvider().isAvailable()).toBe(true);
  });

  it("startLink returns a clearly-mocked link session with TTL", async () => {
    const session = await new MockIncomeProvider().startLink();
    expect(session.isMock).toBe(true);
    expect(session.linkToken).toContain("mock");
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("getIncome returns deterministic monthly income clearly labeled mock", async () => {
    const provider = new MockIncomeProvider();
    const a = await provider.getIncome("token-A");
    const b = await provider.getIncome("token-A");
    expect(a.incomeMonthlyCents).toBe(b.incomeMonthlyCents);
    expect(a.isMock).toBe(true);
    expect(a.confidence).toBe("mock");
  });
});

describe("PlaidIncomeProvider stub", () => {
  it("isAvailable returns false", () => {
    expect(new PlaidIncomeProvider().isAvailable()).toBe(false);
  });

  it("startLink throws not-configured", async () => {
    await expect(new PlaidIncomeProvider().startLink()).rejects.toBeInstanceOf(
      IncomeProviderNotConfiguredError,
    );
  });

  it("getIncome throws not-configured", async () => {
    await expect(
      new PlaidIncomeProvider().getIncome("any"),
    ).rejects.toBeInstanceOf(IncomeProviderNotConfiguredError);
  });
});

describe("normalizeSelfReportedIncome", () => {
  it("passes through monthly cadence", () => {
    const r = normalizeSelfReportedIncome({
      amountCents: 500_000,
      cadence: "monthly",
    });
    expect(r.incomeMonthlyCents).toBe(500_000);
    expect(r.confidence).toBe("self_reported");
    expect(r.isMock).toBe(false);
  });

  it("divides annual cadence by 12", () => {
    const r = normalizeSelfReportedIncome({
      amountCents: 6_000_000,
      cadence: "annual",
    });
    expect(r.incomeMonthlyCents).toBe(500_000);
    expect(r.confidence).toBe("self_reported");
  });

  it("floors annual cadence so we never overstate income", () => {
    const r = normalizeSelfReportedIncome({
      amountCents: 100_001,
      cadence: "annual",
    });
    expect(r.incomeMonthlyCents).toBe(Math.floor(100_001 / 12));
  });
});

describe("getIncomeProvider", () => {
  it("defaults to mock when INCOME_VERIFICATION_PROVIDER is unset", () => {
    delete process.env.INCOME_VERIFICATION_PROVIDER;
    expect(getIncomeProvider().providerName).toBe("mock");
  });

  it("returns Plaid stub when explicitly requested", () => {
    process.env.INCOME_VERIFICATION_PROVIDER = "plaid";
    expect(getIncomeProvider().providerName).toBe("plaid");
  });

  it("falls back to mock with warn on unknown values", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    process.env.INCOME_VERIFICATION_PROVIDER = "definitely-not-real";
    expect(getIncomeProvider().providerName).toBe("mock");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
