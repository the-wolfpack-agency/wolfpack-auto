#!/usr/bin/env tsx
/**
 * verify-rls.ts — Direct database-level RLS verification script.
 *
 * Usage:
 *   npx tsx scripts/verify-rls.ts
 *
 * Requires:
 *   DATABASE_URL environment variable pointing to a PostgreSQL instance
 *   with the Wolfpack Auto schema applied (src/db/schema.sql).
 *
 * What it does:
 *   1. Creates two test dealers (dealer_a, dealer_b) with deterministic UUIDs
 *   2. Inserts a vehicle and a lead for each dealer
 *   3. Verifies RLS isolation by querying as each dealer via SET LOCAL app.current_dealer_id
 *   4. Cross-queries to confirm dealer_a cannot see dealer_b's data (and vice-versa)
 *   5. Cleans up all test data
 *   6. Prints PASS/FAIL for each check with a final summary
 */

import { Pool, type PoolClient } from "pg";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEALER_A_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const DEALER_B_ID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";

const VIN_A = "RLSVERIFYA000001";
const VIN_B = "RLSVERIFYB000002";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function record(name: string, passed: boolean, detail = "") {
  results.push({ name, passed, detail });
  const icon = passed ? "PASS" : "FAIL";
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`  [${icon}] ${name}${suffix}`);
}

/**
 * Run a query as a specific dealer by setting the session variable
 * inside a transaction so RLS policies apply.
 */
