/**
 * send-via-graph.test.ts
 *
 * Unit tests for the Microsoft Graph app-only mail transport. Verifies the
 * status → reason mapping the invite UI depends on, and that a mail misconfig
 * never throws (the invite row has already persisted by the time this runs).
 *
 * Run: npx jest src/lib/__tests__/send-via-graph.test.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export {};

const mockGetToken = jest.fn();
jest.mock("@/lib/microsoft-graph", () => ({
  getAppOnlyToken: () => mockGetToken(),
}));

const ARGS = {
  to: "jane@acme.example.com",
  subject: "You're invited",
  text: "link",
  html: "<p>link</p>",
};

describe("sendViaGraph", () => {
  let sendViaGraph: typeof import("../mail/send-via-graph").sendViaGraph;
  let isGraphMailConfigured: typeof import("../mail/send-via-graph").isGraphMailConfigured;
  const realFetch = global.fetch;

  beforeEach(async () => {
    jest.resetModules();
    mockGetToken.mockReset();
    process.env.MS_MAIL_FROM = "invites@wolfpackauto.com";
    ({ sendViaGraph, isGraphMailConfigured } = await import(
      "../mail/send-via-graph"
    ));
  });

  afterEach(() => {
    delete process.env.MS_MAIL_FROM;
    global.fetch = realFetch;
  });

  it("isGraphMailConfigured reflects MS_MAIL_FROM presence", () => {
    expect(isGraphMailConfigured()).toBe(true);
    delete process.env.MS_MAIL_FROM;
    expect(isGraphMailConfigured()).toBe(false);
  });

  it("returns no_mail_from when the sending mailbox is unset", async () => {
    delete process.env.MS_MAIL_FROM;
    const res = await sendViaGraph(ARGS);
    expect(res).toEqual({ delivered: false, reason: "no_mail_from" });
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("returns no_app_token when no app-only token resolves", async () => {
    mockGetToken.mockResolvedValueOnce(null);
    const res = await sendViaGraph(ARGS);
    expect(res).toEqual({ delivered: false, reason: "no_app_token" });
  });

  it("returns delivered on HTTP 202", async () => {
    mockGetToken.mockResolvedValueOnce("tok");
    global.fetch = jest.fn().mockResolvedValueOnce({
      status: 202,
      text: async () => "",
    }) as any;

    const res = await sendViaGraph(ARGS);
    expect(res.delivered).toBe(true);
    expect(res.reason).toBe("ok");
  });

  it("maps HTTP 403 to scope_missing", async () => {
    mockGetToken.mockResolvedValueOnce("tok");
    global.fetch = jest.fn().mockResolvedValueOnce({
      status: 403,
      text: async () => "AccessDenied",
    }) as any;

    const res = await sendViaGraph(ARGS);
    expect(res.delivered).toBe(false);
    expect(res.reason).toBe("scope_missing");
  });

  it("maps other non-202 statuses to provider_error", async () => {
    mockGetToken.mockResolvedValueOnce("tok");
    global.fetch = jest.fn().mockResolvedValueOnce({
      status: 500,
      text: async () => "boom",
    }) as any;

    const res = await sendViaGraph(ARGS);
    expect(res.delivered).toBe(false);
    expect(res.reason).toBe("provider_error");
    expect(res.detail).toContain("500");
  });

  it("never throws on a network error", async () => {
    mockGetToken.mockResolvedValueOnce("tok");
    global.fetch = jest.fn().mockRejectedValueOnce(new Error("ECONNRESET")) as any;

    const res = await sendViaGraph(ARGS);
    expect(res.delivered).toBe(false);
    expect(res.reason).toBe("provider_error");
  });

  it("sends from MS_MAIL_FROM with an HTML body and Bearer token", async () => {
    mockGetToken.mockResolvedValueOnce("tok-123");
    const fetchMock = jest.fn().mockResolvedValueOnce({
      status: 202,
      text: async () => "",
    });
    global.fetch = fetchMock as any;

    await sendViaGraph({ ...ARGS, fromName: "Acme Motors" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(
      "/users/invites%40wolfpackauto.com/sendMail",
    );
    expect(init.headers.Authorization).toBe("Bearer tok-123");
    const body = JSON.parse(init.body);
    expect(body.message.from.emailAddress.address).toBe(
      "invites@wolfpackauto.com",
    );
    expect(body.message.from.emailAddress.name).toBe("Acme Motors");
    expect(body.message.body.contentType).toBe("HTML");
    expect(body.message.toRecipients[0].emailAddress.address).toBe(
      "jane@acme.example.com",
    );
  });
});
