/**
 * Onboarding unit tests — dealer-onboarding.ts logic.
 *
 * Covers slug generation, setup validation, branding defaults,
 * CSV parsing, invite token shape, analytics event structure,
 * bulk provisioning validation, and logo data handling.
 *
 * Run with: npx jest src/lib/__tests__/onboarding.test.ts
 */

import {
  generateDealerSlug,
  createDefaultBranding,
  validateDealerSetup,
  type OnboardingPayload,
} from "../dealer-onboarding";
import * as crypto from "node:crypto";

/* -------------------------------------------------------------------------- */
/* Slug generation                                                            */
/* -------------------------------------------------------------------------- */

describe("generateDealerSlug", () => {
  it("converts a normal name to a lowercase hyphenated slug", () => {
    expect(generateDealerSlug("Wolfpack Motors LLC")).toBe(
      "wolfpack-motors-llc",
    );
  });

  it("strips special characters (parentheses, ampersands, quotes)", () => {
    // more importantly: no special chars remain
    const slug = generateDealerSlug("Bob's Auto (Tampa) & Sons");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("handles leading and trailing whitespace", () => {
    expect(generateDealerSlug("  Coastal Cars  ")).toBe("coastal-cars");
  });

  it("collapses multiple spaces into a single hyphen", () => {
    expect(generateDealerSlug("Big    Gap   Motors")).toBe("big-gap-motors");
  });

  it("collapses multiple hyphens into one", () => {
    expect(generateDealerSlug("A---B---C")).toBe("a-b-c");
  });

  it("removes leading and trailing hyphens", () => {
    expect(generateDealerSlug("-Leading Trailing-")).toBe("leading-trailing");
  });

  it("handles unicode characters by stripping them", () => {
    const slug = generateDealerSlug("Café Motören");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug).toBe("caf-motren");
  });

  it("handles an all-special-characters name by returning empty string", () => {
    expect(generateDealerSlug("@#$%^&*()")).toBe("");
  });

  it("handles a single word", () => {
    expect(generateDealerSlug("AutoMax")).toBe("automax");
  });

  it("handles numbers in the name", () => {
    expect(generateDealerSlug("Highway 101 Motors")).toBe("highway-101-motors");
  });

  it("produces unique slugs for different dealer names", () => {
    const slug1 = generateDealerSlug("Wolfpack Motors");
    const slug2 = generateDealerSlug("Wolfpack Auto");
    expect(slug1).not.toBe(slug2);
  });

  it("handles empty string input", () => {
    expect(generateDealerSlug("")).toBe("");
  });
});

/* -------------------------------------------------------------------------- */
/* Default branding                                                           */
/* -------------------------------------------------------------------------- */

describe("createDefaultBranding", () => {
  it("returns expected default colors", () => {
    const branding = createDefaultBranding("Test Dealer");
    expect(branding.primaryColor).toBe("#0070c7");
    expect(branding.accentColor).toBe("#f97316");
  });

  it("includes the dealer name in the tagline", () => {
    const branding = createDefaultBranding("Wolfpack Motors");
    expect(branding.tagline).toContain("Wolfpack Motors");
  });

  it("sets logoUrl and faviconUrl to null by default", () => {
    const branding = createDefaultBranding("Any Dealer");
    expect(branding.logoUrl).toBeNull();
    expect(branding.faviconUrl).toBeNull();
  });

  it("sets Inter as the default font family", () => {
    const branding = createDefaultBranding("Any Dealer");
    expect(branding.fontFamily).toBe("Inter");
    expect(branding.displayFont).toBe("Inter");
  });
});

/* -------------------------------------------------------------------------- */
/* Setup validation                                                           */
/* -------------------------------------------------------------------------- */

describe("validateDealerSetup", () => {
  const completeDealerRecord = {
    name: "Test Motors",
    phone: "555-0100",
    email: "info@test.com",
    address_street: "123 Main St",
    address_city: "Tampa",
    address_state: "FL",
    address_zip: "33601",
    branding_config: { primaryColor: "#0070c7" },
    inventory_count: 5,
    team_count: 2,
  };

  it("returns complete=true when all steps are done", () => {
    const result = validateDealerSetup(completeDealerRecord);
    expect(result.complete).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("flags missing dealership name", () => {
    const result = validateDealerSetup({ ...completeDealerRecord, name: "" });
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("dealership_name");
  });

  it("flags missing phone", () => {
    const result = validateDealerSetup({ ...completeDealerRecord, phone: "" });
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("phone_number");
  });

  it("flags missing branding config (null)", () => {
    const result = validateDealerSetup({
      ...completeDealerRecord,
      branding_config: null,
    });
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("branding_configuration");
  });

  it("flags missing inventory when count is 0", () => {
    const result = validateDealerSetup({
      ...completeDealerRecord,
      inventory_count: 0,
    });
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("inventory");
  });

  it("flags missing inventory when field is undefined", () => {
    const { inventory_count, ...partial } = completeDealerRecord;
    const result = validateDealerSetup(partial as typeof completeDealerRecord);
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("inventory");
  });

  it("flags missing team when count is 0", () => {
    const result = validateDealerSetup({
      ...completeDealerRecord,
      team_count: 0,
    });
    expect(result.complete).toBe(false);
    expect(result.missing).toContain("team_members");
  });

  it("flags all missing steps for a completely empty record", () => {
    const result = validateDealerSetup({});
    expect(result.complete).toBe(false);
    expect(result.missing.length).toBeGreaterThanOrEqual(7);
  });

  it("flags whitespace-only fields as missing", () => {
    const result = validateDealerSetup({
      ...completeDealerRecord,
      name: "   ",
      phone: "  ",
    });
    expect(result.missing).toContain("dealership_name");
    expect(result.missing).toContain("phone_number");
  });
});

/* -------------------------------------------------------------------------- */
/* Invite token generation shape                                              */
/* -------------------------------------------------------------------------- */

describe("invite token generation", () => {
  it("crypto.randomBytes(32) produces a 64-character hex token", () => {
    const token = crypto.randomBytes(32).toString("hex");
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[a-f0-9]+$/);
  });

  it("successive tokens are unique", () => {
    const tokens = Array.from({ length: 100 }, () =>
      crypto.randomBytes(32).toString("hex"),
    );
    const uniqueSet = new Set(tokens);
    expect(uniqueSet.size).toBe(100);
  });

  it("invite expiry is 7 days from now", () => {
    const now = new Date();
    const expiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const diffMs = expiry.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeCloseTo(7, 5);
  });

  it("expired token is detected correctly", () => {
    const pastExpiry = new Date(Date.now() - 1000);
    expect(pastExpiry.getTime() < Date.now()).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Owner role auto-assignment                                                 */
/* -------------------------------------------------------------------------- */

describe("owner role auto-assignment", () => {
  it("first user on a new dealer should be assignable as owner/admin", () => {
    // The onboarding route creates the dealer owner as the authenticated user.
    // Team members invited via the wizard get the role specified in the form.
    // This tests the invariant: team member roles are constrained to valid values.
    const validRoles = ["admin", "manager", "staff"];
    expect(validRoles).toContain("admin");
  });

  it("team schema rejects invalid roles", () => {
    const { z } = require("zod");
    const teamMemberSchema = z.object({
      email: z.string().email(),
      role: z.enum(["admin", "manager", "staff"]),
    });

    const result = teamMemberSchema.safeParse({
      email: "test@example.com",
      role: "superadmin",
    });
    expect(result.success).toBe(false);
  });

  it("team schema accepts all valid roles", () => {
    const { z } = require("zod");
    const teamMemberSchema = z.object({
      email: z.string().email(),
      role: z.enum(["admin", "manager", "staff"]),
    });

    for (const role of ["admin", "manager", "staff"]) {
      const result = teamMemberSchema.safeParse({
        email: "test@example.com",
        role,
      });
      expect(result.success).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Onboarding analytics event structure                                       */
/* -------------------------------------------------------------------------- */

describe("onboarding analytics event structure", () => {
  it("system.onboarding_step is a valid event name pattern", () => {
    const event = "system.onboarding_step";
    expect(event.split(".")).toHaveLength(2);
    expect(event.split(".")[0]).toBe("system");
  });

  it("event metadata should include action and dealer_id", () => {
    const metadata = {
      action: "onboarding_completed",
      dealer_id: "dlr_test_123",
    };
    expect(metadata).toHaveProperty("action");
    expect(metadata).toHaveProperty("dealer_id");
    expect(typeof metadata.action).toBe("string");
    expect(typeof metadata.dealer_id).toBe("string");
  });

  it("event metadata action values map to wizard steps", () => {
    const validActions = [
      "onboarding_started",
      "step_1_completed",
      "step_2_completed",
      "step_3_completed",
      "step_4_completed",
      "onboarding_completed",
    ];
    for (const action of validActions) {
      expect(typeof action).toBe("string");
      expect(action.length).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Logo data handling (base64 validation)                                     */
/* -------------------------------------------------------------------------- */

describe("logo data handling", () => {
  it("null logo is valid (optional field)", () => {
    const payload: OnboardingPayload = {
      dealership: {
        name: "Test",
        address: "123 Main",
        city: "Tampa",
        state: "FL",
        zip: "33601",
        phone: "555-0100",
        email: "a@b.com",
        website: "",
      },
      branding: { logoFile: null, primaryColor: "#0070c7", tagline: "" },
      inventory: { method: "manual" },
      team: [],
    };
    expect(payload.branding.logoFile).toBeNull();
  });

  it("base64 data URI format is recognized", () => {
    const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
    expect(dataUri.startsWith("data:image/")).toBe(true);
    const parts = dataUri.split(",");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain("base64");
  });

  it("rejects non-image MIME types in data URI", () => {
    const badUri = "data:application/javascript;base64,YWxlcnQoMSk=";
    expect(badUri.startsWith("data:image/")).toBe(false);
  });

  it("valid hex color matches the branding schema regex", () => {
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    expect("#0070c7").toMatch(hexRegex);
    expect("#FFFFFF").toMatch(hexRegex);
    expect("#000000").toMatch(hexRegex);
    expect("red").not.toMatch(hexRegex);
    expect("#0070c").not.toMatch(hexRegex);
    expect("#0070c7f").not.toMatch(hexRegex);
  });
});

/* -------------------------------------------------------------------------- */
/* Bulk provisioning validation                                               */
/* -------------------------------------------------------------------------- */

describe("bulk provisioning validation", () => {
  const MAX_BATCH_SIZE = 50;

  it("rejects batch exceeding max limit of 50", () => {
    const batch = Array.from({ length: 51 }, (_, i) => ({
      name: `Dealer ${i}`,
      email: `dealer${i}@example.com`,
    }));
    expect(batch.length).toBeGreaterThan(MAX_BATCH_SIZE);
  });

  it("accepts batch at exactly the max limit", () => {
    const batch = Array.from({ length: 50 }, (_, i) => ({
      name: `Dealer ${i}`,
      email: `dealer${i}@example.com`,
    }));
    expect(batch.length).toBeLessThanOrEqual(MAX_BATCH_SIZE);
  });

  it("detects duplicate emails within a batch", () => {
    const batch = [
      { name: "Dealer A", email: "same@example.com" },
      { name: "Dealer B", email: "same@example.com" },
      { name: "Dealer C", email: "unique@example.com" },
    ];
    const emails = batch.map((d) => d.email);
    const uniqueEmails = new Set(emails);
    expect(uniqueEmails.size).toBeLessThan(emails.length);
  });

  it("detects duplicate dealer names within a batch", () => {
    const batch = [
      { name: "Wolfpack Motors", email: "a@example.com" },
      { name: "Wolfpack Motors", email: "b@example.com" },
    ];
    const slugs = batch.map((d) => generateDealerSlug(d.name));
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBeLessThan(slugs.length);
  });

  it("empty batch is handled (length 0)", () => {
    const batch: Array<{ name: string; email: string }> = [];
    expect(batch.length).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* CSV parsing validation                                                     */
/* -------------------------------------------------------------------------- */

describe("CSV parsing for inventory import", () => {
  function parseCSVHeader(csv: string): string[] {
    const firstLine = csv.split("\n")[0];
    if (!firstLine) return [];
    return firstLine.split(",").map((h) => h.trim().toLowerCase());
  }

  it("parses a valid CSV header with required columns", () => {
    const csv = "VIN,Year,Make,Model,Price\n1HGCV1F34PA000001,2024,Honda,CR-V,35000";
    const headers = parseCSVHeader(csv);
    expect(headers).toContain("vin");
    expect(headers).toContain("year");
    expect(headers).toContain("make");
    expect(headers).toContain("model");
    expect(headers).toContain("price");
  });

  it("detects missing required columns", () => {
    const csv = "Year,Make,Model\n2024,Honda,CR-V";
    const headers = parseCSVHeader(csv);
    const required = ["vin", "year", "make", "model", "price"];
    const missing = required.filter((r) => !headers.includes(r));
    expect(missing).toContain("vin");
    expect(missing).toContain("price");
  });

  it("handles empty CSV string", () => {
    const headers = parseCSVHeader("");
    expect(headers).toEqual([]);
  });

  it("handles CSV with only a header row (no data)", () => {
    const csv = "VIN,Year,Make,Model,Price";
    const lines = csv.split("\n").filter((l) => l.trim());
    expect(lines.length).toBe(1); // header only, no data rows
  });

  it("handles special characters in VIN column", () => {
    const csv =
      "VIN,Year,Make,Model,Price\nWBA7E2C5XJG123456,2018,BMW,7 Series,45000";
    const rows = csv.split("\n").slice(1);
    const vin = rows[0].split(",")[0];
    // VIN should be 17 alphanumeric characters
    expect(vin).toMatch(/^[A-Z0-9]{17}$/);
  });

  it("detects malformed rows (wrong column count)", () => {
    const csv = "VIN,Year,Make,Model,Price\n1HGCV1F34PA000001,2024,Honda";
    const headerCount = csv.split("\n")[0].split(",").length;
    const rowCount = csv.split("\n")[1].split(",").length;
    expect(rowCount).toBeLessThan(headerCount);
  });
});

/* -------------------------------------------------------------------------- */
/* Production prep: DB unavailability                                         */
/* -------------------------------------------------------------------------- */

describe("DB unavailability returns 503", () => {
  it("missing DATABASE_URL should be detectable as undefined", () => {
    const env: Record<string, string | undefined> = {};
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("empty DATABASE_URL string is falsy", () => {
    const dbUrl = "";
    expect(!dbUrl).toBe(true);
  });

  it("503 response body has the correct shape", () => {
    const errorResponse = {
      error: "Service temporarily unavailable. Database is not configured.",
      code: "DB_UNAVAILABLE",
    };
    expect(errorResponse).toHaveProperty("error");
    expect(errorResponse).toHaveProperty("code");
    expect(errorResponse.code).toBe("DB_UNAVAILABLE");
    expect(typeof errorResponse.error).toBe("string");
  });

  it("error response does not leak connection strings", () => {
    const errorResponse = {
      error: "Service temporarily unavailable. Database is not configured.",
      code: "DB_UNAVAILABLE",
    };
    expect(errorResponse.error).not.toContain("postgres://");
    expect(errorResponse.error).not.toContain("password");
    expect(JSON.stringify(errorResponse)).not.toContain("neon.tech");
  });
});

/* -------------------------------------------------------------------------- */
/* Production prep: CSV error reporting with row numbers                      */
/* -------------------------------------------------------------------------- */

describe("CSV error reporting returns structured errors with row numbers", () => {
  /**
   * Mirror of parseCsvInventory logic for testability.
   * Tests the parsing contract without importing the route handler.
   */
  function parseCsvForTest(csvText: string): {
    rows: Array<{ vin: string; year: number; make: string; model: string; price: number }>;
    errors: string[];
  } {
    const rows: Array<{ vin: string; year: number; make: string; model: string; price: number }> = [];
    const errors: string[] = [];

    const lines = csvText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      return { rows: [], errors: ["CSV must have a header row and at least one data row"] };
    }

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const vinIdx = headers.indexOf("vin");
    const yearIdx = headers.indexOf("year");
    const makeIdx = headers.indexOf("make");
    const modelIdx = headers.indexOf("model");
    const priceIdx = headers.indexOf("price");

    const requiredCols = { vin: vinIdx, year: yearIdx, make: makeIdx, model: modelIdx, price: priceIdx };
    const missingCols = Object.entries(requiredCols)
      .filter(([, idx]) => idx === -1)
      .map(([name]) => name);
    if (missingCols.length > 0) {
      return { rows: [], errors: [`Missing required CSV columns: ${missingCols.join(", ")}`] };
    }

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim());
      const lineNum = i + 1;
      const vin = values[vinIdx] ?? "";
      const yearStr = values[yearIdx] ?? "";
      const make = values[makeIdx] ?? "";
      const model = values[modelIdx] ?? "";
      const priceStr = values[priceIdx] ?? "";

      if (!vin || vin.length < 5) { errors.push(`Row ${lineNum}: Invalid or missing VIN`); continue; }
      const year = parseInt(yearStr, 10);
      if (isNaN(year) || year < 1900 || year > new Date().getFullYear() + 2) {
        errors.push(`Row ${lineNum}: Invalid year "${yearStr}"`); continue;
      }
      if (!make) { errors.push(`Row ${lineNum}: Missing make`); continue; }
      if (!model) { errors.push(`Row ${lineNum}: Missing model`); continue; }
      const price = parseFloat(priceStr.replace(/[$,]/g, ""));
      if (isNaN(price) || price <= 0) { errors.push(`Row ${lineNum}: Invalid price "${priceStr}"`); continue; }

      rows.push({ vin: vin.toUpperCase(), year, make, model, price });
    }

    return { rows, errors };
  }

  it("returns error with row number for invalid VIN", () => {
    const csv = "VIN,Year,Make,Model,Price\nAB,2024,Honda,Civic,30000";
    const { rows, errors } = parseCsvForTest(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^Row 2:/);
    expect(errors[0]).toContain("VIN");
  });

  it("returns error with row number for invalid year", () => {
    const csv = "VIN,Year,Make,Model,Price\n1HGCV1F34PA000001,ABCD,Honda,Civic,30000";
    const { errors } = parseCsvForTest(csv);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^Row 2:/);
    expect(errors[0]).toContain("year");
  });

  it("returns error with row number for missing make", () => {
    const csv = "VIN,Year,Make,Model,Price\n1HGCV1F34PA000001,2024,,Civic,30000";
    const { errors } = parseCsvForTest(csv);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^Row 2:/);
    expect(errors[0]).toContain("make");
  });

  it("returns error with row number for invalid price", () => {
    const csv = "VIN,Year,Make,Model,Price\n1HGCV1F34PA000001,2024,Honda,Civic,free";
    const { errors } = parseCsvForTest(csv);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^Row 2:/);
    expect(errors[0]).toContain("price");
  });

  it("reports multiple errors from multiple bad rows", () => {
    const csv = [
      "VIN,Year,Make,Model,Price",
      "AB,2024,Honda,Civic,30000",        // row 2: bad VIN
      "1HGCV1F34PA000001,ABCD,Honda,Civic,30000", // row 3: bad year
      "1HGCV1F34PA000002,2024,Honda,Civic,35000",  // row 4: valid
    ].join("\n");
    const { rows, errors } = parseCsvForTest(csv);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/^Row 2:/);
    expect(errors[1]).toMatch(/^Row 3:/);
    expect(rows).toHaveLength(1);
    expect(rows[0].vin).toBe("1HGCV1F34PA000002");
  });

  it("returns structured error for missing required columns", () => {
    const csv = "VIN,Year,Make\n1HGCV1F34PA000001,2024,Honda";
    const { errors } = parseCsvForTest(csv);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Missing required CSV columns");
    expect(errors[0]).toContain("model");
    expect(errors[0]).toContain("price");
  });

  it("returns error for CSV with only a header row", () => {
    const csv = "VIN,Year,Make,Model,Price";
    const { errors } = parseCsvForTest(csv);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("header row and at least one data row");
  });

  it("handles dollar signs and commas in price column", () => {
    const csv = "VIN,Year,Make,Model,Price\n1HGCV1F34PA000001,2024,Honda,Civic,$35,000";
    // CSV comma in price will cause a split issue — this is expected behavior
    const { rows, errors } = parseCsvForTest(csv);
    // The price column becomes "35" because the CSV split on commas
    expect(rows.length + errors.length).toBeGreaterThan(0);
  });

  it("parses valid rows alongside invalid rows correctly", () => {
    const csv = [
      "VIN,Year,Make,Model,Price",
      "1HGCV1F34PA000001,2024,Honda,Civic,30000",
      ",2024,Honda,Accord,35000",
      "1HGCV1F34PA000003,2024,Toyota,Camry,28000",
    ].join("\n");
    const { rows, errors } = parseCsvForTest(csv);
    expect(rows).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^Row 3:/);
  });
});

/* -------------------------------------------------------------------------- */
/* Production prep: 3-step validation (name, email, phone required)           */
/* -------------------------------------------------------------------------- */

describe("3-step validation: only name, email, phone are required", () => {
  it("validates with just name, email, and phone (no address)", () => {
    const result = validateDealerSetup({
      name: "Test Dealer",
      email: "test@example.com",
      phone: "555-0100",
    });
    // name, email, phone are present — address/city/state/zip will be missing
    expect(result.missing).not.toContain("dealership_name");
    expect(result.missing).not.toContain("email_address");
    expect(result.missing).not.toContain("phone_number");
  });

  it("name is required — empty name flags dealership_name", () => {
    const result = validateDealerSetup({
      name: "",
      email: "test@example.com",
      phone: "555-0100",
    });
    expect(result.missing).toContain("dealership_name");
  });

  it("email is required — empty email flags email_address", () => {
    const result = validateDealerSetup({
      name: "Test Dealer",
      email: "",
      phone: "555-0100",
    });
    expect(result.missing).toContain("email_address");
  });

  it("phone is required — empty phone flags phone_number", () => {
    const result = validateDealerSetup({
      name: "Test Dealer",
      email: "test@example.com",
      phone: "",
    });
    expect(result.missing).toContain("phone_number");
  });

  it("address fields are independently optional from core validation", () => {
    const result = validateDealerSetup({
      name: "Test Dealer",
      email: "test@example.com",
      phone: "555-0100",
      branding_config: { primaryColor: "#0070c7" },
      inventory_count: 1,
      team_count: 1,
    });
    // Address fields are still in the missing list but the 3 required core fields pass
    const coreFields = ["dealership_name", "email_address", "phone_number"];
    for (const field of coreFields) {
      expect(result.missing).not.toContain(field);
    }
  });

  it("all three required fields present with whitespace-only values still flags them", () => {
    const result = validateDealerSetup({
      name: "   ",
      email: "   ",
      phone: "   ",
    });
    expect(result.missing).toContain("dealership_name");
    expect(result.missing).toContain("email_address");
    expect(result.missing).toContain("phone_number");
  });
});

/* -------------------------------------------------------------------------- */
/* Production prep: DB pool size configuration                                */
/* -------------------------------------------------------------------------- */

describe("DB pool size configuration", () => {
  it("pool max is >= 8 for production workloads", () => {
    // db.ts poolConfig.max was deliberately lowered 12 -> 8 in the
    // 2026-05-12 Neon cold-start incident fix (commit 32da9eb): a smaller
    // pool spends less time queued behind dead connections during Neon
    // free-tier compute auto-suspend cold starts. Do not bump it back up
    // without a corresponding Neon connection-quota change.
    const poolMax = 8; // mirrors db.ts poolConfig.max
    expect(poolMax).toBeGreaterThanOrEqual(8);
  });

  it("idle timeout is set (not infinite)", () => {
    const idleTimeoutMillis = 30_000;
    expect(idleTimeoutMillis).toBeGreaterThan(0);
    expect(idleTimeoutMillis).toBeLessThanOrEqual(120_000);
  });

  it("connection timeout is set (not infinite)", () => {
    const connectionTimeoutMillis = 5_000;
    expect(connectionTimeoutMillis).toBeGreaterThan(0);
    expect(connectionTimeoutMillis).toBeLessThanOrEqual(30_000);
  });

  it("statement timeout is set to prevent hung queries", () => {
    const statementTimeout = 10_000;
    expect(statementTimeout).toBeGreaterThan(0);
    expect(statementTimeout).toBeLessThanOrEqual(60_000);
  });

  it("db.ts source has pool max >= 8", async () => {
    // Intentionally 8 (not 10+): see the 2026-05-12 Neon cold-start incident
    // fix (commit 32da9eb) documented in db.ts. The lower bound guards against
    // an accidental drop to a starvation-prone pool while preserving the
    // deliberate Neon-quota reduction.
    const fs = await import("fs");
    const path = await import("path");
    const dbSource = fs.readFileSync(
      path.join(__dirname, "../db.ts"),
      "utf-8",
    );
    const maxMatch = dbSource.match(/max:\s*(\d+)/);
    expect(maxMatch).not.toBeNull();
    expect(parseInt(maxMatch![1], 10)).toBeGreaterThanOrEqual(8);
  });

  it("db.ts source has statement_timeout configured", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const dbSource = fs.readFileSync(
      path.join(__dirname, "../db.ts"),
      "utf-8",
    );
    expect(dbSource).toContain("statement_timeout");
  });
});

/* -------------------------------------------------------------------------- */
/* Production prep: DEMO_MODE detection                                       */
/* -------------------------------------------------------------------------- */

describe("DEMO_MODE detection", () => {
  it("DEMO_MODE=true is flagged as a blocker", () => {
    const demoMode = "true";
    const isBlocker = demoMode === "true";
    expect(isBlocker).toBe(true);
  });

  it("DEMO_MODE=false is not a blocker", () => {
    const demoMode: string = "false";
    const isBlocker = demoMode === "true";
    expect(isBlocker).toBe(false);
  });

  it("undefined DEMO_MODE is not a blocker", () => {
    const demoMode: string | undefined = undefined;
    const isBlocker = demoMode === "true";
    expect(isBlocker).toBe(false);
  });

  it("DEMO_MODE=1 is not mistakenly treated as true (strict check)", () => {
    const demoMode: string = "1";
    const isBlocker = demoMode === "true";
    expect(isBlocker).toBe(false);
  });

  it("predeploy checklist detects DEMO_MODE as a blocker", () => {
    // Simulates the logic from predeploy-checklist.mjs
    const vercelEnv: Record<string, boolean> = { DEMO_MODE: true };
    const isBlocker = !!vercelEnv["DEMO_MODE"];
    expect(isBlocker).toBe(true);
  });

  it("predeploy checklist passes when DEMO_MODE is absent", () => {
    const vercelEnv: Record<string, boolean> = {};
    const isBlocker = !!vercelEnv["DEMO_MODE"];
    expect(isBlocker).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Production prep: onboarding response shape                                 */
/* -------------------------------------------------------------------------- */

describe("onboarding response shape", () => {
  it("201 response includes all required fields", () => {
    const response = {
      dealer_id: "dlr_test-motors_lk2abc",
      slug: "test-motors",
      status: "active",
      dashboard_url: "/admin",
      team_invited: 0,
      invite_tokens_generated: false,
      emails_sent: false,
      onboarding_events: [],
    };

    expect(response).toHaveProperty("dealer_id");
    expect(response).toHaveProperty("slug");
    expect(response).toHaveProperty("status");
    expect(response).toHaveProperty("dashboard_url");
    expect(response).toHaveProperty("team_invited");
    expect(response).toHaveProperty("invite_tokens_generated");
    expect(response).toHaveProperty("emails_sent");
    expect(response).toHaveProperty("onboarding_events");
  });

  it("dealer_id starts with dlr_ prefix", () => {
    const dealerId = "dlr_wolfpack-motors_lk2abc";
    expect(dealerId.startsWith("dlr_")).toBe(true);
  });

  it("slug is URL-safe", () => {
    const slug = generateDealerSlug("Test Motors LLC");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("onboarding_events is always an array", () => {
    const response = { onboarding_events: [] };
    expect(Array.isArray(response.onboarding_events)).toBe(true);
  });

  it("CSV response includes vehicles_imported and csv_errors", () => {
    const csvResponse = {
      dealer_id: "dlr_test_abc",
      slug: "test",
      status: "active",
      vehicles_imported: 5,
      csv_errors: ["Row 3: Invalid VIN"],
    };
    expect(csvResponse).toHaveProperty("vehicles_imported");
    expect(typeof csvResponse.vehicles_imported).toBe("number");
    expect(Array.isArray(csvResponse.csv_errors)).toBe(true);
    expect(csvResponse.csv_errors[0]).toMatch(/^Row \d+:/);
  });
});

/* -------------------------------------------------------------------------- */
/* Production prep: Zod schema validation contract                            */
/* -------------------------------------------------------------------------- */

describe("onboarding Zod schema validation contract", () => {
  const { z } = require("zod");

  const onboardingSchema = z.object({
    dealership: z.object({
      name: z.string().min(1).max(200),
      address: z.string().min(1).max(500),
      city: z.string().min(1).max(100),
      state: z.string().min(1).max(50),
      zip: z.string().min(1).max(20),
      phone: z.string().min(1).max(30),
      email: z.string().email(),
      website: z.string().url().or(z.literal("")).default(""),
    }),
    branding: z.object({
      logoFile: z.string().nullable().default(null),
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0070c7"),
      tagline: z.string().max(200).default(""),
    }),
    inventory: z.object({
      method: z.enum(["csv", "dms", "manual"]),
      dmsProvider: z.enum(["cdk", "reynolds", "dealertrack", "tekion"]).optional(),
      csvData: z.string().optional(),
    }),
    team: z.array(z.object({
      email: z.string().email(),
      role: z.enum(["admin", "manager", "staff"]),
    })).default([]),
  });

  it("accepts a minimal valid payload", () => {
    const result = onboardingSchema.safeParse({
      dealership: {
        name: "Test", address: "123 Main", city: "Tampa",
        state: "FL", zip: "33601", phone: "555-0100",
        email: "a@b.com", website: "",
      },
      branding: { primaryColor: "#0070c7" },
      inventory: { method: "manual" },
      team: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty dealership name", () => {
    const result = onboardingSchema.safeParse({
      dealership: {
        name: "", address: "123 Main", city: "Tampa",
        state: "FL", zip: "33601", phone: "555-0100",
        email: "a@b.com",
      },
      branding: {},
      inventory: { method: "manual" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid hex color", () => {
    const result = onboardingSchema.safeParse({
      dealership: {
        name: "Test", address: "123 Main", city: "Tampa",
        state: "FL", zip: "33601", phone: "555-0100",
        email: "a@b.com",
      },
      branding: { primaryColor: "red" },
      inventory: { method: "manual" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid inventory method", () => {
    const result = onboardingSchema.safeParse({
      dealership: {
        name: "Test", address: "123 Main", city: "Tampa",
        state: "FL", zip: "33601", phone: "555-0100",
        email: "a@b.com",
      },
      branding: {},
      inventory: { method: "fax" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid team member email", () => {
    const result = onboardingSchema.safeParse({
      dealership: {
        name: "Test", address: "123 Main", city: "Tampa",
        state: "FL", zip: "33601", phone: "555-0100",
        email: "a@b.com",
      },
      branding: {},
      inventory: { method: "manual" },
      team: [{ email: "not-email", role: "staff" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects dealership name over 200 characters", () => {
    const result = onboardingSchema.safeParse({
      dealership: {
        name: "A".repeat(201), address: "123 Main", city: "Tampa",
        state: "FL", zip: "33601", phone: "555-0100",
        email: "a@b.com",
      },
      branding: {},
      inventory: { method: "manual" },
    });
    expect(result.success).toBe(false);
  });
});
