/**
 * @jest-environment jsdom
 *
 * What an invited person sees when the link has no invitation code.
 *
 * Reported 2026-08-19 by the CEO, with a screenshot: a red box reading
 * "Invalid or missing invitation token. Please check your email for the correct
 * link." and nothing else on the page. No link, no next step, no way to sign in
 * if the account already existed.
 *
 * Every reason to land there is ordinary: the link wrapped in a mail client and
 * only half of it hyperlinked, the page was opened from history, the invitation
 * was already accepted, or it expired (they last seven days). In all four cases
 * there is something useful to do, and the screen offered none of it.
 *
 * Rendered with react-dom/client + act, matching ErrorState.test.tsx. This repo
 * has no React Testing Library and this does not justify adding one.
 */
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

const searchParams = { get: jest.fn() };
jest.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

import AcceptInvitePage from "../page";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  searchParams.get.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function renderWithToken(token: string | null) {
  searchParams.get.mockImplementation((key: string) => (key === "token" ? token : null));
  act(() => root.render(<AcceptInvitePage />));
}

describe("a link with no invitation code", () => {
  test("says what happened in words that describe a real cause", () => {
    renderWithToken(null);
    expect(container.textContent).toContain("missing its invitation code");
    // Expiry is a real cause and was never mentioned, so nobody knew to ask again.
    expect(container.textContent).toMatch(/expire/i);
  });

  test("OFFERS A WAY FORWARD, which is the whole bug", () => {
    renderWithToken(null);
    const panel = container.querySelector('[data-testid="accept-invite-no-token"]');
    expect(panel).not.toBeNull();

    // Somebody who already accepted needs to sign in, not re-read an email.
    const signIn = container.querySelector('a[href="/admin/login"]');
    expect(signIn).not.toBeNull();

    // And somebody who still needs access is told what actually works.
    expect(container.textContent).toMatch(/send it again/i);
  });

  test("does not show a password form there is no way to submit", () => {
    renderWithToken(null);
    expect(container.querySelector('input[type="password"]')).toBeNull();
  });
});

describe("a link that carries its code", () => {
  test("shows the password form and none of the recovery copy", () => {
    renderWithToken("a-real-token");
    expect(container.querySelectorAll('input[type="password"]').length).toBe(2);
    expect(container.querySelector('[data-testid="accept-invite-no-token"]')).toBeNull();
    expect(container.textContent).not.toContain("missing its invitation code");
  });
});
