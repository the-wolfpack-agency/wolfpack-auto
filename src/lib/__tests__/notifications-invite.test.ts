/**
 * notifications-invite.test.ts
 *
 * Unit tests for sendTeamInvite in src/lib/notifications.ts.
 *
 * Transport is Microsoft Graph app-only Mail.Send (the same M365 mechanism
 * beyond-sku and Instinct use) — NOT Resend. Verifies:
 *   - Correct subject, recipient, and accept-URL construction
 *   - Returns { delivered, reason, acceptUrl } — never throws
 *   - When Graph delivers: returns delivered=true and emits team_invite_sent
 *   - When Graph is unconfigured: returns not_configured + the accept link,
 *     does NOT emit a "sent" event, and never calls the transport
 *   - When Graph errors: returns delivered=false with the reason and emits
 *     notification_send_failed, still returning the copyable accept link
 *
 * Run: npx jest src/lib/__tests__/notifications-invite.test.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export {}; // treat as ES module to prevent global-scope variable collisions

/* -------------------------------------------------------------------------- */
/* Mocks                                                                      */
/* -------------------------------------------------------------------------- */

// Microsoft Graph transport seam.
const mockSendViaGraph = jest.fn();
let mockGraphConfigured = true;

jest.mock("@/lib/mail/send-via-graph", () => ({
  sendViaGraph: (...args: any[]) => mockSendViaGraph(...args),
  isGraphMailConfigured: () => mockGraphConfigured,
}));

// Track analytics events.
const mockTrackSystem = jest.fn();

jest.mock("@/lib/analytics-hooks", () => ({
  trackSystem: mockTrackSystem,
}));

const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
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

const flush = () => new Promise((r) => setTimeout(r, 50));

/* -------------------------------------------------------------------------- */
/* Tests                                                                      */
/* -------------------------------------------------------------------------- */

