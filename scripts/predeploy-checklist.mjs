#!/usr/bin/env node
/**
 * Pre-Deploy Production Readiness Checklist
 *
 * Run against the live deployment to verify everything is configured correctly
 * before onboarding the first real dealer.
 *
 * Usage:
 *   node scripts/predeploy-checklist.mjs                          # check local .env.local + DB
 *   node scripts/predeploy-checklist.mjs --url https://yourdomain.com  # check live deployment
 *   node scripts/predeploy-checklist.mjs --fix                    # auto-fix what's possible
 *
 * Exit codes:
 *   0 = all green
 *   1 = blockers found
 *   2 = warnings only
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const BASE_URL = args.find((a) => a.startsWith("--url="))?.split("=")[1]
  ?? args[args.indexOf("--url") + 1]
  ?? null;
const FIX_MODE = args.includes("--fix");

// Load .env.local for DB checks
const envPath = resolve(__dirname, "../.env.local");
let envVars = {};
try {
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)="?(.+?)"?\s*$/);
    if (match) envVars[match[1]] = match[2];
  }
} catch { /* no .env.local */ }

const DATABASE_URL = envVars.DATABASE_URL ?? process.env.DATABASE_URL;

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

const results = [];
let blockers = 0;
let warnings = 0;

function pass(category, check) {
  results.push({ status: "PASS", category, check });
}
function fail(category, check, fix) {
  results.push({ status: "FAIL", category, check, fix });
  blockers++;
}
function warn(category, check, fix) {
  results.push({ status: "WARN", category, check, fix });
  warnings++;
}
function skip(category, check, reason) {
  results.push({ status: "SKIP", category, check, fix: reason });
}

// ---------------------------------------------------------------------------
// Checks: Environment Variables
// ---------------------------------------------------------------------------

async function checkEnvVars() {
  const category = "Environment";

  // Check via Vercel CLI if available
  let vercelEnv = {};
  try {
    const { execSync } = await import("child_process");
    const output = execSync("npx vercel env ls 2>/dev/null", { encoding: "utf-8", timeout: 15000 });
    for (const line of output.split("\n")) {
      const match = line.match(/^\s+(\S+)\s+Encrypted\s+.*Production/);
      if (match) vercelEnv[match[1]] = true;
    }
  } catch { /* vercel CLI not available */ }

  const hasVercel = Object.keys(vercelEnv).length > 0;

  const required = [
    { key: "DATABASE_URL", desc: "PostgreSQL connection" },
    { key: "NEXTAUTH_SECRET", desc: "Auth session encryption" },
    { key: "PII_ENCRYPTION_KEY", desc: "PII field encryption (AES-256-GCM)" },
    { key: "RESEND_API_KEY", desc: "Email delivery" },
    { key: "RESEND_FROM_EMAIL", desc: "Email sender address" },
  ];

  for (const { key, desc } of required) {
    if (hasVercel) {
      if (vercelEnv[key]) pass(category, `${key} set on Vercel Production`);
      else fail(category, `${key} missing on Vercel Production`, `Run: vercel env add ${key}`);
    } else if (envVars[key] || process.env[key]) {
      pass(category, `${key} set locally`);
    } else {
      fail(category, `${key} not set`, `Add to .env.local or Vercel`);
    }
  }

  // DEMO_MODE should NOT be on production
  if (hasVercel && vercelEnv["DEMO_MODE"]) {
    fail(category, "DEMO_MODE is set on Production — bypasses auth!", "Remove from Vercel Production env vars");
  } else if (hasVercel) {
    pass(category, "DEMO_MODE not set on Production");
  }

  // NEXT_PUBLIC_APP_URL should be set for invite/reset emails
  if (hasVercel && !vercelEnv["NEXT_PUBLIC_APP_URL"]) {
    warn(category, "NEXT_PUBLIC_APP_URL not set — invite/reset emails will use VERCEL_URL fallback", "Set to your custom domain");
  } else if (hasVercel) {
    pass(category, "NEXT_PUBLIC_APP_URL set");
  }
}

