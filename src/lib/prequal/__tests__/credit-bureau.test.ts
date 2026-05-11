/**
 * Tests for the credit-bureau abstraction.
 *
 * - MockCreditBureauProvider returns deterministic, range-realistic results
 *   that are clearly labeled as mock.
 * - Experian / Equifax / TransUnion stubs throw CreditBureauNotConfiguredError.
 * - getCreditBureauProvider() defaults to mock when the env var is unset.
 */

import {
  MockCreditBureauProvider,
  ExperianSoftPullProvider,
  EquifaxSoftPullProvider,
  TransUnionSoftPullProvider,
  CreditBureauNotConfiguredError,
  getCreditBureauProvider,
} from "@/lib/prequal/credit-bureau";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("MockCreditBureauProvider", () => {
  it("is always available", () => {
    expect(new MockCreditBureauProvider().isAvailable()).toBe(true);
  });

  it("returns deterministic results for the same applicant", async () => {
    const provider = new MockCreditBureauProvider();
    const applicant = {
      name: "Sam Tester",
      email: "sam@example.com",
    };
    const a = await provider.softPull(applicant);
    const b = await provider.softPull(applicant);
    expect(a.tier).toBe(b.tier);
    expect(a.scoreRangeMin).toBe(b.scoreRangeMin);
    expect(a.scoreRangeMax).toBe(b.scoreRangeMax);
  });

  it("always flags responses as mock", async () => {
    const provider = new MockCreditBureauProvider();
    const result = await provider.softPull({
      name: "Anyone",
      email: "anyone@example.com",
    });
    expect(result.isMock).toBe(true);
    expect(result.bureauUsed).toBe("mock");
  });

  it("returns a valid score range within FICO bounds", async () => {
    const provider = new MockCreditBureauProvider();
    const result = await provider.softPull({
      name: "Test",
      email: "test@example.com",
    });
    expect(result.scoreRangeMin).toBeGreaterThanOrEqual(300);
    expect(result.scoreRangeMax).toBeLessThanOrEqual(850);
    expect(result.scoreRangeMax).toBeGreaterThanOrEqual(result.scoreRangeMin);
  });

  it("clearly labels rawResponse as not from a real source", async () => {
    const provider = new MockCreditBureauProvider();
    const result = await provider.softPull({
      name: "Test",
      email: "test@example.com",
    });
    expect(result.rawResponse).toContain("MOCK_BUREAU_RESPONSE_NOT_FROM_REAL_SOURCE");
  });
});

describe("real bureau stubs", () => {
  it("Experian throws not-configured on softPull", async () => {
    const p = new ExperianSoftPullProvider();
    expect(p.isAvailable()).toBe(false);
    await expect(
      p.softPull({ name: "x", email: "x@example.com" }),
    ).rejects.toBeInstanceOf(CreditBureauNotConfiguredError);
  });

  it("Equifax throws not-configured on softPull", async () => {
    const p = new EquifaxSoftPullProvider();
    expect(p.isAvailable()).toBe(false);
    await expect(
      p.softPull({ name: "x", email: "x@example.com" }),
    ).rejects.toBeInstanceOf(CreditBureauNotConfiguredError);
  });

  it("TransUnion throws not-configured on softPull", async () => {
    const p = new TransUnionSoftPullProvider();
    expect(p.isAvailable()).toBe(false);
    await expect(
      p.softPull({ name: "x", email: "x@example.com" }),
    ).rejects.toBeInstanceOf(CreditBureauNotConfiguredError);
  });
});

describe("getCreditBureauProvider", () => {
  it("defaults to mock when CREDIT_BUREAU_PROVIDER is unset", () => {
    delete process.env.CREDIT_BUREAU_PROVIDER;
    expect(getCreditBureauProvider().bureau).toBe("mock");
  });

  it("returns the mock provider when explicitly requested", () => {
    process.env.CREDIT_BUREAU_PROVIDER = "mock";
    expect(getCreditBureauProvider().bureau).toBe("mock");
  });

  it("returns the appropriate stub for experian / equifax / transunion", () => {
    process.env.CREDIT_BUREAU_PROVIDER = "experian";
    expect(getCreditBureauProvider().bureau).toBe("experian");
    process.env.CREDIT_BUREAU_PROVIDER = "equifax";
    expect(getCreditBureauProvider().bureau).toBe("equifax");
    process.env.CREDIT_BUREAU_PROVIDER = "transunion";
    expect(getCreditBureauProvider().bureau).toBe("transunion");
  });

  it("falls back to mock + warns on unknown value", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    process.env.CREDIT_BUREAU_PROVIDER = "definitely-not-real";
    expect(getCreditBureauProvider().bureau).toBe("mock");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
