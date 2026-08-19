/**
 * The redirect a signed-in user is allowed to be sent to.
 *
 * The login page reads `callbackUrl` from the query string and assigns it to
 * window.location.href after the password is accepted, so an unchecked value is
 * a credential-phishing primitive: sign in here, get bounced to a copy of this
 * page on somebody else's domain.
 *
 * Written while fixing the invitation dead end (2026-08-19), because the
 * middleware redirect now carries the query as well as the path and it would be
 * careless to widen that without checking what travels through it.
 */
import { safeCallbackUrl } from "@/lib/safe-callback-url";

describe("same-origin paths are kept", () => {
  test.each([
    "/admin",
    "/admin/vehicles",
    "/admin/vehicles?status=sold&page=3",
    // The case this whole change exists for.
    "/admin/accept-invite?token=abc123",
  ])("%j", (input) => {
    expect(safeCallbackUrl(input)).toBe(input);
  });
});

describe("anything that could leave this origin is refused", () => {
  test.each([
    ["https://evil.example/admin", "absolute URL"],
    ["http://evil.example", "absolute URL, plain http"],
    ["//evil.example/admin", "protocol-relative: browsers read it as another origin"],
    ["/\\evil.example", "backslash, which some browsers normalise to a slash"],
    ["javascript:alert(1)", "not a path at all"],
    ["admin/vehicles", "relative, so it depends on where it is resolved from"],
    ["", "empty"],
  ])("%j is refused (%s)", (input) => {
    expect(safeCallbackUrl(input)).toBe("/admin");
  });

  test("absent falls back rather than throwing", () => {
    expect(safeCallbackUrl(null)).toBe("/admin");
    expect(safeCallbackUrl(undefined)).toBe("/admin");
  });

  test("the fallback is caller-chosen, and used on rejection", () => {
    expect(safeCallbackUrl("https://evil.example", "/admin/getting-started")).toBe(
      "/admin/getting-started",
    );
  });
});
