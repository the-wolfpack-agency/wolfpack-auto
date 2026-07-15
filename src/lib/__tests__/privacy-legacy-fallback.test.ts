/* eslint-disable @typescript-eslint/no-explicit-any */
export {}; // module marker: keeps top-level test consts out of global scope
/**
 * CCPA erasure must find BOTH row shapes in `leads`.
 *
 * History, because it is easy to get this wrong in either direction:
 *
 *  1. Originally erasure did `WHERE email = $1` with a plaintext address. Once
 *     PII_ENCRYPTION_KEY exists, that column holds AES-GCM ciphertext with a
 *     random IV, so it matched NOTHING and erasure anonymized zero rows while
 *     still reporting status "completed".
 *  2. Matching on the blind index fixed that — but only for rows that HAVE a
 *     hash. Rows written before the key existed store PLAINTEXT and have no
 *     hash, so they were then missed instead. Same silent failure, other half
 *     of the table.
 *
 * So: match the hash, and fall back to plaintext ONLY when the hash is absent.
 * Plaintext-vs-plaintext is safe. The original bug was plaintext-vs-CIPHERTEXT,
 * which cannot recur here because an encrypted row always carries a hash and so
 * never reaches the IS NULL branch.
 */

const mockQuery = jest.fn();
jest.mock("@/lib/db", () => ({ query: (...a: any[]) => mockQuery(...a) }));

const ORIGINAL_DB = process.env.DATABASE_URL;

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  process.env.DATABASE_URL = "postgres://test";
  mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });
});

afterEach(() => {
  if (ORIGINAL_DB === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DB;
});

/** The UPDATE issued against `leads` (the only hash-backed table). */
function leadsUpdate() {
  return mockQuery.mock.calls
    .map((c) => ({ sql: String(c[0]), params: c[1] as unknown[] }))
    .find((c) => /UPDATE leads/.test(c.sql));
}

describe("deleteCustomerData — leads", () => {
  it("matches the blind index AND legacy plaintext rows", async () => {
    const { deleteCustomerData } = await import("@/lib/privacy");
    await deleteCustomerData("Person@Example.com", "dealer-1");

    const call = leadsUpdate();
    expect(call).toBeDefined();
    const sql = call!.sql.replace(/\s+/g, " ");

    // Hash match (rows written after the key existed).
    expect(sql).toMatch(/email_hash = \$1/);
    // Legacy fallback, gated on the hash being absent.
    expect(sql).toMatch(/email_hash IS NULL AND email = \$3/);
    // Normalized plaintext is bound for the fallback.
    expect(call!.params[2]).toBe("person@example.com");
    // Still dealer-scoped.
    expect(call!.params[1]).toBe("dealer-1");
  });

  it("anonymizes the email column and clears the hash", async () => {
    const { deleteCustomerData } = await import("@/lib/privacy");
    await deleteCustomerData("person@example.com", "dealer-1");

    const sql = leadsUpdate()!.sql.replace(/\s+/g, " ");
    // The address must be destroyed...
    expect(sql).toMatch(/SET email = 'deleted-' \|\| id/);
    // ...and the derived match key must not survive it.
    expect(sql).toMatch(/email_hash = NULL/);
  });

  it("never matches the plaintext column when a hash IS present", async () => {
    // Guards against regressing to bug #1: an encrypted row must never be
    // compared against a plaintext address.
    const { deleteCustomerData } = await import("@/lib/privacy");
    await deleteCustomerData("person@example.com", "dealer-1");

    const sql = leadsUpdate()!.sql.replace(/\s+/g, " ");
    // The only plaintext comparison is gated behind IS NULL.
    const plaintextComparisons = sql.match(/email = \$3/g) ?? [];
    expect(plaintextComparisons).toHaveLength(1);
    expect(sql).toMatch(/email_hash IS NULL AND email = \$3/);
  });

  it("reports the leads category when rows were anonymized", async () => {
    mockQuery.mockImplementation((sql: string) =>
      /UPDATE leads/.test(String(sql))
        ? Promise.resolve({ rowCount: 1, rows: [] })
        : Promise.resolve({ rowCount: 0, rows: [] }),
    );
    const { deleteCustomerData } = await import("@/lib/privacy");
    const res = await deleteCustomerData("person@example.com", "dealer-1");
    expect(res.data_categories_deleted).toContain("leads");
    expect(res.status).toBe("completed");
  });
});

describe("deleteCustomerData — plaintext tables are unchanged", () => {
  it("matches plain email with two params on non-hash tables", async () => {
    const { deleteCustomerData } = await import("@/lib/privacy");
    await deleteCustomerData("person@example.com", "dealer-1");

    const call = mockQuery.mock.calls
      .map((c) => ({ sql: String(c[0]), params: c[1] as unknown[] }))
      .find((c) => /UPDATE reviews/.test(c.sql));

    expect(call).toBeDefined();
    const sql = call!.sql.replace(/\s+/g, " ");
    expect(sql).toMatch(/WHERE customer_email = \$1 AND dealer_id = \$2/);
    expect(sql).not.toMatch(/IS NULL/);
    expect(call!.params).toHaveLength(2);
  });
});
