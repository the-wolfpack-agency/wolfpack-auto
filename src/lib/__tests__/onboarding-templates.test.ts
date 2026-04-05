/**
 * Onboarding Templates — unit tests.
 *
 * Validates template definitions, color validity, CSV parsing,
 * progress persistence, and analytics integration.
 *
 * Run with: npx jest src/lib/__tests__/onboarding-templates.test.ts
 */

import {
  getAllTemplates,
  getTemplate,
  getTemplateDefaults,
  isValidHexColor,
  TEMPLATE_IDS,
  detectCsvFormat,
  parseDealerCsv,
  createOnboardingProgress,
  advanceOnboardingStep,
  serializeProgress,
  deserializeProgress,
  type DealerTemplate,
  type DealerTemplateId,
  type OnboardingProgress,
} from "../onboarding-templates";

/* ------------------------------------------------------------------ */
/*  Template existence & required fields                               */
/* ------------------------------------------------------------------ */

describe("onboarding templates", () => {
  it("exposes exactly 5 template IDs", () => {
    expect(TEMPLATE_IDS).toHaveLength(5);
  });

  it("includes all 5 expected template types", () => {
    const expected: DealerTemplateId[] = [
      "independent_used",
      "franchise_new",
      "luxury",
      "truck_specialty",
      "ev_focused",
    ];
    expect(TEMPLATE_IDS).toEqual(expected);
  });

  it("getAllTemplates returns the same 5 templates in order", () => {
    const templates = getAllTemplates();
    expect(templates).toHaveLength(5);
    expect(templates.map((t) => t.id)).toEqual(TEMPLATE_IDS);
  });

  it("getTemplate returns undefined for unknown IDs", () => {
    expect(getTemplate("nonexistent")).toBeUndefined();
    expect(getTemplate("")).toBeUndefined();
  });

  describe.each(TEMPLATE_IDS)("template: %s", (id) => {
    let tmpl: DealerTemplate;

    beforeAll(() => {
      const t = getTemplate(id);
      expect(t).toBeDefined();
      tmpl = t!;
    });

    it("has a matching id field", () => {
      expect(tmpl.id).toBe(id);
    });

    it("has a non-empty label", () => {
      expect(tmpl.label.length).toBeGreaterThan(0);
    });

    it("has a non-empty description", () => {
      expect(tmpl.description.length).toBeGreaterThan(0);
    });

    it("has a valid hex primaryColor", () => {
      expect(isValidHexColor(tmpl.branding.primaryColor)).toBe(true);
    });

    it("has a valid hex accentColor", () => {
      expect(isValidHexColor(tmpl.branding.accentColor)).toBe(true);
    });

    it("primaryColor and accentColor are different", () => {
      expect(tmpl.branding.primaryColor).not.toBe(tmpl.branding.accentColor);
    });

    it("has a non-empty tagline", () => {
      expect(tmpl.tagline.length).toBeGreaterThan(0);
    });

    it("has at least 3 features", () => {
      expect(tmpl.features.length).toBeGreaterThanOrEqual(3);
    });

    it("features are non-empty strings", () => {
      for (const f of tmpl.features) {
        expect(typeof f).toBe("string");
        expect(f.length).toBeGreaterThan(0);
      }
    });

    it("has at least 3 homepage layout sections", () => {
      expect(tmpl.homepageLayout.length).toBeGreaterThanOrEqual(3);
    });

    it("has at least 3 SEO keywords", () => {
      expect(tmpl.seoKeywords.length).toBeGreaterThanOrEqual(3);
    });

    it("SEO keywords are non-empty strings", () => {
      for (const kw of tmpl.seoKeywords) {
        expect(typeof kw).toBe("string");
        expect(kw.length).toBeGreaterThan(0);
      }
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Template defaults                                                  */
/* ------------------------------------------------------------------ */

describe("getTemplateDefaults", () => {
  it("returns correct defaults for independent_used", () => {
    const defaults = getTemplateDefaults("independent_used");
    expect(defaults).toBeDefined();
    expect(defaults!.primaryColor).toBe("#2563eb");
    expect(defaults!.tagline).toContain("Pre-Owned");
    expect(defaults!.features.length).toBeGreaterThan(0);
    expect(defaults!.homepageLayout.length).toBeGreaterThan(0);
    expect(defaults!.seoKeywords.length).toBeGreaterThan(0);
  });

  it("returns correct defaults for luxury", () => {
    const defaults = getTemplateDefaults("luxury");
    expect(defaults).toBeDefined();
    expect(defaults!.primaryColor).toBe("#18181b");
    expect(defaults!.accentColor).toBe("#ca8a04");
  });

  it("returns correct defaults for ev_focused", () => {
    const defaults = getTemplateDefaults("ev_focused");
    expect(defaults).toBeDefined();
    expect(defaults!.primaryColor).toBe("#059669");
    expect(defaults!.tagline).toContain("Electric");
  });

  it("returns undefined for unknown template", () => {
    expect(getTemplateDefaults("bogus_template")).toBeUndefined();
  });

  it("returns a copy (not a reference) of features array", () => {
    const d1 = getTemplateDefaults("luxury")!;
    const d2 = getTemplateDefaults("luxury")!;
    expect(d1.features).not.toBe(d2.features);
    expect(d1.features).toEqual(d2.features);
  });
});

/* ------------------------------------------------------------------ */
/*  Hex color validation                                               */
/* ------------------------------------------------------------------ */

describe("isValidHexColor", () => {
  it("accepts valid 6-digit hex colors", () => {
    expect(isValidHexColor("#000000")).toBe(true);
    expect(isValidHexColor("#FFFFFF")).toBe(true);
    expect(isValidHexColor("#2563eb")).toBe(true);
    expect(isValidHexColor("#aaBBcc")).toBe(true);
  });

  it("rejects 3-digit shorthand", () => {
    expect(isValidHexColor("#fff")).toBe(false);
  });

  it("rejects missing hash", () => {
    expect(isValidHexColor("000000")).toBe(false);
  });

  it("rejects 8-digit (with alpha)", () => {
    expect(isValidHexColor("#00000000")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isValidHexColor("#gggggg")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidHexColor("")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  CSV format detection                                               */
/* ------------------------------------------------------------------ */

describe("detectCsvFormat", () => {
  it("detects VinSolutions format by Stock # column", () => {
    expect(detectCsvFormat("Stock #,VIN,Year,Make,Model,Price")).toBe(
      "vinsolutions",
    );
  });

  it("detects VinSolutions format by StockNumber column", () => {
    expect(detectCsvFormat("StockNumber,VIN,Year,Make,Model")).toBe(
      "vinsolutions",
    );
  });

  it("detects DealerTrack format by Deal_ID column", () => {
    expect(detectCsvFormat("Deal_ID,VIN,Year,Make,Model,BookValue")).toBe(
      "dealertrack",
    );
  });

  it("detects DealerTrack format by BookValue column", () => {
    expect(detectCsvFormat("VIN,Year,Make,Model,BookValue,Price")).toBe(
      "dealertrack",
    );
  });

  it("returns generic for standard CSV headers", () => {
    expect(detectCsvFormat("VIN,Year,Make,Model,Price")).toBe("generic");
  });

  it("returns generic for empty header", () => {
    expect(detectCsvFormat("")).toBe("generic");
  });
});

/* ------------------------------------------------------------------ */
/*  CSV parsing                                                        */
/* ------------------------------------------------------------------ */

describe("parseDealerCsv", () => {
  it("parses a generic CSV with required columns", () => {
    const csv = "VIN,Year,Make,Model,Price\n1HGCM82633A123456,2024,Honda,Accord,28999\n";
    const result = parseDealerCsv(csv);
    expect(result.vehicleCount).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(result.format).toBe("generic");
    expect(result.rows[0]["VIN"]).toBe("1HGCM82633A123456");
  });

  it("handles BOM character at start of file", () => {
    const csv = "\uFEFFVIN,Year,Make,Model,Price\n1HGCM82633A123456,2024,Honda,Accord,28999\n";
    const result = parseDealerCsv(csv);
    expect(result.vehicleCount).toBe(1);
    expect(result.headers[0]).toBe("VIN");
  });

  it("handles quoted fields with commas inside", () => {
    const csv = 'Name,Description,Price\n"Smith, John","Nice car, great deal",29999\n';
    const result = parseDealerCsv(csv);
    expect(result.vehicleCount).toBe(1);
    expect(result.rows[0]["Name"]).toBe("Smith, John");
    expect(result.rows[0]["Description"]).toBe("Nice car, great deal");
  });

  it("handles Windows-style line endings (CRLF)", () => {
    const csv = "VIN,Year,Make,Model,Price\r\nABC123,2024,Toyota,Camry,25000\r\n";
    const result = parseDealerCsv(csv);
    expect(result.vehicleCount).toBe(1);
  });

  it("returns error for header-only CSV", () => {
    const csv = "VIN,Year,Make,Model,Price\n";
    const result = parseDealerCsv(csv);
    expect(result.vehicleCount).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("header row");
  });

  it("returns error for empty string", () => {
    const result = parseDealerCsv("");
    expect(result.vehicleCount).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("parses multiple rows correctly", () => {
    const csv = [
      "VIN,Year,Make,Model,Price",
      "AAA111,2024,Honda,Civic,22000",
      "BBB222,2023,Toyota,Camry,25000",
      "CCC333,2022,Ford,F-150,35000",
    ].join("\n");
    const result = parseDealerCsv(csv);
    expect(result.vehicleCount).toBe(3);
    expect(result.errors).toHaveLength(0);
  });

  it("detects VinSolutions format during parse", () => {
    const csv = "Stock #,VIN,Year,Make,Model,Price\nS001,ABC123,2024,Honda,Accord,29000\n";
    const result = parseDealerCsv(csv);
    expect(result.format).toBe("vinsolutions");
  });

  it("handles escaped double quotes inside quoted fields", () => {
    const csv = 'Name,Note\n"8"" Lift","Great truck"\n';
    const result = parseDealerCsv(csv);
    expect(result.rows[0]["Name"]).toBe('8" Lift');
  });
});

/* ------------------------------------------------------------------ */
/*  Progress persistence                                               */
/* ------------------------------------------------------------------ */

describe("onboarding progress", () => {
  it("creates a fresh progress record", () => {
    const progress = createOnboardingProgress("dlr_test_123");
    expect(progress.dealerId).toBe("dlr_test_123");
    expect(progress.currentStep).toBe(0);
    expect(progress.completedSteps).toEqual([]);
    expect(progress.data).toEqual({});
    expect(progress.startedAt).toBeTruthy();
    expect(progress.updatedAt).toBeTruthy();
  });

  it("creates progress without dealer ID", () => {
    const progress = createOnboardingProgress();
    expect(progress.dealerId).toBeUndefined();
    expect(progress.currentStep).toBe(0);
  });

  it("advances to next step and records completed step", () => {
    const p0 = createOnboardingProgress("dlr_1");
    const p1 = advanceOnboardingStep(p0, 0, { name: "Test Dealer" });

    expect(p1.currentStep).toBe(1);
    expect(p1.completedSteps).toEqual([0]);
    expect(p1.data).toEqual({ step_0: { name: "Test Dealer" } });
    // updatedAt is refreshed (may be same ms in fast runs, so just check it exists)
    expect(typeof p1.updatedAt).toBe("string");
    expect(p1.updatedAt.length).toBeGreaterThan(0);
  });

  it("does not duplicate completed steps on re-advance", () => {
    const p0 = createOnboardingProgress();
    const p1 = advanceOnboardingStep(p0, 0);
    const p2 = advanceOnboardingStep(p1, 0);
    expect(p2.completedSteps).toEqual([0]);
  });

  it("keeps completed steps sorted", () => {
    let p = createOnboardingProgress();
    p = advanceOnboardingStep(p, 2);
    p = advanceOnboardingStep(p, 0);
    p = advanceOnboardingStep(p, 1);
    expect(p.completedSteps).toEqual([0, 1, 2]);
  });

  it("round-trips through serialize/deserialize", () => {
    const original = createOnboardingProgress("dlr_rt");
    const advanced = advanceOnboardingStep(original, 0, { foo: "bar" });

    const serialized = serializeProgress(advanced);
    const deserialized = deserializeProgress(serialized);

    expect(deserialized).not.toBeNull();
    expect(deserialized!.dealerId).toBe("dlr_rt");
    expect(deserialized!.currentStep).toBe(1);
    expect(deserialized!.completedSteps).toEqual([0]);
    expect(deserialized!.data).toEqual({ step_0: { foo: "bar" } });
  });

  it("deserialize returns null for corrupt data", () => {
    expect(deserializeProgress("not-json")).toBeNull();
    expect(deserializeProgress("{}")).toBeNull();
    expect(deserializeProgress('{"currentStep":"oops"}')).toBeNull();
  });

  it("deserialize returns null for missing completedSteps", () => {
    expect(deserializeProgress('{"currentStep":1}')).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Analytics integration                                              */
/* ------------------------------------------------------------------ */

describe("onboarding analytics", () => {
  /**
   * These tests validate that the onboarding analytics module exports
   * the expected functions used by the onboarding wizard and API route.
   * The actual DB writes are tested separately in integration tests.
   */
  it("trackOnboardingStep is exported and callable", async () => {
    const mod = await import("../onboarding-analytics");
    expect(typeof mod.trackOnboardingStep).toBe("function");
  });

  it("trackOnboardingComplete is exported and callable", async () => {
    const mod = await import("../onboarding-analytics");
    expect(typeof mod.trackOnboardingComplete).toBe("function");
  });

  it("trackOnboardingDropOff is exported and callable", async () => {
    const mod = await import("../onboarding-analytics");
    expect(typeof mod.trackOnboardingDropOff).toBe("function");
  });

  it("trackChecklistProgress is exported and callable", async () => {
    const mod = await import("../onboarding-analytics");
    expect(typeof mod.trackChecklistProgress).toBe("function");
  });

  it("trackOnboardingMilestone is exported and callable", async () => {
    const mod = await import("../onboarding-analytics");
    expect(typeof mod.trackOnboardingMilestone).toBe("function");
  });

  it("all analytics functions accept the expected signature without throwing", async () => {
    // Verify fire-and-forget: no errors even without DATABASE_URL
    const mod = await import("../onboarding-analytics");
    delete process.env.DATABASE_URL;

    // These should all be no-ops without DB
    expect(() => mod.trackOnboardingStep("dlr_test", 0, "basics", 0)).not.toThrow();
    expect(() => mod.trackOnboardingStep("dlr_test", 1, "customize", 5000)).not.toThrow();
    expect(() => mod.trackOnboardingComplete("dlr_test", 30000, 2, "csv")).not.toThrow();
    expect(() => mod.trackOnboardingDropOff("dlr_test", 1, "customize", 15000)).not.toThrow();
    expect(() => mod.trackChecklistProgress("dlr_test", 3, 8, "add_logo")).not.toThrow();
    expect(() => mod.trackOnboardingMilestone("dlr_test", "first_vehicle", 60000)).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*  Template-specific content validation                               */
/* ------------------------------------------------------------------ */

describe("template content quality", () => {
  it("independent_used focuses on affordability in tagline", () => {
    const tmpl = getTemplate("independent_used")!;
    const taglineLower = tmpl.tagline.toLowerCase();
    expect(
      taglineLower.includes("price") ||
      taglineLower.includes("love") ||
      taglineLower.includes("affordable") ||
      taglineLower.includes("value"),
    ).toBe(true);
  });

  it("ev_focused includes range calculator in features", () => {
    const tmpl = getTemplate("ev_focused")!;
    expect(tmpl.features).toContain("range_calculator");
  });

  it("ev_focused includes tax credit in features or SEO keywords", () => {
    const tmpl = getTemplate("ev_focused")!;
    const hasTaxCreditFeature = tmpl.features.some((f) =>
      f.includes("tax_credit"),
    );
    const hasTaxCreditSEO = tmpl.seoKeywords.some((k) =>
      k.toLowerCase().includes("tax credit"),
    );
    expect(hasTaxCreditFeature || hasTaxCreditSEO).toBe(true);
  });

  it("truck_specialty includes towing in features", () => {
    const tmpl = getTemplate("truck_specialty")!;
    expect(tmpl.features.some((f) => f.includes("towing"))).toBe(true);
  });

  it("luxury uses dark primary color (premium feel)", () => {
    const tmpl = getTemplate("luxury")!;
    // #18181b is very dark — check that it's a low-lightness color
    const r = parseInt(tmpl.branding.primaryColor.slice(1, 3), 16);
    const g = parseInt(tmpl.branding.primaryColor.slice(3, 5), 16);
    const b = parseInt(tmpl.branding.primaryColor.slice(5, 7), 16);
    const avg = (r + g + b) / 3;
    expect(avg).toBeLessThan(100); // dark color
  });

  it("franchise_new includes OEM-related features", () => {
    const tmpl = getTemplate("franchise_new")!;
    expect(tmpl.features.some((f) => f.includes("oem") || f.includes("certified"))).toBe(true);
  });

  it("no two templates share the same primary color", () => {
    const templates = getAllTemplates();
    const colors = templates.map((t) => t.branding.primaryColor);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it("all templates have unique labels", () => {
    const templates = getAllTemplates();
    const labels = templates.map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
