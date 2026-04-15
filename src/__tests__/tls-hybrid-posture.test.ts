/**
 * TLS Hybrid Posture Test (Wolfpack Auto)
 *
 * Runs the verify-tls-hybrid.sh script against the production domain in CI.
 * Skipped locally (requires CI=true + PROD_DOMAIN env vars).
 *
 * In CI, asserts that hybrid X25519MLKEM768 is negotiated.
 */

import { execSync } from "child_process";
import { join } from "path";

const isCI = process.env.CI === "true";
const prodDomain = process.env.PROD_DOMAIN ?? "";

describe("TLS Hybrid Posture", () => {
  const skip = !isCI || !prodDomain;

  (skip ? it.skip : it)(
    "negotiates X25519MLKEM768 hybrid TLS against production domain",
    () => {
      const scriptPath = join(process.cwd(), "scripts", "verify-tls-hybrid.sh");
      let result: "pass" | "fail" = "fail";
      let output = "";
      try {
        output = execSync(`sh "${scriptPath}" "${prodDomain}"`, {
          timeout: 15000,
          encoding: "utf-8",
        });
        result = "pass";
      } catch (err: unknown) {
        const execErr = err as { stdout?: string; stderr?: string; status?: number };
        output = (execErr.stdout ?? "") + (execErr.stderr ?? "");
        result = "fail";
      }

      console.log(`[tls-hybrid-posture] domain=${prodDomain} result=${result}`);
      console.log(output.slice(0, 500));

      expect(result).toBe("pass");
    },
  );

  it("verify-tls-hybrid.sh script exists and is executable", () => {
    const scriptPath = join(process.cwd(), "scripts", "verify-tls-hybrid.sh");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { existsSync, statSync } = require("fs");
    expect(existsSync(scriptPath)).toBe(true);
    const stat = statSync(scriptPath);
    expect(stat.mode & 0o100).not.toBe(0);
  });
});
