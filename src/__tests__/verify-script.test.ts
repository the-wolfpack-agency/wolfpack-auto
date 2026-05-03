/**
 * Validates scripts/verify.sh behavior by stubbing npm/npx via PATH.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT = join(REPO_ROOT, "scripts", "verify.sh");

function shim(dir: string, name: string, body: string) {
  const path = join(dir, name);
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(path, 0o755);
}

function runVerify(
  stubDir: string,
  extraEnv: Partial<NodeJS.ProcessEnv> = {},
) {
  // NodeJS.ProcessEnv requires NODE_ENV; spread parent env first so the
  // env literal satisfies the type, then override the keys we care about.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV ?? "test",
    PATH: `${stubDir}:${process.env.PATH ?? ""}`,
    CI: "true",
    VERIFY_SKIP_E2E: "1",
    ...extraEnv,
  };
  return spawnSync("bash", [SCRIPT], {
    env,
    encoding: "utf-8",
  });
}

describe("scripts/verify.sh", () => {
  let stubDir: string;

  beforeEach(() => {
    stubDir = mkdtempSync(join(tmpdir(), "verify-stub-"));
  });

  afterEach(() => {
    rmSync(stubDir, { recursive: true, force: true });
  });

  it("exits 0 and prints a summary when all stages pass", () => {
    shim(stubDir, "npm", "exit 0");
    shim(stubDir, "npx", "exit 0");

    const res = runVerify(stubDir);
    expect(res.stdout).toMatch(/verify summary/);
    expect(res.stdout).toMatch(/\[PASS\] lint/);
    expect(res.stdout).toMatch(/\[PASS\] typecheck/);
    expect(res.stdout).toMatch(/\[PASS\] unit-tests/);
    expect(res.stdout).toMatch(/\[SKIP\] e2e-smoke/);
    expect(res.status).toBe(0);
  }, 30_000);

  it("exits non-zero and marks the failing stage when lint fails", () => {
    // First npm call is `npm run lint`; fail it, pass subsequent calls.
    // We use a side-file counter so the stub knows which invocation it is.
    const counter = join(stubDir, "count");
    writeFileSync(counter, "0");
    shim(
      stubDir,
      "npm",
      [
        'c=$(cat "' + counter + '")',
        'echo $((c + 1)) > "' + counter + '"',
        'if [[ "$c" == "0" ]]; then',
        "  exit 7",   // lint fails
        "fi",
        "exit 0",
      ].join("\n"),
    );
    shim(stubDir, "npx", "exit 0");

    const res = runVerify(stubDir);
    expect(res.stdout).toMatch(/\[FAIL\] lint/);
    expect(res.status).not.toBe(0);
  }, 30_000);

  it("continues running downstream stages after an earlier failure", () => {
    // Fail lint (first npm call), pass everything else.
    const counter = join(stubDir, "count");
    writeFileSync(counter, "0");
    shim(
      stubDir,
      "npm",
      [
        'c=$(cat "' + counter + '")',
        'echo $((c + 1)) > "' + counter + '"',
        'if [[ "$c" == "0" ]]; then exit 9; fi',
        "exit 0",
      ].join("\n"),
    );
    shim(stubDir, "npx", "exit 0");

    const res = runVerify(stubDir);
    expect(res.stdout).toMatch(/\[FAIL\] lint/);
    expect(res.stdout).toMatch(/\[PASS\] typecheck/);
    expect(res.stdout).toMatch(/\[PASS\] unit-tests/);
    expect(res.status).not.toBe(0);
  }, 30_000);
});
