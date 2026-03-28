#!/usr/bin/env npx tsx
/**
 * Cleanup Test Dealer
 *
 * Removes a test dealer and ALL associated data across every table.
 *
 * Usage:
 *   npx tsx scripts/cleanup-test-dealer.ts --dealer-slug apex-motors
 *   npx tsx scripts/cleanup-test-dealer.ts --dealer-id 00000000-0000-4000-b000-000000000099
 *
 * The script looks up the dealer, then deletes data in dependency order
 * to avoid FK violations.
 */

import { Client } from "pg";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Load .env.local if present
// ---------------------------------------------------------------------------

const envPath = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(): { dealerSlug: string | null; dealerId: string | null } {
  const args = process.argv.slice(2);
  let dealerSlug: string | null = null;
  let dealerId: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dealer-slug" && args[i + 1]) {
      dealerSlug = args[++i];
    } else if (args[i] === "--dealer-id" && args[i + 1]) {
      dealerId = args[++i];
    }
  }

  if (!dealerSlug && !dealerId) {
    console.error("ERROR: Provide --dealer-slug <slug> or --dealer-id <uuid>");
    console.error("");
    console.error("Usage:");
    console.error("  npx tsx scripts/cleanup-test-dealer.ts --dealer-slug apex-motors");
    console.error("  npx tsx scripts/cleanup-test-dealer.ts --dealer-id 00000000-0000-4000-b000-000000000099");
    process.exit(1);
  }

  return { dealerSlug, dealerId };
}

// ---------------------------------------------------------------------------
// Tables to clean (in deletion order — children before parents)
// ---------------------------------------------------------------------------

const DEALER_SCOPED_TABLES = [
  // Analytics (no FK, just dealer_id in metadata — use event filtering)
  // Webhook deliveries (FK to webhook_configs)
  "webhook_deliveries",
  "webhook_configs",
  // Comms
  "message_log",
  "follow_up_sequences",
  "message_templates",
  // Reviews
  "review_response_templates",
  "reviews",
  // Service
  "service_history",
  "repair_orders",
  "service_appointments",
  "parts_inventory",
  "technicians",
  // Deals
  "lender_submissions",
  "deal_worksheets",
  "fi_product_catalog",
  // Analytics & SEO
  "ab_tests",
  "seo_metrics",
  "page_views",
  // Leads & Vehicles
  "leads",
  "vehicles",
  // Dealer membership
  "dealer_group_members",
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function cleanup(): Promise<void> {
  const { dealerSlug, dealerId } = parseArgs();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL environment variable is required.");
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    // Resolve dealer
    let id: string;
    if (dealerId) {
      const result = await client.query("SELECT id, name, slug FROM dealers WHERE id = $1", [dealerId]);
      if (result.rows.length === 0) {
        console.error(`ERROR: No dealer found with id "${dealerId}".`);
        process.exit(1);
      }
      id = result.rows[0].id;
      console.log(`[cleanup] Found dealer: ${result.rows[0].name} (${result.rows[0].slug})`);
    } else {
      const result = await client.query("SELECT id, name, slug FROM dealers WHERE slug = $1", [dealerSlug]);
      if (result.rows.length === 0) {
        console.error(`ERROR: No dealer found with slug "${dealerSlug}".`);
        process.exit(1);
      }
      id = result.rows[0].id;
      console.log(`[cleanup] Found dealer: ${result.rows[0].name} (${id})`);
    }

    await client.query("BEGIN");

    // Delete analytics events (uses metadata, not FK)
    try {
      const aeResult = await client.query(
        `DELETE FROM analytics_events WHERE metadata->>'dealer_id' = $1 OR metadata->>'source' = 'seed-script'`,
        [id],
      );
      console.log(`  analytics_events: ${aeResult.rowCount} rows deleted`);
    } catch {
      // Table may not exist
      console.log("  analytics_events: table not found (skipped)");
    }

    // Delete from dealer-scoped tables
    for (const table of DEALER_SCOPED_TABLES) {
      try {
        // webhook_deliveries needs special handling (FK to webhook_configs, not dealer_id directly)
        if (table === "webhook_deliveries") {
          const result = await client.query(
            `DELETE FROM webhook_deliveries WHERE webhook_config_id IN (
              SELECT id FROM webhook_configs WHERE dealer_id = $1
            )`,
            [id],
          );
          console.log(`  ${table}: ${result.rowCount} rows deleted`);
          continue;
        }

        // lender_submissions needs special handling (FK to deal_worksheets)
        if (table === "lender_submissions") {
          const result = await client.query(
            `DELETE FROM lender_submissions WHERE deal_id IN (
              SELECT id FROM deal_worksheets WHERE dealer_id = $1
            )`,
            [id],
          );
          console.log(`  ${table}: ${result.rowCount} rows deleted`);
          continue;
        }

        const result = await client.query(
          `DELETE FROM ${table} WHERE dealer_id = $1`,
          [id],
        );
        console.log(`  ${table}: ${result.rowCount} rows deleted`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("does not exist") || msg.includes("relation")) {
          console.log(`  ${table}: table not found (skipped)`);
        } else {
          console.warn(`  ${table}: warning — ${msg}`);
        }
      }
    }

    // Delete dealer itself
    const dealerResult = await client.query("DELETE FROM dealers WHERE id = $1", [id]);
    console.log(`  dealers: ${dealerResult.rowCount} rows deleted`);

    await client.query("COMMIT");

    console.log("");
    console.log(`[cleanup] Dealer ${id} and all associated data deleted.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

cleanup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[cleanup] Error:", err);
    process.exit(1);
  });
