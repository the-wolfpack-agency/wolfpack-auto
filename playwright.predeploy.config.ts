import { defineConfig, devices } from "@playwright/test";

/**
 * Pre-deploy gate configuration.
 *
 * Runs ALL E2E tests (728+) against a production build in shadow mode
 * (no DATABASE_URL). Every test must pass before a deploy is considered safe.
 *
 * Usage:
 *   npm run test:predeploy       # full pre-deploy gate
 *   npm run test:predeploy:quick  # smoke + API contracts only (fast)
 *
 * This config:
 *   - Builds Next.js in production mode
 *   - Starts the prod server on port 3098
 *   - Runs every test file: smoke, e2e contracts, and user flows
 *   - Zero retries — tests must pass on first run
 *   - Serial workers in CI to avoid port conflicts
 */
export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "smoke.spec.ts",
    "e2e/**/*.spec.ts",
  ],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "predeploy-report" }]]
    : [["html", { open: "on-failure", outputFolder: "predeploy-report" }]],

  timeout: 30_000,

  expect: {
    timeout: 10_000,
  },

  use: {
    baseURL: "http://localhost:3098",
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
    command: "npx next start -p 3098",
    url: "http://localhost:3098/inventory",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
