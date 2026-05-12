/**
 * Unit tests for the BYO credentials store: add, load, rotate, revoke,
 * list, delete, recordCredentialError. Mocks @/lib/db so we exercise the
 * SQL shape + arg order without a live Postgres.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockQuery = jest.fn();
const mockTrack = jest.fn();
const mockAudit = jest.fn();

jest.mock("@/lib/db", () => ({
  query: (...args: any[]) => mockQuery(...args),
}));
jest.mock("@/lib/analytics-hooks", () => ({
  trackCredentials: (...args: any[]) => mockTrack(...args),
  trackInventoryMarketIntel: (...args: any[]) => mockTrack(...args),
}));
jest.mock("@/lib/audit-log", () => ({
  auditLog: (...args: any[]) => mockAudit(...args),
}));

import {
  addCredential,
  deleteCredential,
  listCredentials,
  loadCredential,
  recordCredentialError,
  revokeCredential,
  rotateCredential,
} from "@/lib/external-credentials/index";
import { generateTestKey } from "@/lib/external-credentials/crypto-vault";

const DEALER = "00000000-0000-4000-a000-000000000001";
const CRED_ID = "11111111-2222-4333-9444-555555555555";

beforeEach(() => {
  mockQuery.mockReset();
  mockTrack.mockReset();
  mockAudit.mockReset();
  process.env.EXTERNAL_CREDENTIAL_KEY = generateTestKey();
});

describe("addCredential", () => {
  it("returns a synthetic record in shadow mode (no DATABASE_URL)", async () => {
    delete process.env.DATABASE_URL;
    const rec = await addCredential({
      dealerId: DEALER,
      provider: "carfax",
      plaintext: "secret-key",
    });
    expect(rec.dealerId).toBe(DEALER);
    expect(rec.provider).toBe("carfax");
    expect(rec.status).toBe("active");
    expect(rec.id).toMatch(/^shadow-/);
    expect(mockTrack).toHaveBeenCalledWith(
      "credentials.byo_added",
      DEALER,
      expect.objectContaining({ provider: "carfax" }),
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects unknown providers", async () => {
    delete process.env.DATABASE_URL;
    await expect(
      addCredential({
        dealerId: DEALER,
        provider: "bogus" as any,
        plaintext: "x",
      }),
    ).rejects.toThrow(/unknown provider/i);
  });

  it("writes encrypted blob to dealer_external_credentials when DB is up", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: CRED_ID,
          dealer_id: DEALER,
          provider: "carfax",
          label: null,
          status: "active",
          created_at: new Date(),
          rotated_at: null,
          last_used_at: null,
          last_error: null,
        },
      ],
    });
    // Audit row insert
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const rec = await addCredential({
      dealerId: DEALER,
      provider: "carfax",
      plaintext: "secret-key",
      actorUserId: "u1",
    });
    expect(rec.id).toBe(CRED_ID);
    expect(rec.provider).toBe("carfax");

    // First call should be INSERT into dealer_external_credentials with
    // the dealer_id, provider, label, ciphertext, iv as parameters.
    const firstCall = mockQuery.mock.calls[0];
    expect(firstCall[0]).toMatch(/INSERT INTO dealer_external_credentials/);
    expect(firstCall[1][0]).toBe(DEALER);
    expect(firstCall[1][1]).toBe("carfax");
    expect(Buffer.isBuffer(firstCall[1][3])).toBe(true);
    expect(Buffer.isBuffer(firstCall[1][4])).toBe(true);

    // Audit row insert
    const secondCall = mockQuery.mock.calls[1];
    expect(secondCall[0]).toMatch(/INSERT INTO external_credential_audit/);
    expect(secondCall[1][2]).toBe("added");
    expect(secondCall[1][3]).toBe("u1");

    expect(mockTrack).toHaveBeenCalledWith(
      "credentials.byo_added",
      DEALER,
      expect.objectContaining({ provider: "carfax" }),
    );
  });
});

describe("loadCredential", () => {
  it("returns null in shadow mode", async () => {
    delete process.env.DATABASE_URL;
    const res = await loadCredential(DEALER, "carfax");
    expect(res).toBeNull();
  });

  it("returns null when no row matches", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await loadCredential(DEALER, "carfax");
    expect(res).toBeNull();
  });

  it("decrypts and returns the plaintext when the row is present", async () => {
    process.env.DATABASE_URL = "postgres://test";
    // First insert real blob via addCredential to get matching ciphertext.
    const { encryptCredential } = await import("@/lib/external-credentials/crypto-vault");
    const blob = encryptCredential("real-api-key");

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: CRED_ID,
          dealer_id: DEALER,
          provider: "carfax",
          label: null,
          status: "active",
          credential_blob_encrypted: blob.ciphertext,
          credential_iv: blob.iv,
          created_at: new Date(),
          rotated_at: null,
          last_used_at: null,
          last_error: null,
        },
      ],
    });

    const res = await loadCredential(DEALER, "carfax");
    expect(res).not.toBeNull();
    expect(res!.plaintext).toBe("real-api-key");
    expect(res!.record.provider).toBe("carfax");
  });

  it("returns null + writes use_failed audit row on decrypt failure", async () => {
    process.env.DATABASE_URL = "postgres://test";
    // Bad ciphertext — short / random Buffer.
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: CRED_ID,
          dealer_id: DEALER,
          provider: "carfax",
          label: null,
          status: "active",
          credential_blob_encrypted: Buffer.from("not-real-cipher"),
          credential_iv: Buffer.alloc(12),
          created_at: new Date(),
          rotated_at: null,
          last_used_at: null,
          last_error: null,
        },
      ],
    });
    // audit insert
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await loadCredential(DEALER, "carfax");
    expect(res).toBeNull();
    const auditCall = mockQuery.mock.calls.find((c) =>
      /external_credential_audit/.test(c[0]),
    );
    expect(auditCall).toBeTruthy();
    expect(auditCall![1][2]).toBe("use_failed");
  });
});

describe("rotateCredential", () => {
  it("returns null in shadow mode", async () => {
    delete process.env.DATABASE_URL;
    const res = await rotateCredential({
      dealerId: DEALER,
      credentialId: CRED_ID,
      newPlaintext: "new",
    });
    expect(res).toBeNull();
  });

  it("returns null when no row matches", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await rotateCredential({
      dealerId: DEALER,
      credentialId: CRED_ID,
      newPlaintext: "new",
    });
    expect(res).toBeNull();
  });

  it("emits analytics + audit on successful rotate", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: CRED_ID,
          dealer_id: DEALER,
          provider: "carfax",
          label: null,
          status: "active",
          created_at: new Date(),
          rotated_at: new Date(),
          last_used_at: null,
          last_error: null,
        },
      ],
    });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await rotateCredential({
      dealerId: DEALER,
      credentialId: CRED_ID,
      newPlaintext: "rotated-key",
      actorUserId: "u1",
    });
    expect(res).not.toBeNull();
    expect(mockTrack).toHaveBeenCalledWith(
      "credentials.byo_rotated",
      DEALER,
      expect.any(Object),
    );
    expect(mockAudit).toHaveBeenCalledWith(
      "credentials.byo_rotated",
      expect.any(Object),
      "u1",
      DEALER,
    );
  });
});

describe("revokeCredential", () => {
  it("returns null when DB is shadow mode", async () => {
    delete process.env.DATABASE_URL;
    const res = await revokeCredential(DEALER, CRED_ID, "u1");
    expect(res).toBeNull();
  });

  it("flips status to revoked + emits signals", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: CRED_ID,
          dealer_id: DEALER,
          provider: "carfax",
          label: null,
          status: "revoked",
          created_at: new Date(),
          rotated_at: null,
          last_used_at: null,
          last_error: null,
        },
      ],
    });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await revokeCredential(DEALER, CRED_ID, "u1");
    expect(res!.status).toBe("revoked");
    expect(mockTrack).toHaveBeenCalledWith(
      "credentials.byo_revoked",
      DEALER,
      expect.any(Object),
    );
  });
});

describe("listCredentials", () => {
  it("returns [] in shadow mode", async () => {
    delete process.env.DATABASE_URL;
    expect(await listCredentials(DEALER)).toEqual([]);
  });

  it("filters revoked by default", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await listCredentials(DEALER);
    expect(mockQuery.mock.calls[0][0]).toMatch(/status <> 'revoked'/);
  });

  it("includes revoked when requested", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await listCredentials(DEALER, { includeRevoked: true });
    expect(mockQuery.mock.calls[0][0]).not.toMatch(/status <> 'revoked'/);
  });

  it("filters by provider when supplied", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await listCredentials(DEALER, { provider: "carfax" });
    expect(mockQuery.mock.calls[0][1]).toContain("carfax");
  });
});

describe("deleteCredential + recordCredentialError", () => {
  it("returns false in shadow mode (delete)", async () => {
    delete process.env.DATABASE_URL;
    const ok = await deleteCredential(DEALER, CRED_ID);
    expect(ok).toBe(false);
  });

  it("returns true when delete affects a row", async () => {
    process.env.DATABASE_URL = "postgres://test";
    // audit insert first
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // delete returns the deleted row
    mockQuery.mockResolvedValueOnce({ rows: [{ id: CRED_ID }] });
    const ok = await deleteCredential(DEALER, CRED_ID, "u1");
    expect(ok).toBe(true);
  });

  it("recordCredentialError writes an UPDATE + audit row", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await recordCredentialError(DEALER, CRED_ID, "boom");
    expect(mockQuery.mock.calls[0][0]).toMatch(/UPDATE dealer_external_credentials/);
    expect(mockQuery.mock.calls[1][0]).toMatch(/INSERT INTO external_credential_audit/);
    expect(mockQuery.mock.calls[1][1][2]).toBe("use_failed");
  });
});
