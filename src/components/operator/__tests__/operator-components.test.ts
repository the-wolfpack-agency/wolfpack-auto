/**
 * Smoke tests for the operator console UI components.
 *
 * The repo's jest config is `testEnvironment: "node"` and the project
 * does NOT ship `@testing-library/react`. Rather than introduce a new
 * dependency, we validate the components by static-analyzing their
 * source — confirming the load-bearing contract (data-testid hooks, the
 * "use client" directive, key form fields, the logout button calling
 * /api/operator/auth/logout, etc).
 *
 * Real-DOM coverage lives in tests/e2e/operator-flow.spec.ts.
 */

import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../../..");

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), "utf-8");
}

describe("OperatorChrome (auth gate + logout)", () => {
  const src = read("components/operator/OperatorChrome.tsx");

  test("is a client component", () => {
    expect(src.trimStart().startsWith('"use client"')).toBe(true);
  });

  test("redirects unauthenticated visitors to /operator/login?next=...", () => {
    expect(src).toMatch(/\/operator\/login\?next=/);
  });

  test("rejects sessions that are not wolfpack_staff kind", () => {
    expect(src).toMatch(/kind === "wolfpack_staff"/);
  });

  test("logout calls /api/operator/auth/logout then signOut", () => {
    expect(src).toMatch(/\/api\/operator\/auth\/logout/);
    expect(src).toMatch(/signOut\(/);
  });

  test("renders Dashboard / Dealers / Team / Audit Log nav items", () => {
    expect(src).toMatch(/Dashboard/);
    expect(src).toMatch(/Dealers/);
    expect(src).toMatch(/Team/);
    expect(src).toMatch(/Audit Log/);
  });
});

describe("Operator login page", () => {
  const src = read("app/operator/login/page.tsx");

  test("is a client component", () => {
    expect(src.trimStart().startsWith('"use client"')).toBe(true);
  });

  test("calls signIn with the 'wolfpack-staff' provider id", () => {
    expect(src).toMatch(/signIn\(\s*"wolfpack-staff"/);
  });

  test("exposes data-testids for the E2E suite", () => {
    expect(src).toMatch(/data-testid="operator-email"/);
    expect(src).toMatch(/data-testid="operator-password"/);
    expect(src).toMatch(/data-testid="operator-login-submit"/);
  });

  test("preserves ?next= for post-login redirect", () => {
    expect(src).toMatch(/searchParams\.get\("next"\)/);
  });
});

describe("Operator accept-invite page", () => {
  const src = read("app/operator/accept-invite/page.tsx");

  test("posts to /api/operator/invites/accept", () => {
    expect(src).toMatch(/\/api\/operator\/invites\/accept/);
  });

  test("password input is required (min 12 chars enforced client-side)", () => {
    expect(src).toMatch(/12 characters/);
  });

  test("renders email as readonly (server-supplied)", () => {
    expect(src).toMatch(/readOnly/);
  });
});

describe("Operator dealers list", () => {
  const src = read("app/operator/dealers/page.tsx");

  test("includes a search input + status filter pills", () => {
    expect(src).toMatch(/data-testid="dealer-search"/);
    // Status pills render via map — testids are template literals.
    expect(src).toMatch(/data-testid=\{`filter-\$\{s\}`\}/);
    expect(src).toMatch(/"all".*"active".*"onboarding".*"suspended"/s);
  });

  test("has a New Dealer CTA", () => {
    expect(src).toMatch(/data-testid="cta-new-dealer"/);
  });
});

describe("Operator new-dealer wizard", () => {
  const src = read("app/operator/dealers/new/page.tsx");

  test("posts to /api/operator/dealers", () => {
    expect(src).toMatch(/fetch\("\/api\/operator\/dealers"/);
  });

  test("surfaces the temp password on success (data-testid)", () => {
    expect(src).toMatch(/data-testid="temp-password"/);
  });
});

describe("Operator team page", () => {
  const src = read("app/operator/team/page.tsx");

  test("posts invites to /api/operator/invites", () => {
    expect(src).toMatch(/fetch\("\/api\/operator\/invites"/);
  });

  test("invite form has email + role + submit", () => {
    expect(src).toMatch(/data-testid="invite-email"/);
    expect(src).toMatch(/data-testid="invite-role"/);
    expect(src).toMatch(/data-testid="invite-submit"/);
  });
});
