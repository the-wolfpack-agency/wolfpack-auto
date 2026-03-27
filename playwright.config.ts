import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Wolfpack Auto E2E tests.
 *
 * Starts the Next.js dev server automatically, runs tests in three
 * browser engines, and captures screenshots on failure for debugging.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",

  timeout: 30_000,

  expect: {
    timeout: 10_000,
  },

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["iPhone 13"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    // Use /inventory for the readiness probe — the root / can return 500
    // during cold-start if DB is unreachable, but /inventory is static-safe.
    // Playwright considers the server ready when this URL returns < 400.
    url: "http://localhost:3000/inventory",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
