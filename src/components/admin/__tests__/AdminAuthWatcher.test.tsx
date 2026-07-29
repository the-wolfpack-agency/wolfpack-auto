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
});