// ---------------------------------------------------------------------------
// Checks: Database
// ---------------------------------------------------------------------------

async function checkDatabase() {
  const category = "Database";

  if (!DATABASE_URL) {
    fail(category, "DATABASE_URL not available — cannot check DB");
    return;
  }

  let pool;
  try {
    const pg = await import("pg");
    pool = new pg.default.Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
      statement_timeout: 15000,
    });

    // Connection test
    const conn = await pool.query("SELECT NOW() AS now");
    pass(category, "DB connection successful");

    // Table count
    const tables = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM information_schema.tables WHERE table_schema = 'public'"
    );
    const tableCount = tables.rows[0].cnt;
    if (tableCount >= 50) pass(category, `${tableCount} tables (expected ≥50)`);
    else warn(category, `Only ${tableCount} tables (expected ≥50) — some migrations may be missing`);

    // Migration checks
    const migrationChecks = [
      { label: "036: soft delete columns", query: "SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='deleted_at'" },
      { label: "037: dealers.logo_url", query: "SELECT 1 FROM information_schema.columns WHERE table_name='dealers' AND column_name='logo_url'" },
      { label: "038: dealers.font_family", query: "SELECT 1 FROM information_schema.columns WHERE table_name='dealers' AND column_name='font_family'" },
      { label: "039: dealer_users.invite_token", query: "SELECT 1 FROM information_schema.columns WHERE table_name='dealer_users' AND column_name='invite_token'" },
      { label: "040: dealer_users.reset_token", query: "SELECT 1 FROM information_schema.columns WHERE table_name='dealer_users' AND column_name='reset_token'" },
      { label: "041: agency_api_keys table", query: "SELECT 1 FROM information_schema.tables WHERE table_name='agency_api_keys' AND table_schema='public'" },
    ];

    for (const check of migrationChecks) {
      const r = await pool.query(check.query);
      if (r.rows.length > 0) pass(category, `Migration ${check.label}`);
      else fail(category, `Migration ${check.label} NOT applied`, `Run: node scripts/run-migration.mjs ${check.label.split(":")[0]}`);
    }

    // Dealer exists and is active
    const dealers = await pool.query("SELECT name, slug, is_active FROM dealers");
    if (dealers.rows.length > 0) {
      pass(category, `${dealers.rows.length} dealer(s) in DB`);
      const inactive = dealers.rows.filter((d) => !d.is_active);
      if (inactive.length > 0) {
        warn(category, `${inactive.length} inactive dealer(s): ${inactive.map((d) => d.slug).join(", ")}`);
      }
    } else {
      fail(category, "No dealers in DB", "Run: node scripts/seed-prod-admin.mjs --dealer wolfpack-motors ...");
    }

    // Admin user exists
    const admins = await pool.query(
      "SELECT name, email, role, is_active FROM dealer_users WHERE role IN ('admin', 'owner') AND is_active = true"
    );
    if (admins.rows.length > 0) {
      pass(category, `${admins.rows.length} active admin(s): ${admins.rows.map((u) => u.email).join(", ")}`);
    } else {
      fail(category, "No active admin users", "Run: node scripts/seed-prod-admin.mjs --email ... --name ... --dealer ...");
    }

    // Test data cleanup
    const testUsers = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM dealer_users WHERE email LIKE '%@example.com'"
    );
    if (testUsers.rows[0].cnt > 0) {
      warn(category, `${testUsers.rows[0].cnt} test users (@example.com) in DB`, "Run: node scripts/seed-prod-admin.mjs --cleanup-test");
    } else {
      pass(category, "No test users in DB");
    }

    const testDealers = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM dealers WHERE slug LIKE 'fresh-test%' OR name LIKE '%Test Motors%'"
    );
    if (testDealers.rows[0].cnt > 0) {
      warn(category, `${testDealers.rows[0].cnt} test dealer(s) in DB`);
    } else {
      pass(category, "No test dealers in DB");
    }

    // Vehicle inventory
    const vehicles = await pool.query("SELECT COUNT(*)::int AS cnt FROM vehicles");
    if (vehicles.rows[0].cnt > 0) {
      pass(category, `${vehicles.rows[0].cnt} vehicles in inventory`);
    } else {
      warn(category, "0 vehicles — import inventory via Quick Add or bulk upload");
    }

    // PII encryption check
    const leads = await pool.query("SELECT email FROM leads LIMIT 5");
    const hasPlaintext = leads.rows.some((l) => l.email && l.email.includes("@") && !l.email.startsWith("enc:"));
    if (leads.rows.length === 0) {
      skip(category, "PII encryption", "No leads to check");
    } else if (hasPlaintext) {
      warn(category, "Lead emails stored in plaintext — PII_ENCRYPTION_KEY may not have been set when leads were created", "New leads will be encrypted if PII_ENCRYPTION_KEY is set");
    } else {
      pass(category, "Lead PII appears encrypted");
    }

  } catch (err) {
    fail(category, `DB check failed: ${err.message}`);
  } finally {
    if (pool) await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Checks: Live deployment
// ---------------------------------------------------------------------------

async function checkLiveDeployment() {
  const category = "Live Deployment";

  if (!BASE_URL) {
    skip(category, "Live checks", "Pass --url https://yourdomain.com to check live deployment");
    return;
  }

  // Health endpoint
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(10000) });
    if (res.ok) pass(category, "GET /api/health returns 200");
    else fail(category, `GET /api/health returned ${res.status}`);
  } catch (err) {
    fail(category, `GET /api/health failed: ${err.message}`);
  }

  // Deep health
  try {
    const res = await fetch(`${BASE_URL}/api/health/deep`, { signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const data = await res.json();
      if (data.shadowActive) {
        fail(category, "Deep health reports shadowActive=true — DB not connected or DEMO_MODE on");
      } else {
        pass(category, "Deep health: DB connected, not in shadow mode");
      }
      if (data.probes) {
        for (const [name, probe] of Object.entries(data.probes)) {
          if (probe.status === "pass" || probe.status === "ok") {
            pass(category, `Probe: ${name}`);
          } else if (probe.status === "skip") {
            skip(category, `Probe: ${name}`, probe.detail ?? "skipped");
          } else {
            fail(category, `Probe ${name}: ${probe.status} — ${probe.detail ?? ""}`);
          }
        }
      }
    } else {
      fail(category, `GET /api/health/deep returned ${res.status}`);
    }
  } catch (err) {
    fail(category, `GET /api/health/deep failed: ${err.message}`);
  }

  // Cookie consent (public page)
  try {
    const res = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const html = await res.text();
      if (html.includes("cookie_consent") || html.includes("cookie-consent")) {
        pass(category, "Cookie consent component present in HTML");
      } else {
        warn(category, "Cookie consent component not found in initial HTML (may be client-rendered)");
      }
    }
  } catch { /* non-critical */ }

  // API endpoints smoke test
  const endpoints = [
    { method: "GET", path: "/api/inventory" },
    { method: "GET", path: "/api/auth/session" },
    { method: "GET", path: "/api/admin/stats" },
    { method: "GET", path: "/api/admin/leads" },
    { method: "GET", path: "/api/admin/inventory" },
    { method: "GET", path: "/api/admin/dealers" },
    { method: "GET", path: "/api/admin/dealer-users" },
    { method: "GET", path: "/api/agency/overview" },
    { method: "GET", path: "/api/cron/process-sequences" },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${BASE_URL}${ep.path}`, { signal: AbortSignal.timeout(10000) });
      if (res.status === 500) {
        fail(category, `${ep.method} ${ep.path} returns 500`);
      } else {
        pass(category, `${ep.method} ${ep.path} returns ${res.status}`);
      }
    } catch (err) {
      fail(category, `${ep.method} ${ep.path} failed: ${err.message}`);
    }
  }

  // Pages smoke test
  const pages = ["/", "/inventory", "/contact", "/admin/login"];
  for (const page of pages) {
    try {
      const res = await fetch(`${BASE_URL}${page}`, { signal: AbortSignal.timeout(10000) });
      if (res.status === 500) {
        fail(category, `Page ${page} returns 500`);
      } else {
        pass(category, `Page ${page} returns ${res.status}`);
      }
    } catch (err) {
      fail(category, `Page ${page} failed: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Checks: Code quality
// ---------------------------------------------------------------------------

async function checkCodeQuality() {
  const category = "Code Quality";

  // Check for "default" dealer ID fallbacks (should be UUID)
  const { execSync } = await import("child_process");
  try {
    const grepOut = execSync(
      'grep -rn "DEALER_ID.*\\"default\\"" src/ --include="*.ts" --include="*.tsx" 2>/dev/null || true',
      { encoding: "utf-8", cwd: resolve(__dirname, "..") }
    );
    if (grepOut.trim()) {
      fail(category, `Files still using DEALER_ID ?? "default":\n${grepOut.trim()}`, "Change to UUID fallback");
    } else {
      pass(category, 'No files using DEALER_ID ?? "default" (all use UUID fallback)');
    }
  } catch { /* grep not available */ }

  // Check for generic DMS provider names
  try {
    const grepOut = execSync(
      'grep -rn "DMS Provider [A-D]" src/ --include="*.ts" --include="*.tsx" 2>/dev/null || true',
      { encoding: "utf-8", cwd: resolve(__dirname, "..") }
    );
    if (grepOut.trim()) {
      fail(category, "Generic DMS provider names found", "Replace with real names (CDK Global, etc.)");
    } else {
      pass(category, "DMS providers use real names");
    }
  } catch { /* */ }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printReport() {
  console.log("\n" + "=".repeat(70));
  console.log("  WOLFPACK AUTO — PRE-PRODUCTION READINESS CHECKLIST");
  console.log("=".repeat(70) + "\n");

  const categories = [...new Set(results.map((r) => r.category))];

  for (const cat of categories) {
    console.log(`\n  ${cat}`);
    console.log("  " + "-".repeat(50));

    const catResults = results.filter((r) => r.category === cat);
    for (const r of catResults) {
      const icon = r.status === "PASS" ? "✓" : r.status === "FAIL" ? "✗" : r.status === "WARN" ? "⚠" : "○";
      const color = r.status === "PASS" ? "\x1b[32m" : r.status === "FAIL" ? "\x1b[31m" : r.status === "WARN" ? "\x1b[33m" : "\x1b[90m";
      const reset = "\x1b[0m";
      console.log(`  ${color}${icon}${reset}  ${r.check}`);
      if (r.fix && r.status !== "PASS") {
        console.log(`     ${color}→ ${r.fix}${reset}`);
      }
    }
  }

  console.log("\n" + "=".repeat(70));
  const passCount = results.filter((r) => r.status === "PASS").length;
  const total = results.length;
  console.log(`  PASS: ${passCount}/${total}   FAIL: ${blockers}   WARN: ${warnings}`);

  if (blockers === 0 && warnings === 0) {
    console.log("\x1b[32m  ✓ ALL GREEN — ready for production!\x1b[0m");
  } else if (blockers === 0) {
    console.log("\x1b[33m  ⚠ WARNINGS only — review before launch\x1b[0m");
  } else {
    console.log(`\x1b[31m  ✗ ${blockers} BLOCKER(S) — must fix before production\x1b[0m`);
  }
  console.log("=".repeat(70) + "\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("Running pre-production checklist...\n");

  await checkEnvVars();
  await checkDatabase();
  await checkLiveDeployment();
  await checkCodeQuality();

  printReport();

  process.exit(blockers > 0 ? 1 : warnings > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("Checklist failed:", err);
  process.exit(1);
});
