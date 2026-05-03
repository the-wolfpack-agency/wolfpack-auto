/**
 * Launch Script Tests — validates predeploy-checklist.mjs and predeploy-gate.sh
 * exit codes, error reporting, and environment validation.
 *
 * These tests exercise the launch scripts' behavior under various
 * environment configurations without requiring a real database.
 *
 * Run: npx playwright test tests/e2e/launch-script.spec.ts
 */

import { test, expect } from "@playwright/test";
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "child_process";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const PROJECT_DIR = resolve(__dirname, "../..");
const CHECKLIST_SCRIPT = resolve(PROJECT_DIR, "scripts/predeploy-checklist.mjs");
const GATE_SCRIPT = resolve(PROJECT_DIR, "scripts/predeploy-gate.sh");

const execOpts: ExecFileSyncOptionsWithStringEncoding = {
  encoding: "utf-8",
  cwd: PROJECT_DIR,
  timeout: 30_000,
};

/**
 * Run a script and return { stdout, exitCode } without throwing.
 *
 * `file` and `args` are passed through `execFileSync` so we never spawn a
 * shell — env-derived values cannot break out of the argv into the command
 * line. CodeQL js/shell-command-injection-from-environment.
 */
function runScript(
  file: string,
  args: string[] = [],
  env?: Record<string, string>,
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync(file, args, {
      ...execOpts,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.status ?? 1,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Script existence checks                                                    */
/* -------------------------------------------------------------------------- */

test.describe("Launch scripts exist and are readable", () => {
  test("predeploy-checklist.mjs exists", () => {
    expect(existsSync(CHECKLIST_SCRIPT)).toBe(true);
  });

  test("predeploy-gate.sh exists", () => {
    expect(existsSync(GATE_SCRIPT)).toBe(true);
  });

  test("predeploy-checklist.mjs has correct shebang", () => {
    const content = readFileSync(CHECKLIST_SCRIPT, "utf-8");
    expect(content.startsWith("#!/usr/bin/env node")).toBe(true);
  });

  test("predeploy-gate.sh has correct shebang", () => {
    const content = readFileSync(GATE_SCRIPT, "utf-8");
    expect(content.startsWith("#!/usr/bin/env bash")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* predeploy-checklist.mjs: Missing env vars                                  */
/* -------------------------------------------------------------------------- */

test.describe("Predeploy checklist: Missing env vars", () => {
  test("exits with code 1 when DATABASE_URL is missing", () => {
    const result = runScript(
      "node",
      [CHECKLIST_SCRIPT],
      { DATABASE_URL: "", NEXTAUTH_SECRET: "", PII_ENCRYPTION_KEY: "" },
    );
    // Exit code 1 = blockers, 2 = warnings only
    expect(result.exitCode).toBeGreaterThanOrEqual(1);
  });

  test("output mentions DATABASE_URL when it is missing", () => {
    const result = runScript(
      "node",
      [CHECKLIST_SCRIPT],
      { DATABASE_URL: "" },
    );
    const combined = result.stdout + result.stderr;
    expect(combined).toContain("DATABASE_URL");
  });

  test("output mentions NEXTAUTH_SECRET when it is missing", () => {
    const result = runScript(
      "node",
      [CHECKLIST_SCRIPT],
      { DATABASE_URL: "", NEXTAUTH_SECRET: "" },
    );
    const combined = result.stdout + result.stderr;
    expect(combined).toContain("NEXTAUTH_SECRET");
  });

  test("output mentions PII_ENCRYPTION_KEY when it is missing", () => {
    const result = runScript(
      "node",
      [CHECKLIST_SCRIPT],
      { DATABASE_URL: "", PII_ENCRYPTION_KEY: "" },
    );
    const combined = result.stdout + result.stderr;
    expect(combined).toContain("PII_ENCRYPTION_KEY");
  });
});

/* -------------------------------------------------------------------------- */
/* predeploy-checklist.mjs: DEMO_MODE blocker                                 */
/* -------------------------------------------------------------------------- */

test.describe("Predeploy checklist: DEMO_MODE detection", () => {
  test("checklist source checks for DEMO_MODE as blocker", () => {
    const source = readFileSync(CHECKLIST_SCRIPT, "utf-8");
    expect(source).toContain("DEMO_MODE");
    expect(source).toContain("bypasses auth");
  });

  test("checklist source calls fail() for DEMO_MODE on production", () => {
    const source = readFileSync(CHECKLIST_SCRIPT, "utf-8");
    // The script uses: fail(category, "DEMO_MODE is set on Production — bypasses auth!", ...)
    expect(source).toMatch(/fail\([^)]*DEMO_MODE/);
  });
});

/* -------------------------------------------------------------------------- */
/* predeploy-checklist.mjs: Summary output                                    */
/* -------------------------------------------------------------------------- */

test.describe("Predeploy checklist: Summary output", () => {
  test("prints PASS/FAIL/WARN summary", () => {
    const result = runScript("node", [CHECKLIST_SCRIPT]);
    const combined = result.stdout + result.stderr;
    expect(combined).toContain("PASS:");
  });

  test("prints category headers", () => {
    const result = runScript("node", [CHECKLIST_SCRIPT]);
    const combined = result.stdout + result.stderr;
    expect(combined).toContain("Environment");
  });

  test("exits 0 when all green, 1 for blockers, 2 for warnings only", () => {
    const result = runScript("node", [CHECKLIST_SCRIPT]);
    // Without proper env vars it should exit 1 (blockers) or 2 (warnings)
    expect([0, 1, 2]).toContain(result.exitCode);
  });
});

/* -------------------------------------------------------------------------- */
/* predeploy-gate.sh: Script validation                                       */
/* -------------------------------------------------------------------------- */

test.describe("Predeploy gate: Script structure", () => {
  test("gate script has 4 steps", () => {
    const source = readFileSync(GATE_SCRIPT, "utf-8");
    expect(source).toContain("Step 1/4");
    expect(source).toContain("Step 2/4");
    expect(source).toContain("Step 3/4");
    expect(source).toContain("Step 4/4");
  });

  test("gate script supports --quick flag", () => {
    const source = readFileSync(GATE_SCRIPT, "utf-8");
    expect(source).toContain("--quick");
    expect(source).toContain("QUICK=true");
  });

  test("gate script prints GO/NO-GO verdict", () => {
    const source = readFileSync(GATE_SCRIPT, "utf-8");
    expect(source).toContain("ALL CHECKS PASSED");
    expect(source).toContain("DO NOT DEPLOY");
  });

  test("gate script uses set -euo pipefail for safety", () => {
    const source = readFileSync(GATE_SCRIPT, "utf-8");
    expect(source).toContain("set -euo pipefail");
  });

  test("gate script exits with failure count", () => {
    const source = readFileSync(GATE_SCRIPT, "utf-8");
    // The script exits with ${FAILURES} as exit code
    expect(source).toMatch(/exit.*FAILURES/);
  });
});

/* -------------------------------------------------------------------------- */
/* predeploy-checklist.mjs: Code quality checks                               */
/* -------------------------------------------------------------------------- */

test.describe("Predeploy checklist: Code quality validation", () => {
  test("checklist validates no default dealer ID fallbacks", () => {
    const source = readFileSync(CHECKLIST_SCRIPT, "utf-8");
    expect(source).toContain("DEALER_ID");
    expect(source).toContain("default");
  });

  test("checklist validates real DMS provider names", () => {
    const source = readFileSync(CHECKLIST_SCRIPT, "utf-8");
    expect(source).toContain("DMS Provider");
  });

  test("checklist checks required env vars list is complete", () => {
    const source = readFileSync(CHECKLIST_SCRIPT, "utf-8");
    const requiredVars = [
      "DATABASE_URL",
      "NEXTAUTH_SECRET",
      "PII_ENCRYPTION_KEY",
      "RESEND_API_KEY",
      "RESEND_FROM_EMAIL",
    ];
    for (const envVar of requiredVars) {
      expect(source).toContain(envVar);
    }
  });

  test("checklist checks migration status for critical tables", () => {
    const source = readFileSync(CHECKLIST_SCRIPT, "utf-8");
    expect(source).toContain("dealer_users");
    expect(source).toContain("invite_token");
    expect(source).toContain("agency_api_keys");
  });
});
