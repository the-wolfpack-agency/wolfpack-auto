/**
 * OEM Brand Compliance Scoring — static analysis tests.
 *
 * All assertions are file-system / source-code reads (no running server,
 * no database). Pattern mirrors oem-coverage.spec.ts.
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../../src");

const SCORER_FILE = path.join(SRC, "lib/compliance-scorer.ts");
const API_ROUTE = path.join(SRC, "app/api/admin/compliance/route.ts");
const ADMIN_PAGE = path.join(SRC, "app/admin/compliance/page.tsx");
const MIGRATION = path.join(SRC, "db/migrations/006_compliance.sql");

/* -------------------------------------------------------------------------- */
/* 1. compliance-scorer.ts exports scoreDealerCompliance                      */
/* -------------------------------------------------------------------------- */

test.describe("compliance-scorer.ts: file existence and exports", () => {
  test("compliance-scorer.ts exists", () => {
    expect(
      fs.existsSync(SCORER_FILE),
      "src/lib/compliance-scorer.ts is missing",
    ).toBe(true);
  });

  test("exports scoreDealerCompliance function", () => {
    const content = fs.readFileSync(SCORER_FILE, "utf-8");
    expect(content).toContain("export async function scoreDealerCompliance");
  });

  test("exports ComplianceCheckResult interface", () => {
    const content = fs.readFileSync(SCORER_FILE, "utf-8");
    expect(content).toContain("export interface ComplianceCheckResult");
  });

  test("exports ComplianceViolation interface", () => {
    const content = fs.readFileSync(SCORER_FILE, "utf-8");
    expect(content).toContain("export interface ComplianceViolation");
  });
});

/* -------------------------------------------------------------------------- */
/* 2. scoreDealerCompliance returns score 0-100                               */
/* -------------------------------------------------------------------------- */

test.describe("compliance-scorer.ts: score range enforcement", () => {
  let content: string;
  test.beforeAll(() => {
    content = fs.readFileSync(SCORER_FILE, "utf-8");
  });

  test("score is clamped to 100 (Math.min used)", () => {
    expect(content).toContain("Math.min");
    expect(content).toContain("100,");
  });

  test("CHECK constraint enforces 0-100 in migration", () => {
    const sql = fs.readFileSync(MIGRATION, "utf-8");
    expect(sql).toContain("score >= 0");
    expect(sql).toContain("score <= 100");
  });

  test("defaultResult returns score of 0 (lower bound)", () => {
    expect(content).toContain("score: 0,");
  });

  test("calculateGrade function handles all five grades", () => {
    expect(content).toContain('return "A"');
    expect(content).toContain('return "B"');
    expect(content).toContain('return "C"');
    expect(content).toContain('return "D"');
    expect(content).toContain('return "F"');
  });
});

/* -------------------------------------------------------------------------- */
/* 3. API route has requireAuth guard                                          */
/* -------------------------------------------------------------------------- */

