/**
 * A 401 on an authenticated page sends you to sign in.
 *
 * /admin/agency/new-dealer showed "Authentication required" in red above a
 * fully filled-in form. The session had expired, so nothing typed could ever
 * save, and the page offered no way to fix it: no link, no redirect, just a
 * form that would fail again on every submit.
 */
import { loginUrlFor, redirectToLoginIfUnauthenticated, ADMIN_LOGIN_PATH } from "../auth-redirect";

describe("loginUrlFor", () => {
  it("carries the current page so sign-in returns there", () => {
    expect(loginUrlFor("/admin/agency/new-dealer")).toBe(
      `${ADMIN_LOGIN_PATH}?next=%2Fadmin%2Fagency%2Fnew-dealer`,
    );
  });

  it("refuses an absolute URL, which would make login an open redirect", () => {
    expect(loginUrlFor("https://evil.test/steal")).toBe(`${ADMIN_LOGIN_PATH}?next=%2Fadmin`);
  });

  it("refuses a protocol-relative URL too", () => {
    // "//evil.test" is a valid absolute URL to a browser.
    expect(loginUrlFor("//evil.test")).toBe(`${ADMIN_LOGIN_PATH}?next=%2Fadmin`);
  });

  it("refuses a path that is not a path", () => {
    expect(loginUrlFor("javascript:alert(1)")).toBe(`${ADMIN_LOGIN_PATH}?next=%2Fadmin`);
  });
});

describe("redirectToLoginIfUnauthenticated", () => {
  const loc = (pathname: string) => ({ pathname, href: "" });

  it("navigates on 401 and tells the caller to stop", () => {
    const l = loc("/admin/agency/new-dealer");
    expect(redirectToLoginIfUnauthenticated({ status: 401 }, l)).toBe(true);
    expect(l.href).toBe(`${ADMIN_LOGIN_PATH}?next=%2Fadmin%2Fagency%2Fnew-dealer`);
  });

  it("does NOT redirect on 403", () => {
    /* 403 is a real permission answer for a real session. Bouncing somebody to
       a login page they are already signed into is a loop, not a fix. It also
       has to stay visible: 403 here was the dealer-role bug. */
    const l = loc("/admin/agency/new-dealer");
    expect(redirectToLoginIfUnauthenticated({ status: 403 }, l)).toBe(false);
    expect(l.href).toBe("");
  });

  it.each([[200], [201], [400], [409], [500]])("leaves %i alone", (status) => {
    const l = loc("/admin/agency/new-dealer");
    expect(redirectToLoginIfUnauthenticated({ status }, l)).toBe(false);
    expect(l.href).toBe("");
  });
});
