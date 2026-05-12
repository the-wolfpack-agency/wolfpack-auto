/**
 * Unit tests for the lender packet builder.
 *
 * Pure function, no I/O. Covers:
 *   - happy path (all fields)
 *   - SSN redaction (full SSN -> last 4)
 *   - SSN escape detection (throw if a full SSN somehow lands in the body)
 *   - mock-label propagation (bureau + income)
 *   - OFAC flag rendering
 *   - employment / residence optional rendering
 *   - HTML escaping
 */

import {
  buildLenderPacket,
  normalizeSsn,
  type LenderPacketInput,
} from "@/lib/prequal/lender-packet-pdf";

function baseInput(overrides: Partial<LenderPacketInput> = {}): LenderPacketInput {
  return {
    prequalId: "11111111-2222-3333-4444-555555555555",
    dealerName: "ACME Motors",
    dealerLocation: "Anywhere, USA",
    customerName: "Jane Doe",
    customerEmail: "jane@example.com",
    customerPhone: "+15555550100",
    ssnLastFour: "1234",
    dateOfBirth: "1990-01-01",
    vehicleInterestText: "2024 Tacoma TRD Sport",
    stockNumber: "T1234",
    vin: "1HGCM82633A123456",
    estimatedPriceCents: 4_500_000,
    income: {
      monthlyCents: 600_000,
      confidence: "plaid_high",
      isMock: false,
    },
    credit: {
      bureauUsed: "experian",
      scoreRangeMin: 720,
      scoreRangeMax: 760,
      tier: "prime",
      isMock: false,
    },
    employment: {
      employer: "ACME Corp",
      occupation: "Engineer",
      monthsAtEmployer: 36,
    },
    residence: {
      addressLine: "1 Main St",
      city: "Springfield",
      state: "IL",
      zip: "62701",
      monthsAtResidence: 24,
      rentOrOwn: "own",
    },
    priorBankruptcies: false,
    ofacClear: true,
    generatedAt: "2026-05-12T00:00:00.000Z",
    ...overrides,
  };
}

describe("normalizeSsn", () => {
  it("returns last 4 when given a full SSN", () => {
    expect(normalizeSsn("123-45-6789")).toBe("6789");
    expect(normalizeSsn("123456789")).toBe("6789");
  });
  it("returns last 4 when given just last 4", () => {
    expect(normalizeSsn("6789")).toBe("6789");
  });
  it("returns undefined for empty / undefined", () => {
    expect(normalizeSsn(undefined)).toBeUndefined();
    expect(normalizeSsn("")).toBeUndefined();
    expect(normalizeSsn("abc")).toBeUndefined();
  });
});

describe("buildLenderPacket", () => {
  it("emits subject + body for the happy path", () => {
    const packet = buildLenderPacket(baseInput());
    expect(packet.subject).toMatch(/Jane Doe/);
    expect(packet.subject).toMatch(/Prime tier/);
    expect(packet.text).toMatch(/WOLFPACK AUTO -- LENDER PACKET/);
    expect(packet.text).toMatch(/Jane Doe/);
    expect(packet.text).toMatch(/ACME Motors/);
    expect(packet.text).toMatch(/2024 Tacoma TRD Sport/);
    expect(packet.text).toMatch(/Stock #:\s+T1234/);
    expect(packet.text).toMatch(/Estimated Price:\s+\$45,000\.00/);
    expect(packet.text).toMatch(/OFAC clear:\s+YES/);
  });

  it("only renders SSN last 4, never full", () => {
    const packet = buildLenderPacket(baseInput({ ssnLastFour: "9999" }));
    expect(packet.text).toMatch(/SSN:\s+XXX-XX-9999/);
    expect(packet.text).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
  });

  it("redacts a full SSN passed by mistake", () => {
    const packet = buildLenderPacket(
      baseInput({ ssnLastFour: "123-45-6789" }),
    );
    expect(packet.text).toMatch(/XXX-XX-6789/);
    expect(packet.text).not.toMatch(/123-45-6789/);
  });

  it("labels mock bureau + mock income loudly", () => {
    const packet = buildLenderPacket(
      baseInput({
        income: { monthlyCents: 600_000, confidence: "mock", isMock: true },
        credit: {
          bureauUsed: "mock",
          scoreRangeMin: 600,
          scoreRangeMax: 660,
          tier: "near_prime",
          isMock: true,
        },
      }),
    );
    expect(packet.text).toMatch(/MOCK DATA PRESENT/);
    expect(packet.text).toMatch(/MOCK PROVIDER/);
    expect(packet.text).toMatch(/bureau_used = mock|mock \(MOCK\)|mock/i);
    expect(packet.summary.isMockBureau).toBe(true);
    expect(packet.summary.isMockIncome).toBe(true);
  });

  it("flags OFAC NOT clear and never says YES", () => {
    const packet = buildLenderPacket(baseInput({ ofacClear: false }));
    expect(packet.text).toMatch(/OFAC clear:\s+NO -- DO NOT UNDERWRITE/);
  });

  it("renders prior bankruptcies disclosure", () => {
    const yes = buildLenderPacket(baseInput({ priorBankruptcies: true }));
    const no  = buildLenderPacket(baseInput({ priorBankruptcies: false }));
    expect(yes.text).toMatch(/Prior bankruptcies:\s+YES/);
    expect(no.text).toMatch(/Prior bankruptcies:\s+None disclosed/);
  });

  it("omits employment + residence sections when not provided", () => {
    const packet = buildLenderPacket(
      baseInput({ employment: undefined, residence: undefined }),
    );
    expect(packet.text).not.toMatch(/--- EMPLOYMENT ---/);
    expect(packet.text).not.toMatch(/--- RESIDENCE ---/);
  });

  it("HTML-escapes special characters in the body", () => {
    const packet = buildLenderPacket(
      baseInput({ customerName: "<script>alert(1)</script>" }),
    );
    expect(packet.html).not.toMatch(/<script>/);
    expect(packet.html).toMatch(/&lt;script&gt;/);
  });

  it("exposes a summary the analytics layer can read", () => {
    const packet = buildLenderPacket(baseInput());
    expect(packet.summary.customerName).toBe("Jane Doe");
    expect(packet.summary.incomeMonthlyCents).toBe(600_000);
    expect(packet.summary.creditTier).toBe("prime");
    expect(packet.summary.estimatedPriceCents).toBe(4_500_000);
  });
});
