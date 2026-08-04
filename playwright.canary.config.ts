/**
 * Playwright config for Production Canary tests.
 *
 * These tests run AGAINST A LIVE DEPLOYMENT (production or preview) to verify
 * that real infrastructure is working — not silently falling back to Shadow Mode.
 *
 * Environment variables:
 *   CANARY_URL      — target URL (required in CI; defaults to localhost:3000)
 *   CANARY_SECRET   — shared secret for /api/health/deep endpoint
 *   CANARY_TIMEOUT  — per-test timeout in ms (default: 30000)
 */

import { defineConfig } from "@playwright/test";

const canaryUrl = process.env.CANARY_URL ?? "http://localhost:3000";
const timeout = parseInt(process.env.CANARY_TIMEOUT ?? "30000", 10);

export default defineConfig({
  testDir: "./tests/canary",
  fullyParallel: false, // serial — probes may share DB state
  workers: 1,
  timeout,
  expect: { timeout: 10_000 },
  retries: 1, // one retry — transient network issues shouldn't fail the deploy
  reporter: [
    ["list"],
    ["json", { outputFile: "canary-report.json" }],
    ["html", { outputFolder: "canary-report", open: "never" }],
  ],
  use: {
    baseURL: canaryUrl,
    extraHTTPHeaders: {
      "x-canary-secret": process.env.CANARY_SECRET ?? "",
    },
  },

  /*
   * Two projects, because the canary has to prove two opposite things.
   *
   *   setup   signs in once and saves the session.
   *   canary  runs every spec. Specs that check a gated surface opt into the
   *           saved session with `test.use({ storageState: CANARY_STATE })`;
   *           the ones that check anonymous behaviour deliberately do not, so
   *           they keep seeing production the way a signed-out visitor does.
   *
   * The session is NOT applied globally here. Doing that would silently
   * authenticate `canary-auth-entry.spec.ts`, whose whole job is to confirm a
   * signed-out visitor is turned away.
   */
  projects: [
    {
      name: "setup",
      testMatch: /canary-auth\.setup\.ts$/,
    },
    {
      name: "canary",
      testIgnore: /canary-auth\.setup\.ts$/,
      dependencies: ["setup"],
    },
  ],
});
