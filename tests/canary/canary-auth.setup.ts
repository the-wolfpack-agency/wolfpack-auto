/**
 * Establishes the canary's signed-in session, once, before the admin specs run.
 *
 * Runs as the `setup` project in `playwright.canary.config.ts`. Every
 * admin-scoped spec depends on it, so a failure here stops those specs from
 * running rather than letting them fail one by one with 30 identical
 * "redirected to login" messages.
 *
 * Deliberately has no skip path. If the canary cannot sign in, that is either a
 * broken login on production or a missing credential in CI, and both must be
 * seen. See the note in `helpers/canary-auth.ts`.
 */
import { test as setup, expect } from "@playwright/test";
import { CANARY_STATE, canaryCredentials } from "./helpers/canary-auth";

setup("canary signs in", async ({ page, baseURL }) => {
  const { email, password, fromSecrets } = canaryCredentials();

  await page.goto("/admin/login", { waitUntil: "domcontentloaded" });

  /* The form is plain email + password. Match on type first so a renamed
     `name` attribute does not silently select the wrong field. */
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);

  /* A click before hydration submits natively and never POSTs, which is the
     flake that cost a day in wolfpack-porsche-weekend. Wait for the control to
     be interactive first. */
  const submit = page.locator('button[type="submit"]');
  await expect(submit).toBeEnabled();
  await submit.click();

  await page.waitForURL((url) => !url.pathname.startsWith("/admin/login"), {
    timeout: 20_000,
  });

  /* Prove the session is real by loading a gated page, not by trusting the
     redirect. A cookie that the middleware rejects would still have moved us
     off /admin/login. */
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  expect(
    page.url(),
    `signed in as ${email} but /admin still bounced to login. ` +
      (fromSecrets
        ? "Check CANARY_EMAIL / CANARY_PASSWORD."
        : "The built-in demo login needs DEMO_MODE=true on the target deployment; " +
          "otherwise set CANARY_EMAIL / CANARY_PASSWORD."),
  ).not.toContain("/admin/login");

  await page.context().storageState({ path: CANARY_STATE });
});
