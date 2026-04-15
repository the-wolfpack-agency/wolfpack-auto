/**
 * notifications-invite.test.ts
 *
 * Unit tests for sendTeamInvite in src/lib/notifications.ts.
 *
 * Verifies:
 *   - Correct subject and accept URL construction
 *   - Resend failure is caught, logged, and emits analytics — never throws
 *   - analytics event system.team_invite_sent is emitted on success
 *   - analytics event system.notification_send_failed is emitted on failure
 *   - Missing RESEND_API_KEY falls through gracefully (console log, no throw)
 *
 * Run: npx jest src/lib/__tests__/notifications-invite.test.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export {}; // treat as ES module to prevent global-scope variable collisions

/* -------------------------------------------------------------------------- */
/* Mocks                                                                      */
/* -------------------------------------------------------------------------- */

// Track Resend email sends
const mockResendSend = jest.fn();

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: mockResendSend,
    },
  })),
}));

// Track analytics events
const mockTrackSystem = jest.fn();

jest.mock("@/lib/analytics-hooks", () => ({
  trackSystem: mockTrackSystem,
}));

// Console spies
const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

/* -------------------------------------------------------------------------- */
/* Helper: build default params                                               */
/* -------------------------------------------------------------------------- */

const DEFAULT_PARAMS = {
  inviteeEmail: "jane@acme.example.com",
  inviteeName: "Jane Smith",
  role: "admin",
  inviterName: "Bob Owner",
  dealerName: "Acme Motors",
  inviteToken: "abc123tok",
  dealerId: "dlr_acme",
  inviterId: "usr_bob",
};

/* -------------------------------------------------------------------------- */
/* Tests                                                                      */
/* -------------------------------------------------------------------------- */

describe("sendTeamInvite — Resend available", () => {
  let sendTeamInvite: typeof import("../notifications").sendTeamInvite;

  beforeEach(async () => {
    jest.resetModules();
    mockResendSend.mockReset();
    mockTrackSystem.mockReset();
    consoleLogSpy.mockClear();
    consoleErrorSpy.mockClear();

    // Set env vars before importing the module
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.wolfpackauto.com";

    ({ sendTeamInvite } = await import("../notifications"));
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("sends email with correct subject containing dealer name", async () => {
    mockResendSend.mockResolvedValueOnce({ error: null });

    await sendTeamInvite(DEFAULT_PARAMS);
    // Allow async fire-and-forget analytics to settle
    await new Promise((r) => setImmediate(r));

    expect(mockResendSend).toHaveBeenCalledTimes(1);
    const callArgs = mockResendSend.mock.calls[0][0];
    expect(callArgs.subject).toContain("Acme Motors");
    expect(callArgs.to).toContain("jane@acme.example.com");
  });

  it("constructs accept URL with the token", async () => {
    mockResendSend.mockResolvedValueOnce({ error: null });

    await sendTeamInvite(DEFAULT_PARAMS);
    await new Promise((r) => setImmediate(r));

    const callArgs = mockResendSend.mock.calls[0][0];
    expect(callArgs.html).toContain("/admin/accept-invite?token=abc123tok");
    expect(callArgs.html).toContain("https://app.wolfpackauto.com");
  });

  it("uses VERCEL_URL when NEXT_PUBLIC_APP_URL is absent", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_URL = "myapp.vercel.app";

    mockResendSend.mockResolvedValueOnce({ error: null });

    await sendTeamInvite(DEFAULT_PARAMS);
    await new Promise((r) => setImmediate(r));

    const callArgs = mockResendSend.mock.calls[0][0];
    expect(callArgs.html).toContain("https://myapp.vercel.app/admin/accept-invite");

    delete process.env.VERCEL_URL;
  });

  it("emits system.team_invite_sent on success", async () => {
    mockResendSend.mockResolvedValueOnce({ error: null });

    await sendTeamInvite(DEFAULT_PARAMS);
    // Analytics is async via dynamic import — flush the microtask queue
    await new Promise((r) => setTimeout(r, 50));

    expect(mockTrackSystem).toHaveBeenCalledWith(
      "system.team_invite_sent",
      "dlr_acme",
      expect.objectContaining({
        invited_email: "jane@acme.example.com",
        invited_role: "admin",
      }),
    );
  });

  it("does not throw on Resend SDK error", async () => {
    mockResendSend.mockResolvedValueOnce({
      error: new Error("API key invalid"),
    });

    await expect(sendTeamInvite(DEFAULT_PARAMS)).resolves.toBeUndefined();
  });

  it("emits system.notification_send_failed on Resend SDK error", async () => {
    mockResendSend.mockResolvedValueOnce({
      error: new Error("Rate limited"),
    });

    await sendTeamInvite(DEFAULT_PARAMS);
    await new Promise((r) => setTimeout(r, 50));

    expect(mockTrackSystem).toHaveBeenCalledWith(
      "system.notification_send_failed",
      "dlr_acme",
      expect.objectContaining({
        notification_type: "team_invite",
        recipient: "jane@acme.example.com",
      }),
    );
  });

  it("does not throw when Resend rejects with a thrown error", async () => {
    mockResendSend.mockRejectedValueOnce(new Error("Network timeout"));

    await expect(sendTeamInvite(DEFAULT_PARAMS)).resolves.toBeUndefined();
  });

  it("emits system.notification_send_failed on thrown Resend error", async () => {
    mockResendSend.mockRejectedValueOnce(new Error("Network timeout"));

    await sendTeamInvite(DEFAULT_PARAMS);
    await new Promise((r) => setTimeout(r, 50));

    expect(mockTrackSystem).toHaveBeenCalledWith(
      "system.notification_send_failed",
      "dlr_acme",
      expect.objectContaining({
        notification_type: "team_invite",
        recipient: "jane@acme.example.com",
        error: expect.stringContaining("Network timeout"),
      }),
    );
  });
});

describe("sendTeamInvite — no RESEND_API_KEY", () => {
  let sendTeamInvite: typeof import("../notifications").sendTeamInvite;

  beforeEach(async () => {
    jest.resetModules();
    mockResendSend.mockReset();
    mockTrackSystem.mockReset();
    consoleLogSpy.mockClear();

    delete process.env.RESEND_API_KEY;
    process.env.NEXT_PUBLIC_APP_URL = "https://app.wolfpackauto.com";

    ({ sendTeamInvite } = await import("../notifications"));
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("does not throw when RESEND_API_KEY is absent", async () => {
    await expect(sendTeamInvite(DEFAULT_PARAMS)).resolves.toBeUndefined();
  });

  it("does not call Resend when key is absent", async () => {
    await sendTeamInvite(DEFAULT_PARAMS);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("logs the email to console when key is absent", async () => {
    await sendTeamInvite(DEFAULT_PARAMS);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("jane@acme.example.com"),
    );
  });

  it("still emits system.team_invite_sent even without Resend key", async () => {
    await sendTeamInvite(DEFAULT_PARAMS);
    await new Promise((r) => setTimeout(r, 50));

    expect(mockTrackSystem).toHaveBeenCalledWith(
      "system.team_invite_sent",
      "dlr_acme",
      expect.objectContaining({ invited_email: "jane@acme.example.com" }),
    );
  });
});
