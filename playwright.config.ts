import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Wolfpack Auto E2E tests.
 *
 * Starts the Next.js dev server automatically, runs tests in three
 * browser engines, and captures screenshots on failure for debugging.
 */
export default defineConfig({
  testDir: "./tests",
  // Only run e2e, pages, and top-level specs by default.
  // Canary, load, shadow, shadow-hardening, rls, api, and components
  // are special-purpose suites run via their own configs/scripts.
  testMatch: ["e2e/**/*.spec.ts", "pages/**/*.spec.ts", "*.spec.ts"],
  testIgnore: [
    "**/canary/**",
    "**/load/**",
    "**/shadow/**",
    "**/shadow-hardening/**",
  ],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? "github" : "list",

  // Per-test timeout: 15s is plenty for API and page tests
  timeout: 15_000,
  // Kill the entire suite if it exceeds 15 minutes (2800+ tests, prevents infinite hangs)
  globalTimeout: 900_000,

  expect: {
    timeout: 5_000,
  },

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Disable video locally — saves CPU and prevents hangs on cleanup
    video: process.env.CI ? "retain-on-failure" : "off",
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
    command: "npm run build && npm run start",
    url: "http://localhost:3000/inventory",
    reuseExistingServer: true,
    // Production build + start takes longer, but serves pages 5-10x faster
    timeout: 120_000,
  },
});