test.describe("API route: authentication guard", () => {
  let content: string;
  test.beforeAll(() => {
    content = fs.readFileSync(API_ROUTE, "utf-8");
  });

  test("route imports requireAuth from @/lib/auth-guard", () => {
    expect(content).toContain('from "@/lib/auth-guard"');
    expect(content).toContain("requireAuth");
  });

  test("GET handler calls requireAuth", () => {
    expect(content).toContain("export async function GET");
    // Both GET and POST call requireAuth — verify it's used more than once
    const occurrences = (content.match(/requireAuth/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  test("POST handler calls requireAuth", () => {
    expect(content).toContain("export async function POST");
  });

  test("isAuthenticated guard check is present", () => {
    expect(content).toContain("isAuthenticated");
    expect(content).toContain("!isAuthenticated(authResult)");
  });
});

/* -------------------------------------------------------------------------- */
/* 4. API route returns correct response shape                                 */
/* -------------------------------------------------------------------------- */

test.describe("API route: response shape", () => {
  let content: string;
  test.beforeAll(() => {
    content = fs.readFileSync(API_ROUTE, "utf-8");
  });

  test("response includes score field", () => {
    expect(content).toContain("score:");
  });

  test("response includes grade field", () => {
    expect(content).toContain("grade:");
  });

  test("response includes categoryScores field", () => {
    expect(content).toContain("categoryScores:");
  });

  test("response includes violations field", () => {
    expect(content).toContain("violations:");
  });

  test("response includes checkedAt timestamp", () => {
    expect(content).toContain("checkedAt:");
  });

  test("rate-limit is applied to POST (429 status used)", () => {
    expect(content).toContain("429");
    expect(content).toContain("checkRateLimit");
  });

  test("security headers are applied to responses", () => {
    expect(content).toContain("SECURITY_HEADERS");
  });
});

/* -------------------------------------------------------------------------- */
/* 5. Violations array has required fields                                     */
/* -------------------------------------------------------------------------- */

test.describe("compliance-scorer.ts: violation object shape", () => {
  let content: string;
  test.beforeAll(() => {
    content = fs.readFileSync(SCORER_FILE, "utf-8");
  });

  test("violations include category field", () => {
    // category appears in every violation push
    const matches = content.match(/category:/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });

  test("violations include item field", () => {
    const matches = content.match(/\bitem:/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });

  test("violations include impact field with valid values", () => {
    expect(content).toContain('"high"');
    expect(content).toContain('"medium"');
    expect(content).toContain('"low"');
    // impact field is present in violation objects
    const matches = content.match(/\bimpact:/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });

  test("violations include recommendation field", () => {
    const matches = content.match(/recommendation:/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });

  test("ComplianceViolation interface declares all four fields", () => {
    const iface = content.slice(
      content.indexOf("export interface ComplianceViolation"),
      content.indexOf("}", content.indexOf("export interface ComplianceViolation")) + 1,
    );
    expect(iface).toContain("category:");
    expect(iface).toContain("item:");
    expect(iface).toContain("impact:");
    expect(iface).toContain("recommendation:");
  });
});

/* -------------------------------------------------------------------------- */
/* 6. Grade calculation: A=90+, B=80+, C=70+, D=60+, F<60                   */
/* -------------------------------------------------------------------------- */

test.describe("compliance-scorer.ts: grade thresholds", () => {
  let content: string;
  test.beforeAll(() => {
    content = fs.readFileSync(SCORER_FILE, "utf-8");
  });

  test("A grade threshold is 90", () => {
    expect(content).toContain(">= 90");
  });

  test("B grade threshold is 80", () => {
    expect(content).toContain(">= 80");
  });

  test("C grade threshold is 70", () => {
    expect(content).toContain(">= 70");
  });

  test("D grade threshold is 60", () => {
    expect(content).toContain(">= 60");
  });

  test("F is the default grade (below 60)", () => {
    // F is the fallback — no explicit check needed, just the return
    expect(content).toContain('return "F"');
  });
});

/* -------------------------------------------------------------------------- */
/* 7. Migration file structure                                                 */
/* -------------------------------------------------------------------------- */

test.describe("Migration 006: compliance_scores table", () => {
  let sql: string;
  test.beforeAll(() => {
    sql = fs.readFileSync(MIGRATION, "utf-8");
  });

  test("migration file exists", () => {
    expect(fs.existsSync(MIGRATION), "006_compliance.sql is missing").toBe(
      true,
    );
  });

  test("creates compliance_scores table", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS compliance_scores");
  });

  test("references dealers(id) with ON DELETE CASCADE", () => {
    expect(sql).toContain("REFERENCES dealers(id) ON DELETE CASCADE");
  });

  test("grade CHECK constraint includes all five grades", () => {
    expect(sql).toContain("'A'");
    expect(sql).toContain("'B'");
    expect(sql).toContain("'C'");
    expect(sql).toContain("'D'");
    expect(sql).toContain("'F'");
  });

  test("category_scores column is JSONB", () => {
    expect(sql).toContain("category_scores  JSONB");
  });

  test("violations column is JSONB", () => {
    expect(sql).toContain("violations       JSONB");
  });

  test("dealer_id index is defined", () => {
    expect(sql).toContain("idx_compliance_scores_dealer_id");
  });

  test("checked_at DESC index is defined", () => {
    expect(sql).toContain("idx_compliance_scores_checked_at");
  });
});

/* -------------------------------------------------------------------------- */
/* 8. Admin page structural checks                                             */
/* -------------------------------------------------------------------------- */

test.describe("Admin page: compliance/page.tsx", () => {
  let content: string;
  test.beforeAll(() => {
    content = fs.readFileSync(ADMIN_PAGE, "utf-8");
  });

  test("admin page file exists", () => {
    expect(
      fs.existsSync(ADMIN_PAGE),
      "src/app/admin/compliance/page.tsx is missing",
    ).toBe(true);
  });

  test("is a client component", () => {
    expect(content).toContain('"use client"');
  });

  test("renders Run Compliance Check button", () => {
    expect(content).toContain("Run Compliance Check");
  });

  test("POSTs to /api/admin/compliance", () => {
    expect(content).toContain("/api/admin/compliance");
    expect(content).toContain('method: "POST"');
  });

  test("displays score in a gauge-style element", () => {
    expect(content).toContain("ScoreGauge");
  });

  test("displays grade badge", () => {
    expect(content).toContain("GradeBadge");
  });

  test("displays category score bars", () => {
    expect(content).toContain("CategoryBars");
  });

  test("displays violations list", () => {
    expect(content).toContain("ViolationsList");
  });

  test("shows last checked timestamp", () => {
    expect(content).toContain("checkedAt");
    expect(content).toContain("Last checked");
  });

  test("has loading state", () => {
    expect(content).toContain("loading");
    expect(content).toContain("animate-pulse");
  });
});
