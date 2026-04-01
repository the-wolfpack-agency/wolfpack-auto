/**
 * Unit tests for src/lib/ofac-screening.ts
 *
 * Tests Soundex matching, Levenshtein fuzzy matching, scoring thresholds,
 * false positive handling, audit trail generation, and DOB masking.
 *
 * Run with: npx jest src/lib/__tests__/ofac-screening.test.ts
 */

import { screenCustomer, maskDob, type ScreeningResult } from "../ofac-screening";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Run screening in shadow mode (no OFAC_API_KEY). */
async function shadowScreen(
  name: string,
  dob?: string,
  address?: string,
): Promise<ScreeningResult> {
  // Ensure shadow mode
  const original = process.env.OFAC_API_KEY;
  delete process.env.OFAC_API_KEY;
  try {
    return await screenCustomer(name, dob, address);
  } finally {
    if (original !== undefined) process.env.OFAC_API_KEY = original;
  }
}

/* -------------------------------------------------------------------------- */
/* screenCustomer — result structure                                          */
/* -------------------------------------------------------------------------- */

describe("screenCustomer — result structure", () => {
  it("always returns screened: true", async () => {
    const result = await shadowScreen("John Smith");
    expect(result.screened).toBe(true);
  });

  it("contains a reference_id for audit trail", async () => {
    const result = await shadowScreen("John Smith");
    expect(result.reference_id).toBeDefined();
    expect(result.reference_id).toMatch(/^OFAC-/);
    expect(result.reference_id.length).toBeGreaterThan(10);
  });

  it("contains a screened_at ISO timestamp", async () => {
    const result = await shadowScreen("John Smith");
    expect(result.screened_at).toBeDefined();
    // Validate it parses as a valid date
    expect(new Date(result.screened_at).getTime()).not.toBeNaN();
  });

  it("reference_id is unique across calls", async () => {
    const a = await shadowScreen("John Smith");
    const b = await shadowScreen("John Smith");
    expect(a.reference_id).not.toBe(b.reference_id);
  });

  it("match_found is a boolean", async () => {
    const result = await shadowScreen("John Smith");
    expect(typeof result.match_found).toBe("boolean");
  });

  it("match_score is a number between 0 and 100", async () => {
    const result = await shadowScreen("John Smith");
    expect(result.match_score).toBeGreaterThanOrEqual(0);
    expect(result.match_score).toBeLessThanOrEqual(100);
  });

  it("matches is an array", async () => {
    const result = await shadowScreen("John Smith");
    expect(Array.isArray(result.matches)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* screenCustomer — exact match detection                                      */
/* -------------------------------------------------------------------------- */

describe("screenCustomer — exact match", () => {
  it("detects exact name match against SDN list", async () => {
    const result = await shadowScreen("KIM, Jong Un");
    expect(result.match_found).toBe(true);
    expect(result.match_score).toBe(100);
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    expect(result.matches[0].name).toBe("KIM, Jong Un");
    expect(result.matches[0].type).toBe("individual");
  });

  it("detects exact entity name match", async () => {
    const result = await shadowScreen("AL QAIDA");
    expect(result.match_found).toBe(true);
    expect(result.match_score).toBe(100);
    expect(result.matches[0].type).toBe("entity");
    expect(result.matches[0].program).toBe("SDGT");
  });

  it("case-insensitive exact matching", async () => {
    const result = await shadowScreen("kim, jong un");
    expect(result.match_found).toBe(true);
    expect(result.match_score).toBe(100);
  });
});

/* -------------------------------------------------------------------------- */
/* screenCustomer — fuzzy/Soundex matching                                     */
/* -------------------------------------------------------------------------- */

describe("screenCustomer — fuzzy matching", () => {
  it("detects close phonetic matches via Soundex", async () => {
    // "AHMED Bilal" vs "AHMED, Bilal" in the SDN list
    const result = await shadowScreen("Ahmed Bilal");
    expect(result.match_found).toBe(true);
    expect(result.match_score).toBeGreaterThanOrEqual(70);
  });

  it("detects substring containment matches", async () => {
    // "SBERBANK" is contained in "SBERBANK OF RUSSIA"
    const result = await shadowScreen("SBERBANK");
    expect(result.match_found).toBe(true);
    expect(result.match_score).toBe(85);
  });

  it("detects partial name overlap with Levenshtein", async () => {
    // Close to "BANCO NACIONAL DE CUBA"
    const result = await shadowScreen("BANCO NACIONAL CUBA");
    expect(result.match_score).toBeGreaterThanOrEqual(50);
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
  });
});

/* -------------------------------------------------------------------------- */
/* screenCustomer — false positive handling (no match)                         */
/* -------------------------------------------------------------------------- */

describe("screenCustomer — no match (false positive avoidance)", () => {
  it("does not flag a common American name", async () => {
    const result = await shadowScreen("John Smith");
    expect(result.match_found).toBe(false);
    expect(result.match_score).toBeLessThan(70);
  });

  it("does not flag a random name with no SDN resemblance", async () => {
    const result = await shadowScreen("Emily Johnson");
    expect(result.match_found).toBe(false);
    expect(result.matches.length).toBe(0);
  });

  it("does not flag a name that shares one common word", async () => {
    // "BANK" is common but should not trigger a match on its own
    const result = await shadowScreen("First National Bank of Springfield");
    // May return some low-score matches but match_found should be false
    // unless score >= 70
    if (result.matches.length > 0) {
      expect(result.matches.every((m) => m.score < 70)).toBe(true);
    }
    expect(result.match_found).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* screenCustomer — scoring thresholds                                         */
/* -------------------------------------------------------------------------- */

describe("screenCustomer — scoring thresholds", () => {
  it("match_found is true only when top score >= 70", async () => {
    // Exact match => 100 => match_found = true
    const exact = await shadowScreen("AL QAIDA");
    expect(exact.match_found).toBe(true);

    // No resemblance => low score => match_found = false
    const none = await shadowScreen("Completely Random Name XYZ");
    expect(none.match_found).toBe(false);
  });

  it("only returns matches with score >= 50", async () => {
    const result = await shadowScreen("PETROLEOS DE VENEZUELA S.A.");
    for (const m of result.matches) {
      expect(m.score).toBeGreaterThanOrEqual(50);
    }
  });

  it("matches are sorted by score descending", async () => {
    // Use a name that might match multiple entries
    const result = await shadowScreen("RUSSIAN AGRICULTURAL BANK OF CUBA");
    if (result.matches.length >= 2) {
      for (let i = 1; i < result.matches.length; i++) {
        expect(result.matches[i - 1].score).toBeGreaterThanOrEqual(
          result.matches[i].score,
        );
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* screenCustomer — SDN match fields                                           */
/* -------------------------------------------------------------------------- */

describe("screenCustomer — SDN match details", () => {
  it("returns correct type for individual entries", async () => {
    const result = await shadowScreen("KIM, Jong Un");
    const match = result.matches.find((m) => m.name === "KIM, Jong Un");
    expect(match).toBeDefined();
    expect(match!.type).toBe("individual");
    expect(match!.program).toBe("DPRK");
    expect(match!.remarks).toContain("Supreme Leader");
  });

  it("returns correct type for entity entries", async () => {
    const result = await shadowScreen("AEROCARIBBEAN S.A.");
    const match = result.matches.find((m) => m.name === "AEROCARIBBEAN S.A.");
    expect(match).toBeDefined();
    expect(match!.type).toBe("entity");
    expect(match!.program).toBe("CUBA");
  });
});

/* -------------------------------------------------------------------------- */
/* maskDob                                                                     */
/* -------------------------------------------------------------------------- */

describe("maskDob", () => {
  it("converts YYYY-MM-DD to MM/YYYY", () => {
    expect(maskDob("1990-05-15")).toBe("05/1990");
  });

  it("handles different dates correctly", () => {
    expect(maskDob("1977-12-01")).toBe("12/1977");
    expect(maskDob("2000-01-31")).toBe("01/2000");
  });

  it("returns **/** for malformed input", () => {
    expect(maskDob("invalid")).toBe("**/**");
  });

  it("handles partial date (no day)", () => {
    expect(maskDob("1990-05")).toBe("05/1990");
  });
});

/* -------------------------------------------------------------------------- */
/* Analytics compatibility — ScreeningResult structure                         */
/* -------------------------------------------------------------------------- */

describe("analytics compatibility", () => {
  it("ScreeningResult is fully JSON-serializable for EventCollector", async () => {
    const result = await shadowScreen("KIM, Jong Un");

    const serialized = JSON.stringify(result);
    expect(serialized).toBeTruthy();

    const parsed = JSON.parse(serialized);
    expect(parsed.screened).toBe(true);
    expect(parsed.reference_id).toBe(result.reference_id);
    expect(parsed.match_found).toBe(result.match_found);
    expect(parsed.match_score).toBe(result.match_score);
    expect(Array.isArray(parsed.matches)).toBe(true);
  });

  it("SDNMatch fields are all primitive types suitable for analytics metadata", async () => {
    const result = await shadowScreen("SBERBANK OF RUSSIA");
    for (const match of result.matches) {
      expect(typeof match.name).toBe("string");
      expect(typeof match.type).toBe("string");
      expect(typeof match.program).toBe("string");
      expect(typeof match.remarks).toBe("string");
      expect(typeof match.score).toBe("number");
    }
  });
});
