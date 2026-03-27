import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for end-to-end user journey tests.
 *
 * Runs against the dev server (or a custom E2E_URL).
 * Chromium only — these are long flows that should be deterministic.
 */
export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,

  timeout: 60_000,

  expect: {
    timeout: 15_000,
  },

  reporter: [
    ["json", { outputFile: "e2e-results.json" }],
    ["html", { open: "never" }],
  ],

  use: {
    baseURL: process.env.E2E_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "e2e-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: process.env.E2E_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
