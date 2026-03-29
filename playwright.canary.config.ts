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
});
