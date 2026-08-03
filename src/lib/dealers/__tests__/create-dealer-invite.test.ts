/**
 * Creating a dealer invites its admin by email.
 *
 * It used to mint a temp password and print it on the success screen for
 * somebody to relay by hand. Nothing was ever emailed, so "email delivery is
 * not set up" was exactly right. Instinct and the Porsche Experience OS both
 * email an invite link and let the person set their own password; this now does
 * the same, through the same sendTeamInvite path the onboarding wizard uses.
 */

export {};

const mockSend = jest.fn();
jest.mock("@/lib/notifications", () => ({ sendTeamInvite: (...a: unknown[]) => mockSend(...a) }));
jest.mock("@/lib/analytics-hooks", () => ({ trackSystem: jest.fn() }));

const mockQuery = jest.fn();
jest.mock("@/lib/db", () => ({ query: (...a: unknown[]) => mockQuery(...a) }));

import { createDealer } from "../create-dealer";

const INPUT = { name: "Acme Motors", slug: "acme-motors", email: "owner@acme.test" };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATABASE_URL = "postgresql://test";
  mockSend.mockResolvedValue({ delivered: true, acceptUrl: "https://x.test/admin/accept-invite?token=abc" });
  mockQuery.mockImplementation((sql: string) => {
    if (/SELECT id FROM dealers/.test(sql)) return Promise.resolve({ rows: [] });
    if (/INSERT INTO dealers/.test(sql)) {
      return Promise.resolve({ rows: [{ id: "d1", name: "Acme Motors", slug: "acme-motors" }] });
    }
    // A fresh address: the admin row is created.
    if (/INSERT INTO dealer_users/.test(sql)) return Promise.resolve({ rows: [], rowCount: 1 });
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
});

describe("the invite", () => {
  it("emails the dealer's admin", async () => {
    const r = await createDealer(INPUT);
    expect(r.ok).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ inviteeEmail: "owner@acme.test", role: "owner", dealerName: "Acme Motors" }),
    );
    if (r.ok) expect(r.invite).toMatchObject({ email: "owner@acme.test", delivered: true });
  });

  it("stores an inactive user with a token, not a password", async () => {
    // Accepting the invite is what sets a password and activates the account.
    await createDealer(INPUT);
    const insert = mockQuery.mock.calls.find(([sql]) => /INSERT INTO dealer_users/.test(sql));
    expect(insert).toBeDefined();
    expect(insert![0]).toMatch(/invite_token/);
    expect(insert![0]).toMatch(/password_hash, role, is_active/);
    // NULL password, false is_active.
    expect(insert![0]).toMatch(/NULL, 'owner', false/);
  });

  it("uses a token long enough not to be guessable", async () => {
    await createDealer(INPUT);
    const insert = mockQuery.mock.calls.find(([sql]) => /INSERT INTO dealer_users/.test(sql))!;
    const token = insert[1][3] as string;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("expires the invite in 7 days", async () => {
    await createDealer(INPUT);
    const insert = mockQuery.mock.calls.find(([sql]) => /INSERT INTO dealer_users/.test(sql))!;
    const days = (Date.parse(insert[1][4] as string) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });
});

describe("when the email cannot be sent", () => {
  it("still creates the dealer and hands back the link", async () => {
    // A mail outage must never cost somebody the dealer they just created.
    mockSend.mockResolvedValue({ delivered: false, reason: "not_configured", acceptUrl: "https://x.test/a?token=t" });
    const r = await createDealer(INPUT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.invite.delivered).toBe(false);
      expect(r.invite.reason).toBe("not_configured");
      expect(r.invite.accept_url).toContain("token=");
    }
  });

  it("survives sendTeamInvite throwing", async () => {
    mockSend.mockRejectedValue(new Error("smtp down"));
    const r = await createDealer(INPUT);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.invite.delivered).toBe(false);
  });

  it("never reports delivered when nothing was sent", async () => {
    // Saying "invite sent" when it was not is how somebody waits forever.
    mockSend.mockResolvedValue({ delivered: false, reason: "not_configured", acceptUrl: "u" });
    const r = await createDealer(INPUT);
    if (r.ok) expect(r.invite.delivered).toBe(false);
  });
});

describe("shadow mode", () => {
  it("reports the invite as not delivered rather than pretending", async () => {
    delete process.env.DATABASE_URL;
    const r = await createDealer(INPUT);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.invite).toMatchObject({ delivered: false, reason: "shadow_mode" });
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("an address that already belongs to somebody", () => {
  /**
   * The incident. The upsert used to be
   *   ON CONFLICT (email) DO UPDATE SET dealer_id = EXCLUDED.dealer_id, role = 'owner'
   * so creating a dealer with an existing user's address MOVED that person to
   * the new dealer and changed their role. A real account was pulled out of its
   * own workspace and signed in to an empty tenant.
   */
  beforeEach(() => {
    mockQuery.mockImplementation((sql: string) => {
      if (/SELECT id FROM dealers/.test(sql)) return Promise.resolve({ rows: [] });
      if (/INSERT INTO dealers/.test(sql)) {
        return Promise.resolve({ rows: [{ id: "d1", name: "Acme Motors", slug: "acme-motors" }] });
      }
      // ON CONFLICT DO NOTHING: the row already existed, nothing written.
      if (/INSERT INTO dealer_users/.test(sql)) return Promise.resolve({ rows: [], rowCount: 0 });
      return Promise.resolve({ rows: [], rowCount: 0 });
    });
  });

  it("never reassigns the existing account to the new dealer", async () => {
    await createDealer(INPUT);
    const insert = mockQuery.mock.calls.find(([sql]) => /INSERT INTO dealer_users/.test(sql))!;
    expect(insert[0]).toMatch(/ON CONFLICT \(email\) DO NOTHING/i);
    expect(insert[0]).not.toMatch(/DO UPDATE/i);
    expect(insert[0]).not.toMatch(/dealer_id\s*=\s*EXCLUDED/i);
  });

  it("still creates the dealer", async () => {
    // The dealer is what was asked for; the account is somebody else's.
    const r = await createDealer(INPUT);
    expect(r.ok).toBe(true);
  });

  it("sends no invite, because no token was stored", async () => {
    await createDealer(INPUT);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("reports account_exists rather than claiming an invite went out", async () => {
    const r = await createDealer(INPUT);
    if (r.ok) {
      expect(r.invite.delivered).toBe(false);
      expect(r.invite.reason).toBe("account_exists");
      expect(r.invite.accept_url).toBe("");
    }
  });
});