describe("sendTeamInvite — Graph configured", () => {
  let sendTeamInvite: typeof import("../notifications").sendTeamInvite;

  beforeEach(async () => {
    jest.resetModules();
    mockSendViaGraph.mockReset();
    mockTrackSystem.mockReset();
    consoleWarnSpy.mockClear();
    consoleErrorSpy.mockClear();
    mockGraphConfigured = true;

    process.env.NEXT_PUBLIC_APP_URL = "https://app.wolfpackauto.com";
    ({ sendTeamInvite } = await import("../notifications"));
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXTAUTH_URL;
    delete process.env.VERCEL_URL;
  });

  it("sends via Graph with correct subject and recipient", async () => {
    mockSendViaGraph.mockResolvedValueOnce({ delivered: true, reason: "ok" });

    const result = await sendTeamInvite(DEFAULT_PARAMS);

    expect(mockSendViaGraph).toHaveBeenCalledTimes(1);
    const callArgs = mockSendViaGraph.mock.calls[0][0];
    expect(callArgs.subject).toContain("Acme Motors");
    expect(callArgs.to).toBe("jane@acme.example.com");
    expect(result.delivered).toBe(true);
    expect(result.reason).toBe("ok");
    expect(result.provider).toBe("graph");
  });

  it("constructs the accept URL with the token and base URL", async () => {
    mockSendViaGraph.mockResolvedValueOnce({ delivered: true, reason: "ok" });

    const result = await sendTeamInvite(DEFAULT_PARAMS);

    expect(result.acceptUrl).toBe(
      "https://app.wolfpackauto.com/admin/accept-invite?token=abc123tok",
    );
    const callArgs = mockSendViaGraph.mock.calls[0][0];
    expect(callArgs.html).toContain("/admin/accept-invite?token=abc123tok");
  });

  it("falls back to NEXTAUTH_URL, then VERCEL_URL, for the base URL", async () => {
    jest.resetModules();
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXTAUTH_URL = "https://dealer.example.com";
    ({ sendTeamInvite } = await import("../notifications"));
    mockSendViaGraph.mockResolvedValueOnce({ delivered: true, reason: "ok" });

    let result = await sendTeamInvite(DEFAULT_PARAMS);
    expect(result.acceptUrl).toBe(
      "https://dealer.example.com/admin/accept-invite?token=abc123tok",
    );

    jest.resetModules();
    delete process.env.NEXTAUTH_URL;
    process.env.VERCEL_URL = "myapp.vercel.app";
    ({ sendTeamInvite } = await import("../notifications"));
    mockSendViaGraph.mockResolvedValueOnce({ delivered: true, reason: "ok" });

    result = await sendTeamInvite(DEFAULT_PARAMS);
    expect(result.acceptUrl).toBe(
      "https://myapp.vercel.app/admin/accept-invite?token=abc123tok",
    );
  });

  it("emits system.team_invite_sent on delivery", async () => {
    mockSendViaGraph.mockResolvedValueOnce({ delivered: true, reason: "ok" });

    await sendTeamInvite(DEFAULT_PARAMS);
    await flush();

    expect(mockTrackSystem).toHaveBeenCalledWith(
      "system.team_invite_sent",
      "dlr_acme",
      expect.objectContaining({
        invited_email: "jane@acme.example.com",
        invited_role: "admin",
      }),
    );
  });

  it("returns the reason and accept link (never throws) when Graph errors", async () => {
    mockSendViaGraph.mockResolvedValueOnce({
      delivered: false,
      reason: "scope_missing",
      detail: "403 ...",
    });

    const result = await sendTeamInvite(DEFAULT_PARAMS);

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe("scope_missing");
    expect(result.acceptUrl).toContain("/admin/accept-invite?token=abc123tok");
  });

  it("emits system.notification_send_failed on a Graph error", async () => {
    mockSendViaGraph.mockResolvedValueOnce({
      delivered: false,
      reason: "scope_missing",
    });

    await sendTeamInvite(DEFAULT_PARAMS);
    await flush();

    expect(mockTrackSystem).toHaveBeenCalledWith(
      "system.notification_send_failed",
      "dlr_acme",
      expect.objectContaining({
        notification_type: "team_invite",
        recipient: "jane@acme.example.com",
      }),
    );
  });

  it("does not emit team_invite_sent when delivery fails", async () => {
    mockSendViaGraph.mockResolvedValueOnce({
      delivered: false,
      reason: "provider_error",
    });

    await sendTeamInvite(DEFAULT_PARAMS);
    await flush();

    expect(mockTrackSystem).not.toHaveBeenCalledWith(
      "system.team_invite_sent",
      expect.anything(),
      expect.anything(),
    );
  });

  it("does not throw if the transport itself throws", async () => {
    mockSendViaGraph.mockRejectedValueOnce(new Error("boom"));

    const result = await sendTeamInvite(DEFAULT_PARAMS);
    expect(result.delivered).toBe(false);
    expect(result.acceptUrl).toContain("/admin/accept-invite?token=abc123tok");
  });
});

describe("sendTeamInvite — Graph NOT configured", () => {
  let sendTeamInvite: typeof import("../notifications").sendTeamInvite;

  beforeEach(async () => {
    jest.resetModules();
    mockSendViaGraph.mockReset();
    mockTrackSystem.mockReset();
    consoleWarnSpy.mockClear();
    mockGraphConfigured = false;

    process.env.NEXT_PUBLIC_APP_URL = "https://app.wolfpackauto.com";
    ({ sendTeamInvite } = await import("../notifications"));
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  it("returns not_configured with the accept link, and never sends", async () => {
    const result = await sendTeamInvite(DEFAULT_PARAMS);

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe("not_configured");
    expect(result.acceptUrl).toBe(
      "https://app.wolfpackauto.com/admin/accept-invite?token=abc123tok",
    );
    expect(mockSendViaGraph).not.toHaveBeenCalled();
  });

  it("does NOT emit team_invite_sent when nothing was sent", async () => {
    await sendTeamInvite(DEFAULT_PARAMS);
    await flush();

    expect(mockTrackSystem).not.toHaveBeenCalledWith(
      "system.team_invite_sent",
      expect.anything(),
      expect.anything(),
    );
  });
});
