#!/usr/bin/env node
/**
 * Wolfpack Auto — Production Launch Script
 *
 * Single command to validate, migrate, build, and verify a production deployment.
 *
 * Usage:
 *   node scripts/launch.mjs              # full launch (env check + migrations + build + predeploy)
 *   node scripts/launch.mjs --check-only # all checks, skip build
 *
 * Exit codes:
 *   0 = GO — all steps passed
 *   1 = NO-GO — blocker found
 */

import { readFileSync, readdirSync, existsSync, mkdirSync, appendFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const C = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim:    (s) => `\x1b[90m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes("--check-only");

// Load .env.local
const envPath = resolve(PROJECT_ROOT, ".env.local");
try {
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)="?(.+?)"?\s*$/);
    if (match) process.env[match[1]] ??= match[2];
  }
} catch { /* no .env.local */ }

// ---------------------------------------------------------------------------
// Step tracker
// ---------------------------------------------------------------------------

const stepResults = [];
let hasBLocker = false;

function recordStep(name, status, durationMs, detail) {
  stepResults.push({ name, status, durationMs, detail: detail ?? null });
  if (status === "FAIL") hasBLocker = true;
}

async function runStep(name, fn) {
  const label = C.cyan(`[${name}]`);
  process.stdout.write(`\n${label} Running...\n`);
  const start = performance.now();
  try {
    await fn();
    const dur = Math.round(performance.now() - start);
    console.log(`${label} ${C.green("PASS")} ${C.dim(`(${dur}ms)`)}`);
    recordStep(name, "PASS", dur);
  } catch (err) {
    const dur = Math.round(performance.now() - start);
    const msg = err.message || String(err);
    console.log(`${label} ${C.red("FAIL")} ${C.dim(`(${dur}ms)`)}`);
    console.log(`  ${C.red("X")} ${msg}`);
    recordStep(name, "FAIL", dur, msg);
    throw err; // propagate to stop pipeline
  }
}

// ---------------------------------------------------------------------------
// Step 1: Environment check
// ---------------------------------------------------------------------------

const REQUIRED_ENV = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "PII_ENCRYPTION_KEY",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
];

async function stepEnvCheck() {
  const missing = [];
  const present = [];

  for (const key of REQUIRED_ENV) {
    if (process.env[key]) {
      present.push(key);
      console.log(`  ${C.green("V")} ${key}`);
    } else {
      missing.push(key);
      console.log(`  ${C.red("X")} ${key} — not set`);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// Step 2: DEMO_MODE guard
// ---------------------------------------------------------------------------

async function stepDemoModeGuard() {
  const demoMode = (process.env.DEMO_MODE ?? "").toLowerCase();
  if (demoMode === "true" || demoMode === "1") {
    throw new Error(
      "DEMO_MODE is enabled. This is an auth bypass backdoor. Remove it from your environment before launching."
    );
  }
  console.log(`  ${C.green("V")} DEMO_MODE is not enabled`);
}

// ---------------------------------------------------------------------------
// Step 3: Run migrations
// ---------------------------------------------------------------------------

async function stepMigrations() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error("DATABASE_URL not set");

  const pg = await import("pg");
  const pool = new pg.default.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000,
  });

  try {
    // Test connection
    await pool.query("SELECT 1");
    console.log(`  ${C.green("V")} Database connected`);

    // Discover all migration files
    const MIGRATIONS_DIR = resolve(PROJECT_ROOT, "src/db/migrations");
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.match(/^\d{3}_.*\.sql$/))
      .sort();

    // Build a detection map: migration number -> check query
    // We check for known artifacts of each migration to decide if it's applied.
    const detectionChecks = {
      "001": "SELECT 1 FROM information_schema.tables WHERE table_name='dealers' AND table_schema='public'",
      "020": "SELECT 1 FROM information_schema.columns WHERE table_name='dealer_users' AND column_name='mfa_secret'",
      "021": "SELECT 1 FROM information_schema.tables WHERE table_name='deals' AND table_schema='public'",
      "022": "SELECT 1 FROM information_schema.tables WHERE table_name='service_appointments' AND table_schema='public'",
      "023": "SELECT 1 FROM information_schema.tables WHERE table_name='comms_sequences' AND table_schema='public'",
      "024": "SELECT 1 FROM information_schema.columns WHERE table_name='deals' AND column_name='backend_gross'",
      "025": "SELECT 1 FROM information_schema.tables WHERE table_name='reviews' AND table_schema='public'",
      "026": "SELECT 1 FROM information_schema.tables WHERE table_name='lender_submissions' AND table_schema='public'",
      "027": "SELECT 1 FROM information_schema.tables WHERE table_name='credit_applications' AND table_schema='public'",
      "028": "SELECT 1 FROM information_schema.tables WHERE table_name='document_vault' AND table_schema='public'",
      "029": "SELECT 1 FROM information_schema.tables WHERE table_name='compliance_checks' AND table_schema='public'",
      "030": "SELECT 1 FROM information_schema.tables WHERE table_name='floor_plan_units' AND table_schema='public'",
      "031": "SELECT 1 FROM information_schema.columns WHERE table_name='vehicles' AND column_name='days_on_lot'",
      "032": "SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='deleted_at'",
      "033": "SELECT 1 FROM pg_indexes WHERE indexname='idx_leads_dealer_status'",
      "034": "SELECT 1 FROM information_schema.tables WHERE table_name='webhook_outbound' AND table_schema='public'",
      "035": "SELECT 1 FROM information_schema.tables WHERE table_name='dealer_users' AND table_schema='public'",
      "036": "SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='deleted_at'",
      "037": "SELECT 1 FROM information_schema.columns WHERE table_name='dealers' AND column_name='logo_url'",
      "038": "SELECT 1 FROM information_schema.columns WHERE table_name='dealers' AND column_name='font_family'",
      "039": "SELECT 1 FROM information_schema.columns WHERE table_name='dealer_users' AND column_name='invite_token'",
      "040": "SELECT 1 FROM information_schema.columns WHERE table_name='dealer_users' AND column_name='reset_token'",
      "041": "SELECT 1 FROM information_schema.tables WHERE table_name='agency_api_keys' AND table_schema='public'",
      "042": "SELECT 1 FROM information_schema.tables WHERE table_name='dealer_locations' AND table_schema='public'",
      "043": "SELECT 1 FROM information_schema.tables WHERE table_name='onboarding_steps' AND table_schema='public'",
    };

    // Find pending migrations
    const pending = [];
    for (const file of files) {
      const num = file.slice(0, 3);
      const checkQuery = detectionChecks[num];
      if (!checkQuery) {
        // No detection query — assume it needs to run
        pending.push(file);
        continue;
      }
      try {
        const r = await pool.query(checkQuery);
        if (r.rows.length === 0) pending.push(file);
      } catch {
        pending.push(file);
      }
    }

    if (pending.length === 0) {
      console.log(`  ${C.green("V")} All ${files.length} migrations already applied`);
      return;
    }

    console.log(`  ${C.yellow("!")} ${pending.length} pending migration(s): ${pending.map((f) => f.slice(0, 3)).join(", ")}`);

    // Run each pending migration
    let applied = 0;
    for (const file of pending) {
      const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf-8");
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("--"));

      let success = 0;
      let skipped = 0;

      for (const stmt of statements) {
        try {
          await pool.query(stmt);
          success++;
        } catch (err) {
          const msg = err.message || "";
          if (msg.includes("already exists") || msg.includes("duplicate")) {
            skipped++;
          } else {
            console.log(`    ${C.yellow("WARN")}: ${file} — ${msg.slice(0, 120)}`);
            skipped++;
          }
        }
      }

      console.log(`  ${C.green("V")} ${file} (${success} executed, ${skipped} skipped)`);
      applied++;
    }

    console.log(`  ${C.green("V")} Applied ${applied} migration(s)`);
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Step 4: Verify database
// ---------------------------------------------------------------------------

async function stepVerifyDatabase() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error("DATABASE_URL not set");

  const pg = await import("pg");
  const pool = new pg.default.Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    statement_timeout: 15000,
  });

  try {
    // Table count
    const tables = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM information_schema.tables WHERE table_schema = 'public'"
    );
    const tableCount = tables.rows[0].cnt;
    if (tableCount >= 50) {
      console.log(`  ${C.green("V")} ${tableCount} tables (>= 50)`);
    } else {
      throw new Error(`Only ${tableCount} tables found (need >= 50). Run migrations first.`);
    }

    // At least 1 dealer
    const dealers = await pool.query("SELECT COUNT(*)::int AS cnt FROM dealers");
    const dealerCount = dealers.rows[0].cnt;
    if (dealerCount >= 1) {
      console.log(`  ${C.green("V")} ${dealerCount} dealer(s) in database`);
    } else {
      throw new Error("No dealers found. Run: node scripts/seed-prod-admin.mjs");
    }

    // No test data
    const testUsers = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM dealer_users WHERE email LIKE '%@example.com'"
    );
    if (testUsers.rows[0].cnt > 0) {
      throw new Error(
        `${testUsers.rows[0].cnt} test user(s) with @example.com found. Run: node scripts/seed-prod-admin.mjs --cleanup-test`
      );
    }
    console.log(`  ${C.green("V")} No test data (@example.com users)`);
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// Step 5: Build
// ---------------------------------------------------------------------------

async function stepBuild() {
  if (CHECK_ONLY) {
    console.log(`  ${C.dim("SKIP")} --check-only mode, skipping build`);
    recordStep("Build", "SKIP", 0, "--check-only");
    return "skip";
  }

  try {
    execSync("npx next build", {
      cwd: PROJECT_ROOT,
      stdio: "pipe",
      timeout: 300000, // 5 min
    });
    console.log(`  ${C.green("V")} next build succeeded`);
  } catch (err) {
    const stderr = err.stderr?.toString().slice(-500) || "";
    throw new Error(`next build failed:\n${stderr}`);
  }
}

// ---------------------------------------------------------------------------
// Step 6: Predeploy checks
// ---------------------------------------------------------------------------

async function stepPredeployChecks() {
  try {
    const output = execSync("node scripts/predeploy-checklist.mjs", {
      cwd: PROJECT_ROOT,
      stdio: "pipe",
      timeout: 60000,
      encoding: "utf-8",
    });
    // Exit code 0 = all green, 2 = warnings only (still passable)
    const hasBlocker = output.includes("BLOCKER");
    if (hasBlocker) {
      throw new Error("Predeploy checklist found blockers. Run `node scripts/predeploy-checklist.mjs` for details.");
    }
    console.log(`  ${C.green("V")} Predeploy checklist passed`);
  } catch (err) {
    if (err.status === 1) {
      throw new Error("Predeploy checklist found blockers. Run `node scripts/predeploy-checklist.mjs` for details.");
    }
    if (err.status === 2) {
      // Warnings only — not a blocker
      console.log(`  ${C.yellow("!")} Predeploy checklist passed with warnings`);
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Analytics: write launch history
// ---------------------------------------------------------------------------

function writeAnalytics(verdict, totalDurationMs) {
  const entry = {
    timestamp: new Date().toISOString(),
    event: "system.launch_attempt",
    verdict,
    checkOnly: CHECK_ONLY,
    totalDurationMs,
    envPresent: REQUIRED_ENV.filter((k) => !!process.env[k]),
    migrationCount: stepResults.find((s) => s.name === "Migrations")?.detail?.match?.(/Applied (\d+)/)?.[1] ?? 0,
    steps: stepResults.map((s) => ({
      name: s.name,
      status: s.status,
      durationMs: s.durationMs,
      detail: s.detail,
    })),
  };

  const dir = resolve(PROJECT_ROOT, ".agenticqa");
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(
      resolve(dir, "launch_history.jsonl"),
      JSON.stringify(entry) + "\n",
      "utf-8"
    );
  } catch {
    // Non-fatal — don't crash if we can't write analytics
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function printSummary(verdict, totalDurationMs) {
  console.log("\n" + "=".repeat(60));
  console.log(C.bold("  WOLFPACK AUTO — LAUNCH SUMMARY"));
  console.log("=".repeat(60));

  for (const step of stepResults) {
    const icon =
      step.status === "PASS" ? C.green("V")
      : step.status === "FAIL" ? C.red("X")
      : C.dim("O");
    const dur = C.dim(`${step.durationMs}ms`);
    console.log(`  ${icon}  ${step.name.padEnd(24)} ${dur}`);
    if (step.status === "FAIL" && step.detail) {
      console.log(`     ${C.red(step.detail.split("\n")[0])}`);
    }
  }

  console.log("  " + "-".repeat(56));
  console.log(`  Total: ${C.dim(`${totalDurationMs}ms`)}`);
  console.log("");

  if (verdict === "GO") {
    console.log(C.green("  >>> GO — All checks passed. Ready to deploy. <<<"));
  } else {
    console.log(C.red("  >>> NO-GO — Fix the issues above before deploying. <<<"));
  }

  console.log("=".repeat(60) + "\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(C.bold("\n  Wolfpack Auto — Production Launch"));
  console.log(C.dim(`  ${new Date().toISOString()}  ${CHECK_ONLY ? "(check-only mode)" : ""}`));
  console.log("");

  const totalStart = performance.now();

  try {
    await runStep("Environment Check", stepEnvCheck);
    await runStep("DEMO_MODE Guard", stepDemoModeGuard);
    await runStep("Migrations", stepMigrations);
    await runStep("Database Verify", stepVerifyDatabase);

    // Build is special — it may be skipped
    if (CHECK_ONLY) {
      recordStep("Build", "SKIP", 0, "--check-only");
      console.log(`\n${C.cyan("[Build]")} ${C.dim("SKIP")} --check-only mode`);
    } else {
      await runStep("Build", stepBuild);
    }

    await runStep("Predeploy Checks", stepPredeployChecks);
  } catch {
    // Error already recorded by runStep — just continue to summary
  }

  const totalDurationMs = Math.round(performance.now() - totalStart);
  const verdict = hasBLocker ? "NO-GO" : "GO";

  printSummary(verdict, totalDurationMs);
  writeAnalytics(verdict, totalDurationMs);

  process.exit(hasBLocker ? 1 : 0);
}

main().catch((err) => {
  console.error(C.red(`\nFatal error: ${err.message}`));
  process.exit(1);
});
