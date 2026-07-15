/* eslint-disable @typescript-eslint/no-explicit-any */
export {}; // module marker: keeps top-level test consts out of global scope
/**
 * Lead dedup must find BOTH row shapes.
 *
 *  1. Originally `WHERE email = $1` compared a plaintext address against a
 *     column holding AES-GCM ciphertext (random IV per call). It matched
 *     nothing once PII_ENCRYPTION_KEY existed, so every duplicate got through.
 *  2. Matching the blind index fixed that for hashed rows — and then missed
 *     legacy rows, which predate the key, store PLAINTEXT, and have no hash.
 *
 * Both halves must match. Plaintext-vs-plaintext is safe; the original bug was
 * plaintext-vs-CIPHERTEXT, and an encrypted row always carries a hash so it
 * never reaches the IS NULL branch.
 */

const mockQuery = jest.fn();
const mockRateLimit = jest.fn();
const mockAuditLog = jest.fn();
const mockTrackLead = jest.fn();
const mockCheckIdem = jest.fn();
const mockRecordIdem = jest.fn();

jest.mock("@/lib/db", () => ({ query: (...a: any[]) => mockQuery(...a) }));
jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: any[]) => mockRateLimit(...a),
}));
jest.mock("@/lib/audit-log", () => ({ auditLog: (...a: any[]) => mockAuditLog(...a) }));
jest.mock("@/lib/analytics-hooks", () => ({ trackLead: (...a: any[]) => mockTrackLead(...a) }));
jest.mock("@/lib/idempotency", () => ({
  checkIdempotency: (...a: any[]) => mockCheckIdem(...a),
  recordIdempotency: (...a: any[]) => mockRecordIdem(...a),
  idempotencyKey: () => "k",
}));
jest.mock("@/lib/lead-scorer", () => ({
  scoreLeadIntent: () => ({ score: 1, temperature: "cold", reasons: [] }),
  extractEmailDomain: () => "example.com",
}));

const ORIGINAL_DB = process.env.DATABASE_URL;

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  process.env.DATABASE_URL = "postgres://test";
  mockRateLimit.mockResolvedValue({ allowed: true, remaining: 9, resetAt: 0 });
  // checkIdempotency is SYNCHRONOUS. Returning a promise here makes it truthy,
  // and the route short-circuits with a cached 201 before ever touching the DB.
  mockCheckIdem.mockReturnValue(null);
  // Dedup finds nothing, then INSERT returns a row.
  mockQuery.mockResolvedValue({ rows: [{ id: "new-id", created_at: "2026-01-01" }], rowCount: 1 });
});

afterEach(() => {
  if (ORIGINAL_DB === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DB;
});

function post(body: unknown) {
  return new Request("https://x.test/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

const VALID = {
  dealer_id: "11111111-1111-1111-1111-111111111111",
  first_name: "A",
  last_name: "B",
  email: "Person@Example.com",
  vehicle_interest: "car",
};

/** The dedup SELECT (first query that reads from leads). */
function dedupCall() {
  return mockQuery.mock.calls
    .map((c) => ({ sql: String(c[0]).replace(/\s+/g, " "), params: c[1] as unknown[] }))
    .find((c) => /SELECT id FROM leads/i.test(c.sql));
}

describe("POST /api/leads — dedup query shape", () => {
  it("matches the blind index AND legacy plaintext rows", async () => {
    const { POST } = await import("@/app/api/leads/route");
    await POST(post(VALID));

    const call = dedupCall();
    expect(call).toBeDefined();
    expect(call!.sql).toMatch(/email_hash = \$1/);
    expect(call!.sql).toMatch(/email_hash IS NULL AND email = \$3/);
  });

  it("binds the NORMALIZED address for the legacy fallback", async () => {
    const { POST } = await import("@/app/api/leads/route");
    await POST(post(VALID));

    // Mixed case in, lowercase bound — or legacy rows silently miss.
    expect(dedupCall()!.params[2]).toBe("person@example.com");
  });

  it("stays dealer-scoped and windowed", async () => {
    const { POST } = await import("@/app/api/leads/route");
    await POST(post(VALID));

    const call = dedupCall()!;
    expect(call.sql).toMatch(/dealer_id = \$2/);
    expect(call.sql).toMatch(/30 days/);
    expect(call.sql).toMatch(/deleted_at IS NULL/);
    expect(call.params[1]).toBe(VALID.dealer_id);
  });

  it("compares plaintext ONLY behind the IS NULL guard", async () => {
    // Guards against regressing to plaintext-vs-ciphertext.
    const { POST } = await import("@/app/api/leads/route");
    await POST(post(VALID));

    const sql = dedupCall()!.sql;
    expect(sql.match(/email = \$3/g) ?? []).toHaveLength(1);
    expect(sql).toMatch(/email_hash IS NULL AND email = \$3/);
  });

  it("returns duplicate without inserting when a match is found", async () => {
    mockQuery.mockImplementation((sql: string) =>
      /SELECT id FROM leads/i.test(String(sql))
        ? Promise.resolve({ rows: [{ id: "existing" }], rowCount: 1 })
        : Promise.resolve({ rows: [], rowCount: 0 }),
    );
    const { POST } = await import("@/app/api/leads/route");
    const res = await POST(post(VALID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.duplicate).toBe(true);
    expect(body.id).toBe("existing");
    // No INSERT may run — that is the point of dedup.
    const inserted = mockQuery.mock.calls.some((c) => /INSERT INTO leads/i.test(String(c[0])));
    expect(inserted).toBe(false);
  });

  it("writes email_hash on insert so future dedup can match", async () => {
    // Dedup must find NOTHING, or the route returns early and never inserts.
    mockQuery.mockImplementation((sql: string) =>
      /SELECT id FROM leads/i.test(String(sql))
        ? Promise.resolve({ rows: [], rowCount: 0 })
        : Promise.resolve({ rows: [{ id: "new-id", created_at: "2026-01-01" }], rowCount: 1 }),
    );
    const { POST } = await import("@/app/api/leads/route");
    await POST(post(VALID));

    const ins = mockQuery.mock.calls.find((c) => /INSERT INTO leads/i.test(String(c[0])));
    expect(ins).toBeDefined();
    expect(String(ins![0])).toMatch(/email_hash/);
  });
});
