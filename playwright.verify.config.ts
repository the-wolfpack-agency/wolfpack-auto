/**
 * Dedicated Playwright config for `npm run test:e2e:smoke` (the verify gate).
 *
 * Kept separate from playwright.config.ts so the verify smoke:
 *   - only runs tests/e2e/smoke.spec.ts (not the 2,800+ full suite)
 *   - points at PROD_URL when set (no auto dev-server boot)
 *   - uses a single chromium worker for deterministic CSP/network capture
 */
import { defineConfig, devices } from "@playwright/test";

const PROD_URL = process.env.PROD_URL?.replace(/\/$/, "");

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["smoke.spec.ts"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: PROD_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  // Only start a dev server when we do NOT have a deployed URL.
  webServer: PROD_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
