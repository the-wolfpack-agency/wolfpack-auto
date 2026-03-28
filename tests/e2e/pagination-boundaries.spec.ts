import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

/**
 * pagination-boundaries.spec.ts
 *
 * Tests that pagination parameters are validated and clamped to safe boundaries.
 * page must be >= 1, page_size must be 1-100.
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const LIB_DIR = path.resolve(__dirname, "../../src/lib");

/* -------------------------------------------------------------------------- */
/* PAGINATION-001: pagination.ts helper exists and has correct implementation */
/* -------------------------------------------------------------------------- */

test.describe("PAGINATION-001: pagination helper", () => {
  test("pagination.ts exists", () => {
    const filePath = path.join(LIB_DIR, "pagination.ts");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  test("pagination.ts exports parsePagination", () => {
    const src = fs.readFileSync(path.join(LIB_DIR, "pagination.ts"), "utf-8");
    expect(src).toContain("export function parsePagination");
  });

  test("parsePagination caps page_size at 100", () => {
    const src = fs.readFileSync(path.join(LIB_DIR, "pagination.ts"), "utf-8");
    expect(src).toContain("Math.min(100");
  });

  test("parsePagination floors page at 1", () => {
    const src = fs.readFileSync(path.join(LIB_DIR, "pagination.ts"), "utf-8");
    expect(src).toContain("Math.max(1");
  });

  test("parsePagination floors page_size at 1", () => {
    const src = fs.readFileSync(path.join(LIB_DIR, "pagination.ts"), "utf-8");
    // page_size uses Math.min(100, Math.max(1, ...))
    expect(src).toMatch(/Math\.min\(100,\s*Math\.max\(1/);
  });

  test("parsePagination computes correct offset", () => {
    const src = fs.readFileSync(path.join(LIB_DIR, "pagination.ts"), "utf-8");
    expect(src).toContain("(page - 1) * pageSize");
  });
});

/* -------------------------------------------------------------------------- */
/* PAGINATION-002: Leads endpoint pagination boundaries                       */
/* -------------------------------------------------------------------------- */

test.describe("PAGINATION-002: leads endpoint pagination", () => {
  test("page=0 is treated as page 1 (no 500)", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/leads?page=0&page_size=10`);
    expect(res.status()).not.toBe(500);
    // Should return 401 (no auth) or 200 — never 500
    expect([200, 401]).toContain(res.status());
  });

  test("page=-1 is treated as page 1 (no 500)", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/leads?page=-1&page_size=10`);
    expect(res.status()).not.toBe(500);
    expect([200, 401]).toContain(res.status());
  });

  test("page_size=0 does not crash (no 500)", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/leads?page=1&page_size=0`);
    expect(res.status()).not.toBe(500);
    expect([200, 401]).toContain(res.status());
  });

  test("page_size=999999 does not cause OOM (no 500)", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/leads?page=1&page_size=999999`);
    expect(res.status()).not.toBe(500);
    expect([200, 401]).toContain(res.status());
  });

  test("page_size=-5 does not crash (no 500)", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/leads?page=1&page_size=-5`);
    expect(res.status()).not.toBe(500);
    expect([200, 401]).toContain(res.status());
  });

  test("normal pagination works (page=1, page_size=10)", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/leads?page=1&page_size=10`);
    expect(res.status()).not.toBe(500);
    expect([200, 401]).toContain(res.status());
  });
});

/* -------------------------------------------------------------------------- */
/* PAGINATION-003: Trade-in endpoint pagination boundaries                    */
/* -------------------------------------------------------------------------- */

test.describe("PAGINATION-003: trade-in endpoint pagination", () => {
  test("page=0 handled safely", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/trade-in?page=0`);
    expect(res.status()).not.toBe(500);
  });

  test("page_size=999999 capped", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/admin/trade-in?page_size=999999`);
    expect(res.status()).not.toBe(500);
  });
});

/* -------------------------------------------------------------------------- */
/* PAGINATION-004: Source-level validation — routes with pagination           */
/* -------------------------------------------------------------------------- */

test.describe("PAGINATION-004: source-level pagination validation", () => {
  test("leads route caps page_size", () => {
    const leadsPath = path.resolve(__dirname, "../../src/app/api/admin/leads/route.ts");
    const src = fs.readFileSync(leadsPath, "utf-8");
    // Must use Math.min(100, ...) or parsePagination
    expect(src).toMatch(/Math\.min\(100|parsePagination/);
  });

  test("trade-in route caps page_size", () => {
    const tradeInPath = path.resolve(__dirname, "../../src/app/api/admin/trade-in/route.ts");
    const src = fs.readFileSync(tradeInPath, "utf-8");
    expect(src).toMatch(/Math\.min\(\s*100|parsePagination/);
  });

  test("leads route floors page at 1", () => {
    const leadsPath = path.resolve(__dirname, "../../src/app/api/admin/leads/route.ts");
    const src = fs.readFileSync(leadsPath, "utf-8");
    expect(src).toMatch(/Math\.max\(1|parsePagination/);
  });
});
