#!/usr/bin/env npx ts-node
/**
 * Dealer Provisioning Script
 *
 * Usage:
 *   npx ts-node scripts/provision_dealer.ts \
 *     --name "Summit Auto Group" \
 *     --slug "summit-auto" \
 *     --email "admin@summitauto.com" \
 *     --phone "(303) 555-0100" \
 *     --city "Denver" \
 *     --state "CO"
 *
 * Options:
 *   --name            Dealer display name (required)
 *   --slug            URL slug, e.g. summit-auto (required, must be unique)
 *   --email           Primary contact email (required)
 *   --phone           Phone number (required)
 *   --city            City (required)
 *   --state           State abbreviation (required)
 *   --zip             ZIP code (optional, default: "80201")
 *   --address         Street address (optional)
 *   --tagline         Marketing tagline (optional)
 *   --primary-color   Hex color e.g. #0c3c6b (optional, default: "#0070c7")
 *   --dry-run         Print SQL without executing
 *
 * Output:
 *   - Inserts dealer record into DB
 *   - Prints dealer ID, subdomain, and next steps
 *   - On --dry-run, prints SQL only
 */

import { randomUUID } from "crypto";
import { Pool } from "pg";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  name: string;
  slug: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  zip: string;
  address: string;
  tagline: string;
  primaryColor: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2); // strip node + script path
  const map: Record<string, string> = {};
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = args[i + 1];
      if (!value || value.startsWith("--")) {
        console.error(`ERROR: Missing value for flag --${key}`);
        process.exit(1);
      }
      map[key] = value;
      i++; // consume value
    }
  }

  return {
    name: map["name"] ?? "",
    slug: map["slug"] ?? "",
    email: map["email"] ?? "",
    phone: map["phone"] ?? "",
    city: map["city"] ?? "",
    state: map["state"] ?? "",
    zip: map["zip"] ?? "80201",
    address: map["address"] ?? "",
    tagline: map["tagline"] ?? "Find Your Perfect Vehicle",
    primaryColor: map["primary-color"] ?? "#0070c7",
    dryRun,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(args: CliArgs): void {
  const required: Array<keyof CliArgs> = [
    "name",
    "slug",
    "email",
    "phone",
    "city",
    "state",
  ];
  const missing = required.filter((k) => !args[k]);
  if (missing.length > 0) {
    console.error(`ERROR: Missing required arguments: ${missing.map((k) => `--${k}`).join(", ")}`);
    console.error("");
    console.error("Usage:");
    console.error(
      '  npx ts-node scripts/provision_dealer.ts \\'
    );
    console.error('    --name "Summit Auto Group" \\');
    console.error('    --slug "summit-auto" \\');
    console.error('    --email "admin@summitauto.com" \\');
    console.error('    --phone "(303) 555-0100" \\');
    console.error('    --city "Denver" \\');
    console.error('    --state "CO"');
    process.exit(1);
  }

  // Slug must be lowercase alphanumeric + hyphens only
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(args.slug)) {
    console.error(
      `ERROR: --slug must be lowercase alphanumeric with hyphens only (e.g. "summit-auto"). Got: "${args.slug}"`
    );
    process.exit(1);
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.email)) {
    console.error(`ERROR: --email does not look valid: "${args.email}"`);
    process.exit(1);
  }

  // State must be 2-letter abbreviation
  if (!/^[A-Z]{2}$/.test(args.state.toUpperCase())) {
    console.error(
      `ERROR: --state must be a 2-letter abbreviation (e.g. CO, CA, TX). Got: "${args.state}"`
    );
    process.exit(1);
  }

  // Hex color validation
  if (!/^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/.test(args.primaryColor)) {
    console.error(
      `ERROR: --primary-color must be a hex color (e.g. #0c3c6b). Got: "${args.primaryColor}"`
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// SQL builder
// ---------------------------------------------------------------------------

interface DealerRecord {
  id: string;
  name: string;
  slug: string;
  subdomain: string;
  phone: string;
  email: string;
  address: object;
  branding: object;
  has_service_center: boolean;
  has_financing: boolean;
  has_trade_in: boolean;
}

function buildRecord(args: CliArgs): DealerRecord {
  return {
    id: randomUUID(),
    name: args.name,
    slug: args.slug,
    subdomain: args.slug,
    phone: args.phone,
    email: args.email,
    address: {
      street: args.address || "",
      city: args.city,
      state: args.state.toUpperCase(),
      zip: args.zip,
    },
    branding: {
      tagline: args.tagline,
      primary_color: args.primaryColor,
      secondary_color: "#0c8de9",
      accent_color: "#f97316",
      logo_url: null,
    },
    has_service_center: false,
    has_financing: true,
    has_trade_in: true,
  };
}

function buildInsertSql(record: DealerRecord): { sql: string; values: unknown[] } {
  const sql = `
INSERT INTO dealers (
  id,
  name,
  slug,
  subdomain,
  phone,
  email,
  address,
  branding,
  has_service_center,
  has_financing,
  has_trade_in,
  is_active,
  created_at,
  updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6,
  $7::jsonb, $8::jsonb,
  $9, $10, $11,
  true, now(), now()
)
RETURNING id, name, slug, subdomain, created_at;
`.trim();

  const values = [
    record.id,
    record.name,
    record.slug,
    record.subdomain,
    record.phone,
    record.email,
    JSON.stringify(record.address),
    JSON.stringify(record.branding),
    record.has_service_center,
    record.has_financing,
    record.has_trade_in,
  ];

  return { sql, values };
}

function formatSqlForDisplay(record: DealerRecord): string {
  const addr = JSON.stringify(record.address, null, 2)
    .split("\n")
    .join("\n        ");
  const branding = JSON.stringify(record.branding, null, 2)
    .split("\n")
    .join("\n        ");

  return `-- Dealer provisioning SQL (dry-run)
-- Generated: ${new Date().toISOString()}

INSERT INTO dealers (
  id,
  name,
  slug,
  subdomain,
  phone,
  email,
  address,
  branding,
  has_service_center,
  has_financing,
  has_trade_in,
  is_active,
  created_at,
  updated_at
) VALUES (
  '${record.id}',
  '${record.name.replace(/'/g, "''")}',
  '${record.slug}',
  '${record.subdomain}',
  '${record.phone.replace(/'/g, "''")}',
  '${record.email}',
  '${JSON.stringify(record.address)}'::jsonb,
  '${JSON.stringify(record.branding)}'::jsonb,
  false,
  true,
  true,
  true,
  now(),
  now()
);`;
}

// ---------------------------------------------------------------------------
// Next-steps printer
// ---------------------------------------------------------------------------

function printSuccess(record: DealerRecord): void {
  const subdomain = `${record.slug}.wolfpackauto.com`;

  console.log("");
  console.log("=".repeat(60));
  console.log("  Dealer Provisioned Successfully");
  console.log("=".repeat(60));
  console.log("");
  console.log(`  Name       : ${record.name}`);
  console.log(`  Dealer ID  : ${record.id}`);
  console.log(`  Slug       : ${record.slug}`);
  console.log(`  Subdomain  : ${subdomain}`);
  console.log("");
  console.log("-".repeat(60));
  console.log("  Next Steps");
  console.log("-".repeat(60));
  console.log("");
  console.log("  1. Configure subdomain in Vercel:");
  console.log(`       vercel domains add ${subdomain}`);
  console.log("");
  console.log("  2. Apply OEM migration (if franchise dealer):");
  console.log(`       DATABASE_URL=<url> ./scripts/migrate.sh`);
  console.log("");
  console.log("  3. Add initial inventory via DMS feed or CSV:");
  console.log(`       DEALER_ID=${record.id} npx ts-node scripts/index-vehicles.ts`);
  console.log("");
  console.log("  4. Upload dealer logo (Vercel Blob):");
  console.log(`       # Upload to: /dealers/${record.id}/logo.png`);
  console.log(`       # Then update: UPDATE dealers SET branding = branding || '{"logo_url":"<url>"}' WHERE id = '${record.id}';`);
  console.log("");
  console.log("  5. (Optional) Configure custom domain:");
  console.log(`       See docs/runbooks/dealer-provisioning.md — Step 5`);
  console.log("");
  console.log("  6. Verify the site loads:");
  console.log(`       curl -I https://${subdomain}/`);
  console.log("");
  console.log("=".repeat(60));
  console.log("");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  validate(args);

  const record = buildRecord(args);

  if (args.dryRun) {
    console.log("");
    console.log("DRY RUN — no database changes will be made.");
    console.log("");
    console.log(formatSqlForDisplay(record));
    console.log("");
    console.log(`Dealer ID would be: ${record.id}`);
    console.log(`Subdomain would be: ${record.slug}.wolfpackauto.com`);
    console.log("");
    process.exit(0);
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL environment variable must be set.");
    console.error(
      "  Export it before running, or use scripts/run_provision.sh which checks for you."
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { sql, values } = buildInsertSql(record);
    const result = await client.query(sql, values);

    if (result.rows.length === 0) {
      throw new Error("INSERT returned no rows — dealer was not created.");
    }

    await client.query("COMMIT");

    printSuccess(record);
  } catch (err: unknown) {
    await client.query("ROLLBACK").catch(() => {});

    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("unique") || message.includes("duplicate")) {
      if (message.includes("slug")) {
        console.error(`ERROR: A dealer with slug "${args.slug}" already exists.`);
        console.error("  Choose a different --slug value.");
      } else if (message.includes("subdomain")) {
        console.error(`ERROR: A dealer with subdomain "${args.slug}" already exists.`);
      } else {
        console.error(`ERROR: Unique constraint violation — ${message}`);
      }
    } else {
      console.error(`ERROR: Failed to provision dealer — ${message}`);
    }

    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
