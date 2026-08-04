/**
 * Authenticated session for the production canary.
 *
 * WHY THIS EXISTS
 *
 * 30 of the canary's 89 tests target `/admin/*`. None of them ever signed in.
 * They passed until 2026-04-02 because DEMO_MODE used to wave anonymous traffic
 * past the middleware auth gate, so `/admin` rendered for nobody in particular.
 * That hole was closed deliberately (`src/middleware.ts`: "This gate is ALWAYS
 * on. DEMO_MODE never disables it"), which is correct and must stay correct.
 *
 * The canary was dormant at the time, so nothing reported the consequence: from
 * that day on every admin-page check could only ever fail. Two of the specs even
 * name the missing piece in their failure text ("set CANARY_AUTH_COOKIE"), but
 * nothing ever produced one.
 *
 * The assertions themselves are worth keeping — "no admin page white-screens in
 * production" is the exact bug class that has bitten this product. So the fix is
 * to give the canary a real session, not to lower the bar.
 *
 * WHAT NOT TO DO HERE
 *
 * Do not make the admin checks skip when a session cannot be established. A
 * canary that reports green because it tested nothing is worse than a red one:
 * it is the reason this went unnoticed for four months. `canary-auth.setup.ts`
 * fails loudly instead.
 */
import { request as pwRequest, type APIRequestContext } from "@playwright/test";
import path from "node:path";

/**
 * Where the signed-in session is saved. Written once by the `setup` project,
 * read by every admin-scoped spec.
 *
 * Kept in a helper rather than in the setup spec because Playwright rejects a
 * test file importing another test file.
 */
export const CANARY_STATE = path.join(__dirname, "..", ".auth", "admin.json");

export interface CanaryCredentials {
  email: string;
  password: string;
  /** True when these came from CI secrets rather than the built-in demo login. */
  fromSecrets: boolean;
}

/**
 * The account the canary signs in as.
 *
 * Prefers `CANARY_EMAIL` / `CANARY_PASSWORD`. Falls back to the demo credential
 * in `src/lib/auth.ts`, which is only accepted when the deployment sets
 * `DEMO_MODE=true` — so the fallback cannot grant access anywhere that has not
 * already chosen to enable it.
 */
export function canaryCredentials(): CanaryCredentials {
  const email = process.env.CANARY_EMAIL;
  const password = process.env.CANARY_PASSWORD;
  if (email && password) return { email, password, fromSecrets: true };
  return {
    email: "demo@wolfpackauto.com",
    password: "demo",
    fromSecrets: false,
  };
}

/**
 * An API context carrying the signed-in session.
 *
 * The admin API specs build their own request contexts with
 * `pwRequest.newContext()`, which starts with no cookies, which is why
 * `/api/admin/heatmaps` answered 401. Use this instead.
 */
export async function authedRequest(
  baseURL: string | undefined,
): Promise<APIRequestContext> {
  return pwRequest.newContext({
    baseURL,
    storageState: CANARY_STATE,
    extraHTTPHeaders: {
      "x-canary-secret": process.env.CANARY_SECRET ?? "",
    },
  });
}