async function queryAsDealer<T extends Record<string, unknown>>(
  client: PoolClient,
  dealerId: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await client.query("BEGIN");
  await client.query(`SET LOCAL app.current_dealer_id = '${dealerId}'`);
  const res = await client.query<T>(sql, params);
  await client.query("COMMIT");
  return res.rows;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      "ERROR: DATABASE_URL is not set. Cannot verify RLS without a database.\n" +
        "  export DATABASE_URL=postgres://user:pass@localhost:5432/wolfpack",
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  let client: PoolClient | null = null;

  try {
    client = await pool.connect();
    console.log("\n=== Wolfpack Auto — RLS Verification ===\n");

    // ------------------------------------------------------------------
    // Step 1: Seed test dealers
    // ------------------------------------------------------------------
    console.log("Setting up test dealers...");

    // Use superuser/owner connection (no RLS) for setup.
    // The dealers table does NOT have RLS, so direct inserts work.
    await client.query(
      `INSERT INTO dealers (id, name, slug, subdomain)
       VALUES ($1, 'RLS Test Dealer A', 'rls-test-a', 'rls-a')
       ON CONFLICT (id) DO NOTHING`,
      [DEALER_A_ID],
    );

    await client.query(
      `INSERT INTO dealers (id, name, slug, subdomain)
       VALUES ($1, 'RLS Test Dealer B', 'rls-test-b', 'rls-b')
       ON CONFLICT (id) DO NOTHING`,
      [DEALER_B_ID],
    );

    // ------------------------------------------------------------------
    // Step 2: Seed test vehicles (bypass RLS — table owner / superuser)
    // ------------------------------------------------------------------
    console.log("Inserting test vehicles...\n");

    // Clean up any prior test data first
    await client.query(`DELETE FROM vehicles WHERE vin IN ($1, $2)`, [
      VIN_A,
      VIN_B,
    ]);
    await client.query(
      `DELETE FROM leads WHERE email IN ('rls-a@test.local', 'rls-b@test.local')`,
    );

    await client.query(
      `INSERT INTO vehicles (dealer_id, vin, year, make, model, price, condition, mileage)
       VALUES ($1, $2, 2024, 'TestMake', 'ModelA', 30000, 'used', 5000)`,
      [DEALER_A_ID, VIN_A],
    );

    await client.query(
      `INSERT INTO vehicles (dealer_id, vin, year, make, model, price, condition, mileage)
       VALUES ($1, $2, 2024, 'TestMake', 'ModelB', 35000, 'used', 8000)`,
      [DEALER_B_ID, VIN_B],
    );

    // ------------------------------------------------------------------
    // Step 3: Seed test leads
    // ------------------------------------------------------------------
    console.log("Inserting test leads...\n");

    await client.query(
      `INSERT INTO leads (dealer_id, first_name, last_name, email, vehicle_interest)
       VALUES ($1, 'Alice', 'TestA', 'rls-a@test.local', 'ModelA')`,
      [DEALER_A_ID],
    );

    await client.query(
      `INSERT INTO leads (dealer_id, first_name, last_name, email, vehicle_interest)
       VALUES ($1, 'Bob', 'TestB', 'rls-b@test.local', 'ModelB')`,
      [DEALER_B_ID],
    );

    // ------------------------------------------------------------------
    // Step 4: Verify RLS on vehicles
    // ------------------------------------------------------------------
    console.log("--- Vehicles RLS ---");

    // 4a. Dealer A should see only their vehicle
    const vehiclesAsA = await queryAsDealer<{ vin: string }>(
      client,
      DEALER_A_ID,
      "SELECT vin FROM vehicles WHERE vin IN ($1, $2)",
      [VIN_A, VIN_B],
    );
    record(
      "Dealer A sees own vehicle",
      vehiclesAsA.some((v) => v.vin === VIN_A),
      `found ${vehiclesAsA.length} vehicle(s)`,
    );
    record(
      "Dealer A does NOT see Dealer B vehicle",
      !vehiclesAsA.some((v) => v.vin === VIN_B),
      vehiclesAsA.map((v) => v.vin).join(", ") || "(none)",
    );

    // 4b. Dealer B should see only their vehicle
    const vehiclesAsB = await queryAsDealer<{ vin: string }>(
      client,
      DEALER_B_ID,
      "SELECT vin FROM vehicles WHERE vin IN ($1, $2)",
      [VIN_A, VIN_B],
    );
    record(
      "Dealer B sees own vehicle",
      vehiclesAsB.some((v) => v.vin === VIN_B),
      `found ${vehiclesAsB.length} vehicle(s)`,
    );
    record(
      "Dealer B does NOT see Dealer A vehicle",
      !vehiclesAsB.some((v) => v.vin === VIN_A),
      vehiclesAsB.map((v) => v.vin).join(", ") || "(none)",
    );

    // ------------------------------------------------------------------
    // Step 5: Verify RLS on leads
    // ------------------------------------------------------------------
    console.log("\n--- Leads RLS ---");

    const leadsAsA = await queryAsDealer<{ email: string }>(
      client,
      DEALER_A_ID,
      "SELECT email FROM leads WHERE email IN ('rls-a@test.local', 'rls-b@test.local')",
    );
    record(
      "Dealer A sees own lead",
      leadsAsA.some((l) => l.email === "rls-a@test.local"),
      `found ${leadsAsA.length} lead(s)`,
    );
    record(
      "Dealer A does NOT see Dealer B lead",
      !leadsAsA.some((l) => l.email === "rls-b@test.local"),
      leadsAsA.map((l) => l.email).join(", ") || "(none)",
    );

    const leadsAsB = await queryAsDealer<{ email: string }>(
      client,
      DEALER_B_ID,
      "SELECT email FROM leads WHERE email IN ('rls-a@test.local', 'rls-b@test.local')",
    );
    record(
      "Dealer B sees own lead",
      leadsAsB.some((l) => l.email === "rls-b@test.local"),
      `found ${leadsAsB.length} lead(s)`,
    );
    record(
      "Dealer B does NOT see Dealer A lead",
      !leadsAsB.some((l) => l.email === "rls-a@test.local"),
      leadsAsB.map((l) => l.email).join(", ") || "(none)",
    );

    // ------------------------------------------------------------------
    // Step 6: Verify RLS on page_views
    // ------------------------------------------------------------------
    console.log("\n--- Page Views RLS ---");

    // Insert test page views
    await client.query(
      `INSERT INTO page_views (dealer_id, page_path, session_id)
       VALUES ($1, '/rls-test-a', 'sess-a')`,
      [DEALER_A_ID],
    );
    await client.query(
      `INSERT INTO page_views (dealer_id, page_path, session_id)
       VALUES ($1, '/rls-test-b', 'sess-b')`,
      [DEALER_B_ID],
    );

    const pvAsA = await queryAsDealer<{ page_path: string }>(
      client,
      DEALER_A_ID,
      "SELECT page_path FROM page_views WHERE page_path IN ('/rls-test-a', '/rls-test-b')",
    );
    record(
      "Dealer A sees own page_views",
      pvAsA.some((p) => p.page_path === "/rls-test-a"),
      `found ${pvAsA.length} row(s)`,
    );
    record(
      "Dealer A does NOT see Dealer B page_views",
      !pvAsA.some((p) => p.page_path === "/rls-test-b"),
    );

    // ------------------------------------------------------------------
    // Step 7: Verify RLS on seo_metrics
    // ------------------------------------------------------------------
    console.log("\n--- SEO Metrics RLS ---");

    await client.query(
      `INSERT INTO seo_metrics (dealer_id, page_path, title_tag)
       VALUES ($1, '/seo-rls-a', 'Dealer A SEO')
       ON CONFLICT (dealer_id, page_path) DO NOTHING`,
      [DEALER_A_ID],
    );
    await client.query(
      `INSERT INTO seo_metrics (dealer_id, page_path, title_tag)
       VALUES ($1, '/seo-rls-b', 'Dealer B SEO')
       ON CONFLICT (dealer_id, page_path) DO NOTHING`,
      [DEALER_B_ID],
    );

    const seoAsA = await queryAsDealer<{ page_path: string }>(
      client,
      DEALER_A_ID,
      "SELECT page_path FROM seo_metrics WHERE page_path IN ('/seo-rls-a', '/seo-rls-b')",
    );
    record(
      "Dealer A sees own seo_metrics",
      seoAsA.some((s) => s.page_path === "/seo-rls-a"),
      `found ${seoAsA.length} row(s)`,
    );
    record(
      "Dealer A does NOT see Dealer B seo_metrics",
      !seoAsA.some((s) => s.page_path === "/seo-rls-b"),
    );

    // ------------------------------------------------------------------
    // Step 8: Verify RLS on ab_tests
    // ------------------------------------------------------------------
    console.log("\n--- A/B Tests RLS ---");

    await client.query(
      `INSERT INTO ab_tests (dealer_id, test_name, variant_a, variant_b)
       VALUES ($1, 'rls-test-a', 'control', 'variant')`,
      [DEALER_A_ID],
    );
    await client.query(
      `INSERT INTO ab_tests (dealer_id, test_name, variant_a, variant_b)
       VALUES ($1, 'rls-test-b', 'control', 'variant')`,
      [DEALER_B_ID],
    );

    const abAsA = await queryAsDealer<{ test_name: string }>(
      client,
      DEALER_A_ID,
      "SELECT test_name FROM ab_tests WHERE test_name IN ('rls-test-a', 'rls-test-b')",
    );
    record(
      "Dealer A sees own ab_tests",
      abAsA.some((a) => a.test_name === "rls-test-a"),
      `found ${abAsA.length} row(s)`,
    );
    record(
      "Dealer A does NOT see Dealer B ab_tests",
      !abAsA.some((a) => a.test_name === "rls-test-b"),
    );

    // ------------------------------------------------------------------
    // Step 9: Verify INSERT isolation (dealer A cannot insert as dealer B)
    // ------------------------------------------------------------------
    console.log("\n--- INSERT Isolation ---");

    let insertBlocked = false;
    try {
      await client.query("BEGIN");
      await client.query(
        `SET LOCAL app.current_dealer_id = '${DEALER_A_ID}'`,
      );
      // Try to insert a vehicle with dealer_B's ID while session is dealer_A
      await client.query(
        `INSERT INTO vehicles (dealer_id, vin, year, make, model, price, condition, mileage)
         VALUES ($1, 'RLSCROSSINSERT01', 2024, 'Cross', 'Insert', 1, 'used', 0)`,
        [DEALER_B_ID],
      );
      await client.query("COMMIT");
    } catch (err: unknown) {
      insertBlocked = true;
      await client.query("ROLLBACK");
    }
    record(
      "RLS blocks cross-dealer INSERT on vehicles",
      insertBlocked,
      insertBlocked
        ? "INSERT correctly rejected"
        : "WARNING: INSERT was allowed (policy may use permissive mode)",
    );

    // ------------------------------------------------------------------
    // Cleanup
    // ------------------------------------------------------------------
    console.log("\nCleaning up test data...");

    await client.query(`DELETE FROM ab_tests WHERE test_name IN ('rls-test-a', 'rls-test-b')`);
    await client.query(`DELETE FROM seo_metrics WHERE page_path IN ('/seo-rls-a', '/seo-rls-b')`);
    await client.query(`DELETE FROM page_views WHERE session_id IN ('sess-a', 'sess-b')`);
    await client.query(
      `DELETE FROM leads WHERE email IN ('rls-a@test.local', 'rls-b@test.local')`,
    );
    await client.query(`DELETE FROM vehicles WHERE vin IN ($1, $2, 'RLSCROSSINSERT01')`, [
      VIN_A,
      VIN_B,
    ]);
    await client.query(
      `DELETE FROM dealers WHERE id IN ($1, $2)`,
      [DEALER_A_ID, DEALER_B_ID],
    );

    // ------------------------------------------------------------------
    // Summary
    // ------------------------------------------------------------------
    console.log("\n=== Summary ===\n");

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const total = results.length;

    console.log(`  ${passed}/${total} checks passed`);
    if (failed > 0) {
      console.log(`  ${failed} FAILED:`);
      for (const r of results.filter((r) => !r.passed)) {
        console.log(`    - ${r.name}: ${r.detail}`);
      }
    }

    console.log("");
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error("\nFATAL:", err);
    process.exit(2);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main();
