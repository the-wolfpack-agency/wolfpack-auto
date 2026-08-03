/**
 * @jest-environment jsdom
 *
 * AdminAuthWatcher: session-expiry guard test.
 *
 * Covers:
 *   - a 401 from an authenticated same-origin /api call logs the user out and
 *     redirects to the login page with a `next` param
 *   - a successful (200) response never triggers a logout
 *   - a 401 from an /api/auth/ endpoint (or the signout request itself) is
 *     ignored, so there is no redirect loop
 *   - only the FIRST qualifying 401 fires signOut (guard flag)
 *   - unmounting restores the original window.fetch
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import AdminAuthWatcher from "../AdminAuthWatcher";

declare const global: any;

(global as any).IS_REACT_ACT_ENVIRONMENT = true;

const signOutMock = jest.fn();
jest.mock("next-auth/react", () => ({
  signOut: (...args: any[]) => signOutMock(...args),
}));

function mount(container: HTMLElement): Root {
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(<AdminAuthWatcher />);
  });
  return root;
}

function resp(status: number): Response {
  return { status, ok: status >= 200 && status < 300 } as Response;
}

describe("AdminAuthWatcher", () => {
  let container: HTMLDivElement;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    signOutMock.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    originalFetch = global.fetch;
    // Land on a deep admin page so we can assert the `next` param.
    window.history.pushState({}, "", "/admin/settings?tab=info");
  });

  afterEach(() => {
    document.body.removeChild(container);
    global.fetch = originalFetch;
  });

  test("logs out and redirects to login on a 401 from an admin API", async () => {
    global.fetch = jest.fn().mockResolvedValue(resp(401));
    const root = mount(container);

    const res = await window.fetch("/api/admin/settings");
    expect(res.status).toBe(401); // response still returned to the caller

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledWith({
      callbackUrl: `/admin/login?next=${encodeURIComponent("/admin/settings?tab=info")}`,
    });

    act(() => root.unmount());
  });

  test("does not log out on a successful response", async () => {
    global.fetch = jest.fn().mockResolvedValue(resp(200));
    const root = mount(container);

    await window.fetch("/api/admin/settings");
    expect(signOutMock).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  test("ignores 401s from auth endpoints so there is no loop", async () => {
    global.fetch = jest.fn().mockResolvedValue(resp(401));
    const root = mount(container);

    await window.fetch("/api/auth/session");
    await window.fetch("/api/auth/signout");
    expect(signOutMock).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  test("fires signOut only once across repeated 401s", async () => {
    global.fetch = jest.fn().mockResolvedValue(resp(401));
    const root = mount(container);

    await window.fetch("/api/admin/settings");
    await window.fetch("/api/admin/team");
    await window.fetch("/api/admin/vehicles");
    expect(signOutMock).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  test("restores the original fetch on unmount", async () => {
    const installed = jest.fn().mockResolvedValue(resp(200));
    global.fetch = installed as any;
    const before = window.fetch;
    const root = mount(container);
    expect(window.fetch).not.toBe(before); // wrapped while mounted

    act(() => root.unmount());
    expect(window.fetch).toBe(installed); // original restored
  });

  test("does NOT redirect when already on the login page", async () => {
    /* The production incident. The login page has no session, so its /api calls
       answer 401; redirecting to login from login refreshed the browser
       continuously, and because each hop encoded the previous URL into `next`
       the address grew on every pass until it was thousands of characters. */
    window.history.pushState({}, "", "/admin/login");
    global.fetch = jest.fn().mockResolvedValue(resp(401));
    const root = mount(container);
    await window.fetch("/api/admin/me");
    expect(signOutMock).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  test.each([
    ["/admin/accept-invite"],
    ["/admin/reset-password"],
    ["/admin/forgot-password"],
  ])("does NOT redirect from %s, which has no session by design", async (path) => {
    window.history.pushState({}, "", path);
    global.fetch = jest.fn().mockResolvedValue(resp(401));
    const root = mount(container);
    await window.fetch("/api/admin/me");
    expect(signOutMock).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  test("never nests a login URL inside next", async () => {
    // The mechanism that made the URL grow without bound.
    window.history.pushState({}, "", "/admin/leads");
    global.fetch = jest.fn().mockResolvedValue(resp(401));
    const root = mount(container);
    await window.fetch("/api/admin/leads");
    const cb = signOutMock.mock.calls[0][0].callbackUrl as string;
    expect(cb).toBe(`/admin/login?next=${encodeURIComponent("/admin/leads")}`);
    expect(decodeURIComponent(decodeURIComponent(cb))).not.toMatch(/login[\s\S]*login/);
    act(() => root.unmount());
  });
});
